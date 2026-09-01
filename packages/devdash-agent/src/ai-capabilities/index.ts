import * as path from 'path';
import { claudeCommands, claudeMcpServers } from './claude';
import { grokCommands, grokMcpServers } from './grok';
import { resolveDeps } from './fsdeps';
import type { AiCapabilities, CapabilityDeps } from './types';

export * from './types';

// Walk up to the nearest directory containing .git. Grok's project config
// resolution is defined in terms of the repo root, so this has to agree with
// it; a cwd outside any repo simply resolves to itself.
function repoRootOf(cwd: string, d: ReturnType<typeof resolveDeps>): string {
  let dir = cwd;
  for (let i = 0; i < 40; i++) {
    if (d.exists(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

// One shape, two genuinely different problems behind it: Claude discovers from
// the filesystem, Grok reads a table shipped beside its binary. Adding a vendor
// is a new branch here plus its own module — never a change to callers.
export function discoverCapabilities(
  kind: string,
  cwd: string,
  deps: CapabilityDeps = {}
): AiCapabilities {
  const d = resolveDeps(deps);
  const scannedAt = new Date().toISOString();

  try {
    if (kind === 'claude') {
      return {
        kind: 'claude' as AiCapabilities['kind'],
        commands: claudeCommands(cwd, deps),
        mcpServers: claudeMcpServers(cwd, deps),
        scannedAt,
      };
    }
    if (kind === 'grok') {
      return {
        kind: 'grok' as AiCapabilities['kind'],
        commands: grokCommands(deps),
        mcpServers: grokMcpServers(cwd, repoRootOf(cwd, d), deps),
        scannedAt,
      };
    }
  } catch {
    // Discovery is a convenience. It must never take the poll down with it.
  }

  return {
    kind: kind as AiCapabilities['kind'],
    commands: [],
    mcpServers: [],
    scannedAt,
  };
}
