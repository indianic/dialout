import * as path from 'path';
import { parse as parseToml } from 'smol-toml';
import { redactArgs } from './redact';
import type { AiCommand, McpServerInfo, CapabilityDeps } from './types';
import { resolveDeps } from './fsdeps';

const MIN_ROWS = 3;

function cell(s: string): string {
  return s.replace(/`/g, '').trim();
}

// Grok has no user commands directory: its slash commands are built in, and
// the README that ships beside the binary is the only machine-readable list.
// Parsing it at runtime means the menu tracks the installed version instead of
// rotting in our source — the trade is that a restructure breaks the parse, so
// failure is all-or-nothing and loud rather than a silently partial menu.
export function parseGrokCommandTable(readme: string): AiCommand[] {
  const text = String(readme || '');
  const start = text.search(/^#{2,4}\s+Slash Commands\s*$/m);
  if (start === -1) return [];

  const rest = text.slice(start).split('\n').slice(1);
  const out: AiCommand[] = [];

  for (const line of rest) {
    if (/^#{1,6}\s/.test(line)) break;          // next heading ends the section
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').slice(1, -1).map(cell);
    if (cols.length < 3) continue;
    const m = cols[0].match(/^\/([A-Za-z0-9-]+)/);
    if (!m) continue;                            // header and --- rows
    const alias = cols[1].match(/^\/([A-Za-z0-9-]+)/);
    out.push({
      name: m[1],
      alias: alias ? alias[1] : undefined,
      description: cols[2],
      source: 'builtin',
    });
  }

  return out.length >= MIN_ROWS ? out : [];
}

export function grokCommands(deps: CapabilityDeps = {}): AiCommand[] {
  const d = resolveDeps(deps);
  let readme: string | null = null;
  try { readme = d.readFile(path.join(d.homeDir(), '.grok', 'README.md')); } catch { readme = null; }
  return readme ? parseGrokCommandTable(readme) : [];
}

function readToml(file: string, d: Required<CapabilityDeps>): any {
  let raw: string | null = null;
  try { raw = d.readFile(file); } catch { return null; }
  if (!raw) return null;
  try { return parseToml(raw); } catch { return null; }
}

function toGrokServer(name: string, cfg: any, scope: McpServerInfo['scope'], origin: string): McpServerInfo {
  const http = !!(cfg && (cfg.url || cfg.headers));
  return {
    name,
    scope,
    origin,
    transport: http ? 'http' : 'stdio',
    enabled: cfg?.enabled !== false,
    command: http ? undefined : (cfg?.command ? String(cfg.command) : undefined),
    args: http ? undefined : redactArgs(cfg?.args),
  };
}

// Documented precedence: ~/.grok < <repo-root>/.grok < <cwd>/.grok, and a
// same-named project server REPLACES the global entirely — fields are not
// merged, so an omitted field takes its default rather than inheriting.
// Implemented literally, because showing a server with a command it does not
// actually run is worse than showing none.
export function grokMcpServers(
  cwd: string,
  repoRoot: string,
  deps: CapabilityDeps = {}
): McpServerInfo[] {
  const d = resolveDeps(deps);
  const merged = new Map<string, McpServerInfo>();

  const layers: Array<[string, McpServerInfo['scope']]> = [
    [path.join(d.homeDir(), '.grok', 'config.toml'), 'global'],
    [path.join(repoRoot, '.grok', 'config.toml'), 'project'],
    [path.join(cwd, '.grok', 'config.toml'), 'project'],
  ];

  for (const [file, scope] of layers) {
    const cfg = readToml(file, d);
    const servers = cfg?.mcp_servers;
    if (!servers || typeof servers !== 'object') continue;
    for (const [name, entry] of Object.entries(servers)) {
      // set() replaces wholesale — which is exactly the documented rule.
      merged.set(name, toGrokServer(name, entry, scope, file));
    }
  }

  return Array.from(merged.values());
}
