import * as path from 'path';
import { describeCommand } from './describe';
import { redactArgs } from './redact';
import type { AiCommand, McpServerInfo, CapabilityDeps } from './types';
import { resolveDeps } from './fsdeps';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function readCommandDir(
  dir: string,
  source: AiCommand['source'],
  prefix: string,
  d: Required<CapabilityDeps>
): AiCommand[] {
  const out: AiCommand[] = [];
  for (const entry of safe(() => d.readDir(dir), [] as string[])) {
    if (!entry.endsWith('.md')) continue;
    const body = safe<string | null>(() => d.readFile(path.join(dir, entry)), null);
    out.push({
      name: prefix + entry.slice(0, -3),
      description: describeCommand(body || ''),
      source,
    });
  }
  return out;
}

// Plugin command directories, measured rather than assumed. Three shapes
// really exist under ~/.claude/plugins/marketplaces:
//
//   <marketplace>/commands                        (marketplace is the plugin)
//   <marketplace>/<plugin>/commands               (e.g. pdf-viewer)
//   <marketplace>/plugins/<plugin>/commands       (the common case, 25 of 32)
//   <marketplace>/external_plugins/<plugin>/commands
//
// A generic "find any directory named commands" walk looked tidier and was
// wrong twice over: it picked up <marketplace>/.claude/commands — a marketplace
// repo's OWN project commands, which the user's CLI does not expose — and
// namespaced them `.claude:`. It also matched impeccable/bin/commands, which
// holds skills.mjs and no slash commands at all.
const PLUGIN_CONTAINERS = ['plugins', 'external_plugins'];

interface PluginDir { dir: string; name: string; }

function pluginCommandDirs(marketplaces: string, d: Required<CapabilityDeps>): PluginDir[] {
  const out: PluginDir[] = [];

  for (const mp of safe(() => d.readDir(marketplaces), [] as string[])) {
    if (mp.startsWith('.')) continue;
    const mpDir = path.join(marketplaces, mp);
    if (!safe(() => d.isDir(mpDir), false)) continue;

    if (safe(() => d.isDir(path.join(mpDir, 'commands')), false)) {
      out.push({ dir: path.join(mpDir, 'commands'), name: mp });
    }

    for (const child of safe(() => d.readDir(mpDir), [] as string[])) {
      // Dot-directories are the repo's own tooling, never a published plugin.
      if (child.startsWith('.') || child === 'commands') continue;
      const childDir = path.join(mpDir, child);
      if (!safe(() => d.isDir(childDir), false)) continue;

      if (PLUGIN_CONTAINERS.includes(child)) {
        for (const plugin of safe(() => d.readDir(childDir), [] as string[])) {
          if (plugin.startsWith('.')) continue;
          const cmds = path.join(childDir, plugin, 'commands');
          if (safe(() => d.isDir(cmds), false)) out.push({ dir: cmds, name: plugin });
        }
      } else if (safe(() => d.isDir(path.join(childDir, 'commands')), false)) {
        out.push({ dir: path.join(childDir, 'commands'), name: child });
      }
    }
  }

  return out;
}

export function claudeCommands(cwd: string, deps: CapabilityDeps = {}): AiCommand[] {
  const d = resolveDeps(deps);
  const home = d.homeDir();
  const out: AiCommand[] = [];

  out.push(...readCommandDir(path.join(home, '.claude', 'commands'), 'user', '', d));
  out.push(...readCommandDir(path.join(cwd, '.claude', 'commands'), 'project', '', d));

  const marketplaces = path.join(home, '.claude', 'plugins', 'marketplaces');
  for (const { dir, name } of pluginCommandDirs(marketplaces, d)) {
    out.push(...readCommandDir(dir, 'plugin', `${name}:`, d));
  }

  return out;
}

function readJson(file: string, d: Required<CapabilityDeps>): any {
  const raw = safe<string | null>(() => d.readFile(file), null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function toServer(
  name: string, cfg: any, scope: McpServerInfo['scope'], origin: string
): McpServerInfo {
  const http = !!(cfg && (cfg.url || cfg.type === 'http' || cfg.type === 'sse'));
  return {
    name,
    scope,
    origin,
    transport: http ? 'http' : 'stdio',
    // Claude has no explicit disable flag; absent means enabled.
    enabled: cfg?.enabled !== false,
    command: http ? undefined : (cfg?.command ? String(cfg.command) : undefined),
    args: http ? undefined : redactArgs(cfg?.args),
  };
}

// The four locations are measured; Claude's runtime precedence between them is
// NOT. So this does not claim to reproduce resolution — it reports each server
// with the scope it came from, and on a name collision shows the narrower one.
// Later entries here win, so project sources come last.
export function claudeMcpServers(cwd: string, deps: CapabilityDeps = {}): McpServerInfo[] {
  const d = resolveDeps(deps);
  const home = d.homeDir();
  const merged = new Map<string, McpServerInfo>();

  const add = (obj: any, scope: McpServerInfo['scope'], origin: string) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [name, cfg] of Object.entries(obj)) {
      merged.set(name, toServer(name, cfg, scope, origin));
    }
  };

  const claudeJsonPath = path.join(home, '.claude.json');
  const claudeJson = readJson(claudeJsonPath, d);
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const mcpJsonPath = path.join(cwd, '.mcp.json');

  add(claudeJson?.mcpServers, 'global', claudeJsonPath);
  add(readJson(settingsPath, d)?.mcpServers, 'global', settingsPath);
  add(readJson(mcpJsonPath, d)?.mcpServers, 'project', mcpJsonPath);
  add(claudeJson?.projects?.[cwd]?.mcpServers, 'project', claudeJsonPath);

  return Array.from(merged.values());
}
