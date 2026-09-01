# AI Capabilities Discovery (Plan A: agent → API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a machine able to report, for one AI session, which slash commands and MCP servers it has — reachable over the daemon and exposed as an authenticated HTTP endpoint.

**Architecture:** All discovery lives in the agent, behind one seam, `discoverCapabilities(kind, cwd)`, with a per-kind implementation. Every parser is a pure function taking injected file readers, so `node:test` can cover them without touching a real home directory. The transport is the standard daemon path already used by `requestAiSessions`.

**Tech Stack:** TypeScript, `node:test` (agent), `smol-toml`, Next.js route handlers.

**Spec:** `docs/superpowers/specs/2026-08-21-ai-commands-and-mcp-design.md`

**Out of scope — this is Plan B:** the `/` picker, the `+` menu rows, the MCP panel. Plan A finishes when `curl` returns real commands for a real session.

---

## Critical context

**Agent tests run against `dist/`, not `src/`.** `npm test` in `packages/devdash-agent` is `npm run build && node --test test/*.test.js`, and the tests `require('../dist/...')`. Editing `src` without building means testing stale code.

**Two test runners, no overlap.** Agent code is covered by `node:test`; the web app by Vitest. Root `npm test` does NOT run agent tests.

**`dist/` is committed in this repo.** The agent ships built, and
`packages/devdash-agent/dist` is tracked in git. Every agent commit in this
plan must therefore be `npm run build` first, then
`git add packages/devdash-agent/src packages/devdash-agent/dist packages/devdash-agent/test`.
The individual commit commands below name `src` and `test` for clarity; add
`dist` to each. Committing `src` alone leaves the published package stale.

**Filesystem access must be injectable.** Follow `DiscoverDeps` in `ai-sessions.ts`: every function that reads disk takes an optional deps object with defaults. Tests pass fakes; nothing in the suite touches `~`.

**Never let discovery throw.** A missing file, a malformed JSON, an unreadable directory — all of these must yield an empty list for that source, never an exception. One bad plugin directory must not blank the whole menu.

**Secrets.** `env` and `headers` on an MCP server routinely hold API keys and never leave the machine. `args` do cross, so token-shaped entries are redacted first.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/devdash-agent/src/ai-capabilities/types.ts` | **Create.** `AiCommand`, `McpServerInfo`, `AiCapabilities`, `CapabilityDeps`. |
| `packages/devdash-agent/src/ai-capabilities/describe.ts` | **Create.** Command description resolution. Pure. |
| `packages/devdash-agent/src/ai-capabilities/redact.ts` | **Create.** Token-shaped `args` redaction. Pure. |
| `packages/devdash-agent/src/ai-capabilities/claude.ts` | **Create.** Claude command dirs + four-source MCP merge. |
| `packages/devdash-agent/src/ai-capabilities/grok.ts` | **Create.** README slash-table parse + TOML MCP merge. |
| `packages/devdash-agent/src/ai-capabilities/index.ts` | **Create.** `discoverCapabilities(kind, cwd, deps)` seam. |
| `packages/devdash-agent/src/websocket.ts` | **Modify.** `ai_capabilities_request` case. |
| `src/ws-server/index.ts` | **Modify.** Result case, `requestAiCapabilities()`, HTTP route. |
| `src/lib/daemon-status.ts` | **Modify.** Wrapper. |
| `src/app/api/ai-sessions/[machineId]/[tmuxName]/capabilities/route.ts` | **Create.** Guarded GET. |

---

### Task 1: Dependency and shared types

**Files:**
- Modify: `packages/devdash-agent/package.json`
- Create: `packages/devdash-agent/src/ai-capabilities/types.ts`

- [ ] **Step 1: Add the TOML parser**

Run: `cd packages/devdash-agent && npm install smol-toml@^1.3.0`
Expected: added to `dependencies`. Grok and Codex both use TOML with inline tables; hand-rolling would be a parser we then own.

- [ ] **Step 2: Create the shared types**

`packages/devdash-agent/src/ai-capabilities/types.ts`:

```ts
import type { AiKind } from '../ai-session-detector';

export type CommandSource = 'user' | 'project' | 'plugin' | 'builtin';

export interface AiCommand {
  name: string;          // without the leading slash
  alias?: string;        // Grok publishes these
  description: string;   // may be empty, never undefined
  source: CommandSource;
}

export interface McpServerInfo {
  name: string;
  scope: 'global' | 'project';
  transport: 'stdio' | 'http';
  enabled: boolean;
  origin: string;        // the file it came from
  command?: string;      // stdio only
  args?: string[];       // redacted before it leaves the machine
}

export interface AiCapabilities {
  kind: AiKind;
  commands: AiCommand[];
  mcpServers: McpServerInfo[];
  scannedAt: string;
}

// Every disk read goes through here so tests never touch a real home dir.
export interface CapabilityDeps {
  homeDir?: () => string;
  readFile?: (path: string) => string | null;   // null when unreadable
  readDir?: (path: string) => string[];         // [] when unreadable
  isDir?: (path: string) => boolean;
  exists?: (path: string) => boolean;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/devdash-agent/package.json packages/devdash-agent/src/ai-capabilities/types.ts
git commit -m "feat(agent): shared types for AI capability discovery

Every disk read goes through CapabilityDeps so the parsers can be tested
without a real home directory."
```

---

### Task 2: Command description resolution

**Files:**
- Create: `packages/devdash-agent/src/ai-capabilities/describe.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-describe.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-describe.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { describeCommand } = require('../dist/ai-capabilities/describe');

test('prefers frontmatter description', () => {
  const md = '---\nname: x\ndescription: Does the thing\n---\n\n# Heading\n\nBody';
  assert.strictEqual(describeCommand(md), 'Does the thing');
});

// ~/.claude/commands/seo.md has no frontmatter at all — it opens with a
// heading. A parser that requires --- returns nothing for most real files.
test('falls back to the first heading', () => {
  assert.strictEqual(describeCommand('# SEO Machine\n\nLaunch the workspace.'), 'SEO Machine');
});

test('falls back to the first non-empty line', () => {
  assert.strictEqual(describeCommand('\n\nJust a sentence.\nAnd more.'), 'Just a sentence.');
});

test('returns empty string for an empty file, never undefined', () => {
  assert.strictEqual(describeCommand(''), '');
  assert.strictEqual(describeCommand('\n\n   \n'), '');
});

test('truncates a very long description', () => {
  const long = 'x'.repeat(300);
  const out = describeCommand(long);
  assert.ok(out.length <= 160);
  assert.ok(out.endsWith('…'));
});

test('ignores frontmatter that is not closed', () => {
  assert.strictEqual(describeCommand('---\ndescription: nope\n\n# Real'), 'Real');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -A3 'describe'`
Expected: FAIL — cannot find module `../dist/ai-capabilities/describe`

- [ ] **Step 3: Write the implementation**

`packages/devdash-agent/src/ai-capabilities/describe.ts`:

```ts
const MAX = 160;

function clamp(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= MAX ? t : `${t.slice(0, MAX - 1)}…`;
}

// Frontmatter is NOT reliable in real command files — ~/.claude/commands/seo.md
// opens with a bare `# SEO Machine`. So this falls all the way through to the
// first non-empty line rather than returning nothing.
export function describeCommand(markdown: string): string {
  const text = String(markdown || '');

  // Closed frontmatter only: an unterminated block is body text, not metadata.
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (fm) {
    const d = fm[1].match(/^description:\s*(.+)$/m);
    if (d) return clamp(d[1].replace(/^["']|["']$/g, ''));
  }

  const body = fm ? text.slice(fm[0].length) : text;

  const heading = body.match(/^#{1,6}\s+(.+)$/m);
  if (heading) return clamp(heading[1]);

  for (const line of body.split('\n')) {
    if (line.trim()) return clamp(line);
  }
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/describe.ts packages/devdash-agent/test/ai-capabilities-describe.test.js
git commit -m "feat(agent): resolve a command description without assuming frontmatter

Real command files often have none — seo.md opens with a bare heading — so
this falls through frontmatter to heading to first line rather than coming
back empty for the majority of them."
```

---

### Task 3: Secret redaction

**Files:**
- Create: `packages/devdash-agent/src/ai-capabilities/redact.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-redact.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-redact.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { redactArgs } = require('../dist/ai-capabilities/redact');

test('keeps ordinary flags and paths', () => {
  assert.deepStrictEqual(
    redactArgs(['-y', '@indianic/mailman', '--port', '3000']),
    ['-y', '@indianic/mailman', '--port', '3000']
  );
});

test('redacts anything long and token-shaped', () => {
  const out = redactArgs(['--token', 'ghp_' + 'a'.repeat(36)]);
  assert.deepStrictEqual(out, ['--token', '[redacted]']);
});

test('redacts the value after a secret-looking flag even if it looks tame', () => {
  assert.deepStrictEqual(redactArgs(['--api-key', 'abc123']), ['--api-key', '[redacted]']);
  assert.deepStrictEqual(redactArgs(['--password', 'hunter2']), ['--password', '[redacted]']);
});

test('redacts inline KEY=value secrets', () => {
  assert.deepStrictEqual(redactArgs(['TOKEN=abcdef123456']), ['TOKEN=[redacted]']);
});

test('handles a non-array safely', () => {
  assert.deepStrictEqual(redactArgs(undefined), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i redact | head -3`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/devdash-agent/src/ai-capabilities/redact.ts`:

```ts
// MCP `env` and `headers` never leave the machine at all. `args` do, because
// the detail row shows how a server is launched — and a token passed as a CLI
// argument would ride along with it. Redaction is deliberately eager: a
// redacted argument costs the reader nothing, a leaked one costs a key.

const SECRET_FLAG = /(token|key|secret|password|passwd|auth|credential)/i;
// Long, unbroken, high-entropy-ish: the shape of a credential rather than a path.
const TOKEN_SHAPE = /^[A-Za-z0-9_\-.]{24,}$/;

export function redactArgs(args?: string[]): string[] | undefined {
  if (!Array.isArray(args)) return undefined;

  return args.map((raw, i) => {
    const arg = String(raw);

    const inline = arg.match(/^([A-Za-z0-9_]+)=(.+)$/);
    if (inline && SECRET_FLAG.test(inline[1])) return `${inline[1]}=[redacted]`;

    const prev = i > 0 ? String(args[i - 1]) : '';
    if (prev.startsWith('-') && SECRET_FLAG.test(prev)) return '[redacted]';

    if (TOKEN_SHAPE.test(arg) && !arg.includes('/')) return '[redacted]';

    return arg;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/redact.ts packages/devdash-agent/test/ai-capabilities-redact.test.js
git commit -m "feat(agent): redact token-shaped MCP launch arguments

env and headers never cross the boundary; args do, for the detail row, and a
token passed as a CLI argument would ride along. Redaction is eager on
purpose — a redacted argument costs the reader nothing."
```

---

### Task 4: Claude command discovery

**Files:**
- Create: `packages/devdash-agent/src/ai-capabilities/claude.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-claude-commands.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-claude-commands.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { claudeCommands } = require('../dist/ai-capabilities/claude');

// A fake filesystem: paths -> contents for files, arrays for directories.
function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: (p) => Array.isArray(tree[p]),
    readDir: (p) => (Array.isArray(tree[p]) ? tree[p] : []),
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('finds user, project and plugin commands and tags each', () => {
  const deps = fakeFs({
    '/home/dev/.claude/commands': ['seo.md', 'notes.md', 'README.txt'],
    '/home/dev/.claude/commands/seo.md': '# SEO Machine',
    '/home/dev/.claude/commands/notes.md': '---\ndescription: Take notes\n---\n',
    '/work/repo/.claude/commands': ['deploy.md'],
    '/work/repo/.claude/commands/deploy.md': '# Deploy it',
    '/home/dev/.claude/plugins/marketplaces': ['mp'],
    '/home/dev/.claude/plugins/marketplaces/mp': ['plug'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug/commands': ['run.md'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug/commands/run.md': '# Run',
  });

  const cmds = claudeCommands('/work/repo', deps);
  const by = Object.fromEntries(cmds.map((c) => [c.name, c]));

  assert.strictEqual(by['seo'].source, 'user');
  assert.strictEqual(by['seo'].description, 'SEO Machine');
  assert.strictEqual(by['notes'].description, 'Take notes');
  assert.strictEqual(by['deploy'].source, 'project');
  // Plugin commands are namespaced, so two marketplaces cannot collide.
  assert.strictEqual(by['plug:run'].source, 'plugin');
  // Non-markdown is ignored.
  assert.ok(!('README' in by));
});

// Real installs are not uniformly nested: impeccable/bin/commands exists.
test('finds a commands dir nested deeper than plugin root', () => {
  const deps = fakeFs({
    '/home/dev/.claude/plugins/marketplaces': ['mp'],
    '/home/dev/.claude/plugins/marketplaces/mp': ['impeccable'],
    '/home/dev/.claude/plugins/marketplaces/mp/impeccable': ['bin'],
    '/home/dev/.claude/plugins/marketplaces/mp/impeccable/bin': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/mp/impeccable/bin/commands': ['x.md'],
    '/home/dev/.claude/plugins/marketplaces/mp/impeccable/bin/commands/x.md': '# X',
  });
  const names = claudeCommands('/work/repo', deps).map((c) => c.name);
  assert.deepStrictEqual(names, ['impeccable:x']);
});

test('returns empty when nothing exists, and never throws', () => {
  assert.deepStrictEqual(claudeCommands('/nope', fakeFs({})), []);
});

test('an unreadable directory does not blank the rest', () => {
  const deps = fakeFs({
    '/home/dev/.claude/commands': ['ok.md'],
    '/home/dev/.claude/commands/ok.md': '# Fine',
  });
  deps.readDir = (p) => {
    if (p.includes('plugins')) throw new Error('EACCES');
    return p === '/home/dev/.claude/commands' ? ['ok.md'] : [];
  };
  const names = claudeCommands('/work/repo', deps).map((c) => c.name);
  assert.deepStrictEqual(names, ['ok']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i 'claude-commands' | head -3`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/devdash-agent/src/ai-capabilities/claude.ts`:

```ts
import * as path from 'path';
import { describeCommand } from './describe';
import { redactArgs } from './redact';
import type { AiCommand, McpServerInfo, CapabilityDeps } from './types';
import { resolveDeps } from './fsdeps';

// Plugin layouts are not uniform — most are <marketplace>/<plugin>/commands,
// but impeccable/bin/commands exists. So this searches for a `commands`
// directory rather than assuming a depth, and caps how far it will look so a
// deep tree cannot stall the caller.
const PLUGIN_MAX_DEPTH = 4;

function readCommandDir(
  dir: string,
  source: AiCommand['source'],
  prefix: string,
  d: Required<CapabilityDeps>
): AiCommand[] {
  const out: AiCommand[] = [];
  for (const entry of safe(() => d.readDir(dir), [] as string[])) {
    if (!entry.endsWith('.md')) continue;
    const body = safe(() => d.readFile(path.join(dir, entry)), null);
    out.push({
      name: prefix + entry.slice(0, -3),
      description: describeCommand(body || ''),
      source,
    });
  }
  return out;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function findCommandDirs(root: string, depth: number, d: Required<CapabilityDeps>): string[] {
  if (depth > PLUGIN_MAX_DEPTH) return [];
  const found: string[] = [];
  for (const entry of safe(() => d.readDir(root), [] as string[])) {
    const full = path.join(root, entry);
    if (!safe(() => d.isDir(full), false)) continue;
    if (entry === 'commands') found.push(full);
    else found.push(...findCommandDirs(full, depth + 1, d));
  }
  return found;
}

// The plugin name is the segment directly under the marketplace, which is what
// the CLI namespaces by — not the parent of `commands`, which may be `bin`.
function pluginNameFor(commandsDir: string, marketplaces: string): string {
  const rel = commandsDir.slice(marketplaces.length).split(path.sep).filter(Boolean);
  return rel[1] || rel[0] || 'plugin';
}

export function claudeCommands(cwd: string, deps: CapabilityDeps = {}): AiCommand[] {
  const d = resolveDeps(deps);
  const home = d.homeDir();
  const out: AiCommand[] = [];

  out.push(...readCommandDir(path.join(home, '.claude', 'commands'), 'user', '', d));
  out.push(...readCommandDir(path.join(cwd, '.claude', 'commands'), 'project', '', d));

  const marketplaces = path.join(home, '.claude', 'plugins', 'marketplaces');
  for (const dir of findCommandDirs(marketplaces, 0, d)) {
    out.push(...readCommandDir(dir, 'plugin', `${pluginNameFor(dir, marketplaces)}:`, d));
  }

  return out;
}
```

- [ ] **Step 4: Create the deps resolver used above**

`packages/devdash-agent/src/ai-capabilities/fsdeps.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import type { CapabilityDeps } from './types';

// Real-filesystem defaults. Every one swallows its errors: discovery reporting
// nothing for a source is correct, throwing is not.
export function resolveDeps(deps: CapabilityDeps): Required<CapabilityDeps> {
  return {
    homeDir: deps.homeDir || (() => os.homedir()),
    readFile: deps.readFile || ((p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }),
    readDir: deps.readDir || ((p) => { try { return fs.readdirSync(p); } catch { return []; } }),
    isDir: deps.isDir || ((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }),
    exists: deps.exists || ((p) => { try { fs.accessSync(p); return true; } catch { return false; } }),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/claude.ts packages/devdash-agent/src/ai-capabilities/fsdeps.ts packages/devdash-agent/test/ai-capabilities-claude-commands.test.js
git commit -m "feat(agent): discover Claude Code slash commands

User, project and plugin directories, each tagged. Plugin layouts are not
uniformly nested — impeccable/bin/commands exists — so it searches for a
commands directory under a depth cap rather than assuming a shape. An
unreadable directory yields nothing for that source and never blanks the rest."
```

---

### Task 5: Claude MCP merge

**Files:**
- Modify: `packages/devdash-agent/src/ai-capabilities/claude.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-claude-mcp.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-claude-mcp.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { claudeMcpServers } = require('../dist/ai-capabilities/claude');

function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: () => false,
    readDir: () => [],
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('merges the two global sources, which really do differ', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }),
    '/home/dev/.claude/settings.json': JSON.stringify({ mcpServers: { context7: { command: 'c7' } } }),
  });
  const names = claudeMcpServers('/work/repo', deps).map((s) => s.name).sort();
  assert.deepStrictEqual(names, ['context7', 'github']);
});

test('tags project scope and lets the narrower scope win a name collision', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({
      mcpServers: { db: { command: 'global-db' } },
      projects: { '/work/repo': { mcpServers: { db: { command: 'project-db' } } } },
    }),
  });
  const servers = claudeMcpServers('/work/repo', deps);
  assert.strictEqual(servers.length, 1);
  assert.strictEqual(servers[0].scope, 'project');
  assert.strictEqual(servers[0].command, 'project-db');
});

test('reads .mcp.json at the project root', () => {
  const deps = fakeFs({
    '/work/repo/.mcp.json': JSON.stringify({ mcpServers: { local: { command: 'x' } } }),
  });
  const s = claudeMcpServers('/work/repo', deps);
  assert.strictEqual(s[0].scope, 'project');
  assert.strictEqual(s[0].origin, '/work/repo/.mcp.json');
});

test('classifies transport and redacts args', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({
      mcpServers: {
        remote: { url: 'https://example.com/mcp' },
        local: { command: 'srv', args: ['--api-key', 'abc123'] },
      },
    }),
  });
  const by = Object.fromEntries(claudeMcpServers('/work/repo', deps).map((s) => [s.name, s]));
  assert.strictEqual(by.remote.transport, 'http');
  assert.strictEqual(by.local.transport, 'stdio');
  assert.deepStrictEqual(by.local.args, ['--api-key', '[redacted]']);
});

test('malformed JSON yields nothing rather than throwing', () => {
  const deps = fakeFs({ '/home/dev/.claude.json': '{ not json' });
  assert.deepStrictEqual(claudeMcpServers('/work/repo', deps), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i 'claude-mcp' | head -3`
Expected: FAIL — `claudeMcpServers` is not a function

- [ ] **Step 3: Append the implementation to `claude.ts`**

```ts
function readJson(file: string, d: Required<CapabilityDeps>): any {
  const raw = safe(() => d.readFile(file), null);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/claude.ts packages/devdash-agent/test/ai-capabilities-claude-mcp.test.js
git commit -m "feat(agent): merge Claude MCP servers from all four config sources

~/.claude.json and ~/.claude/settings.json overlap but differ, so this is a
merge rather than a lookup. The locations are measured; Claude's runtime
precedence between them is not, so each server carries the scope it came from
and the narrower scope wins a collision — a display rule, not a claim to
reproduce resolution."
```

---

### Task 6: Grok slash-command table

**Files:**
- Create: `packages/devdash-agent/src/ai-capabilities/grok.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-grok-commands.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-grok-commands.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { parseGrokCommandTable } = require('../dist/ai-capabilities/grok');

const README = [
  '## Something else',
  '',
  '### Slash Commands',
  '',
  'Type `/` in the input to access commands:',
  '',
  '| Command | Alias | Description |',
  '| --- | --- | --- |',
  '| `/model <name>` | `/m` | Switch to a different model |',
  '| `/new` | | Start a new session (clears context) |',
  '| `/compact [context]` | | Compact conversation history |',
  '| `/exit` | `/quit` | Exit the TUI |',
  '',
  '### Features',
  '| not | a | command table |',
].join('\n');

test('parses every row, stripping slashes and argument placeholders', () => {
  const cmds = parseGrokCommandTable(README);
  assert.strictEqual(cmds.length, 4);
  const by = Object.fromEntries(cmds.map((c) => [c.name, c]));
  assert.strictEqual(by.model.alias, 'm');
  assert.strictEqual(by.model.description, 'Switch to a different model');
  assert.strictEqual(by.new.alias, undefined);
  assert.strictEqual(by.exit.alias, 'quit');
  assert.ok(cmds.every((c) => c.source === 'builtin'));
});

test('stops at the next heading and ignores later tables', () => {
  assert.ok(!parseGrokCommandTable(README).some((c) => c.name === 'not'));
});

// All-or-nothing: a half-parsed menu that silently drops /compact is worse
// than no menu, because the reader cannot tell it is incomplete.
test('a missing section yields an empty list', () => {
  assert.deepStrictEqual(parseGrokCommandTable('# Nothing here'), []);
});

test('fewer than three rows is treated as a failed parse', () => {
  const thin = '### Slash Commands\n\n| Command | Alias | Description |\n| --- | --- | --- |\n| `/x` | | y |';
  assert.deepStrictEqual(parseGrokCommandTable(thin), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i 'grok-commands' | head -3`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/devdash-agent/src/ai-capabilities/grok.ts`:

```ts
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
  const readme = d.readFile(path.join(d.homeDir(), '.grok', 'README.md'));
  return readme ? parseGrokCommandTable(readme) : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/grok.ts packages/devdash-agent/test/ai-capabilities-grok-commands.test.js
git commit -m "feat(agent): read Grok's built-in commands from its shipped README

Grok has no commands directory — its slash commands are built in, documented
in the README beside the binary. Parsing it at runtime tracks the installed
version instead of pinning one release into our source. Failure is
all-or-nothing: fewer than three rows returns empty, because a menu that
silently drops /compact is worse than no menu."
```

---

### Task 7: Grok MCP merge with replace semantics

**Files:**
- Modify: `packages/devdash-agent/src/ai-capabilities/grok.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-grok-mcp.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-grok-mcp.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { grokMcpServers } = require('../dist/ai-capabilities/grok');

function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: () => false,
    readDir: () => [],
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('reads the global config', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml': '[mcp_servers.mailman]\ncommand = "npx"\nargs = ["-y", "@indianic/mailman"]\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].scope, 'global');
  assert.strictEqual(s[0].command, 'npx');
});

// Documented behaviour: a project server with a global's name REPLACES it
// entirely. Fields the project omits take defaults, they do not inherit.
test('a project server replaces a global of the same name, without merging fields', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml':
      '[mcp_servers.db]\ncommand = "global"\nargs = ["--x"]\nstartup_timeout_sec = 99\n',
    '/work/repo/.grok/config.toml': '[mcp_servers.db]\ncommand = "project"\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].command, 'project');
  assert.strictEqual(s[0].scope, 'project');
  // Not inherited from the global entry.
  assert.deepStrictEqual(s[0].args, undefined);
});

test('cwd beats repo root, which beats global', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml': '[mcp_servers.a]\ncommand = "g"\n',
    '/work/repo/.grok/config.toml': '[mcp_servers.a]\ncommand = "r"\n',
    '/work/repo/pkg/.grok/config.toml': '[mcp_servers.a]\ncommand = "c"\n',
  });
  const s = grokMcpServers('/work/repo/pkg', '/work/repo', deps);
  assert.strictEqual(s[0].command, 'c');
});

test('honours the enabled flag and redacts args', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml':
      '[mcp_servers.x]\ncommand = "s"\nenabled = false\nargs = ["--token", "' + 'a'.repeat(30) + '"]\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s[0].enabled, false);
  assert.deepStrictEqual(s[0].args, ['--token', '[redacted]']);
});

test('malformed TOML yields nothing rather than throwing', () => {
  const deps = fakeFs({ '/home/dev/.grok/config.toml': '[[[ not toml' });
  assert.deepStrictEqual(grokMcpServers('/work/repo', '/work/repo', deps), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i 'grok-mcp' | head -3`
Expected: FAIL — `grokMcpServers` is not a function

- [ ] **Step 3: Append the implementation to `grok.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/grok.ts packages/devdash-agent/test/ai-capabilities-grok-mcp.test.js
git commit -m "feat(agent): read Grok MCP servers across its three config layers

~/.grok < repo-root/.grok < cwd/.grok, and a same-named project server
replaces the global entirely rather than merging fields — documented
behaviour, implemented literally, because showing a server with a command it
does not actually run is worse than showing none."
```

---

### Task 8: The discovery seam

**Files:**
- Create: `packages/devdash-agent/src/ai-capabilities/index.ts`
- Create: `packages/devdash-agent/test/ai-capabilities-seam.test.js`

- [ ] **Step 1: Write the failing test**

`packages/devdash-agent/test/ai-capabilities-seam.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { discoverCapabilities } = require('../dist/ai-capabilities/index');

const empty = {
  homeDir: () => '/home/dev',
  exists: () => false,
  isDir: () => false,
  readDir: () => [],
  readFile: () => null,
};

test('returns the kind and a timestamp, with empty lists when nothing is installed', () => {
  const caps = discoverCapabilities('claude', '/work/repo', empty);
  assert.strictEqual(caps.kind, 'claude');
  assert.deepStrictEqual(caps.commands, []);
  assert.deepStrictEqual(caps.mcpServers, []);
  assert.ok(!Number.isNaN(Date.parse(caps.scannedAt)));
});

// Codex is deliberately out of v1: its command layout was never measured, and
// a guess shipped as a feature is worse than an honest empty.
test('codex returns empty rather than a guess', () => {
  const caps = discoverCapabilities('codex', '/work/repo', empty);
  assert.deepStrictEqual(caps.commands, []);
  assert.deepStrictEqual(caps.mcpServers, []);
});

test('an unknown kind does not throw', () => {
  const caps = discoverCapabilities('something-new', '/work/repo', empty);
  assert.deepStrictEqual(caps.commands, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -i 'seam' | head -3`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/devdash-agent/src/ai-capabilities/index.ts`:

```ts
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
        kind: 'claude' as any,
        commands: claudeCommands(cwd, deps),
        mcpServers: claudeMcpServers(cwd, deps),
        scannedAt,
      };
    }
    if (kind === 'grok') {
      return {
        kind: 'grok' as any,
        commands: grokCommands(deps),
        mcpServers: grokMcpServers(cwd, repoRootOf(cwd, d), deps),
        scannedAt,
      };
    }
  } catch {
    // Discovery is a convenience. It must never take the poll down with it.
  }

  return { kind: kind as any, commands: [], mcpServers: [], scannedAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-capabilities/index.ts packages/devdash-agent/test/ai-capabilities-seam.test.js
git commit -m "feat(agent): one seam for capability discovery

Claude discovers from the filesystem and Grok reads a shipped table; they
share only the returned shape. Codex returns empty because its layout was
never measured, and a guess shipped as a feature is worse than an honest
empty state."
```

---

### Task 9: Agent message type

**Files:**
- Modify: `packages/devdash-agent/src/websocket.ts`

- [ ] **Step 1: Add the import**

At the top of `packages/devdash-agent/src/websocket.ts`, beside the other AI imports:

```ts
import { discoverCapabilities } from './ai-capabilities';
```

- [ ] **Step 2: Add the case**

Immediately after the `case 'ai_session_list_request':` block (which ends with its `break;`), add:

```ts
    case 'ai_capabilities_request': {
      // cwd comes from the server, which took it from the session registry —
      // the agent does not re-derive it, so the answer matches the session the
      // user is actually looking at.
      const caps = discoverCapabilities(
        String(msg.kind || ''),
        String(msg.cwd || ''),
      );
      ws.send(JSON.stringify({ type: 'ai_capabilities', requestId: msg.requestId, caps }));
      break;
    }
```

- [ ] **Step 3: Build and verify the suite**

Run: `cd packages/devdash-agent && npm test 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: 0 failures

- [ ] **Step 4: Commit**

```bash
git add packages/devdash-agent/src/websocket.ts packages/devdash-agent/dist
git commit -m "feat(agent): answer ai_capabilities_request

cwd is supplied by the server from the session registry rather than
re-derived here, so the answer matches the session the user is looking at."
```

---

### Task 10: ws-server relay

**Files:**
- Modify: `src/ws-server/index.ts`

- [ ] **Step 1: Resolve the result**

In `handleDaemonMessage`, beside the other resolver cases (`fs_list`, `project_scan_result`), add:

```ts
    case 'ai_capabilities': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
```

- [ ] **Step 2: Add the request function**

Beside `requestAiSessions`, using the identical 10-second timeout so a stale agent resolves null rather than hanging:

```ts
export async function requestAiCapabilities(
  machineId: number,
  kind: string,
  cwd: string
): Promise<any | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    // An agent predating this message type never replies. Ten seconds later
    // this resolves null, the route returns an empty set, and the UI says the
    // agent needs updating — it does not error.
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result.caps || null);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_capabilities_request', requestId, kind, cwd }));
  });
}
```

- [ ] **Step 3: Add the HTTP route**

In `server.on('request')`, beside the `/ai-sessions/` branch:

```ts
  } else if (url.pathname.startsWith('/ai-capabilities/') && req.method === 'POST') {
    // POST /ai-capabilities/:machineId  { kind, cwd }
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const caps = await requestAiCapabilities(
      machineId,
      String(body.kind || ''),
      String(body.cwd || '')
    );
    if (caps === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline or agent too old' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(caps));
    }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/ws-server/index.ts
git commit -m "feat(ws): relay AI capability requests to the daemon

Same 10s-timeout-resolves-null shape as requestAiSessions, so an agent that
predates the message type degrades to an empty capability set instead of
hanging the request."
```

---

### Task 11: daemon-status wrapper and the API route

**Files:**
- Modify: `src/lib/daemon-status.ts`
- Create: `src/app/api/ai-sessions/[machineId]/[tmuxName]/capabilities/route.ts`

- [ ] **Step 1: Add the wrapper**

Beside `requestAiSessions` in `src/lib/daemon-status.ts`:

```ts
export async function requestAiCapabilities(
  machineId: number,
  kind: string,
  cwd: string
): Promise<any | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-capabilities/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ kind, cwd }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create the route**

`src/app/api/ai-sessions/[machineId]/[tmuxName]/capabilities/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isEnrolled } from '@/lib/auth';
import { requestAiCapabilities, requestAiSessions } from '@/lib/daemon-status';
import { userOwnsMachine } from '@/lib/machine-access';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ machineId: string; tmuxName: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const { machineId, tmuxName } = await params;
  const targetMachine = parseInt(machineId, 10);
  // A caller-supplied machineId is never trusted, exactly as the sibling
  // route does before it types into a live shell.
  if (!(await userOwnsMachine(session.userId, targetMachine))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // kind and cwd come from the live session list, not from the query string:
  // the client must not be able to point discovery at an arbitrary directory.
  const sessions = await requestAiSessions(targetMachine);
  const match = (sessions || []).find((s: any) => s.tmuxName === decodeURIComponent(tmuxName));
  if (!match) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const caps = await requestAiCapabilities(targetMachine, match.kind, match.folderPath || '');
  if (!caps) {
    // Offline, or an agent that predates the message type. The client shows
    // "update the agent", which is a different sentence from "none found".
    return NextResponse.json({ unavailable: true, commands: [], mcpServers: [] }, { status: 200 });
  }

  return NextResponse.json(caps);
}
```

- [ ] **Step 3: Verify it compiles and the suite passes**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: no type errors, all Vitest tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/daemon-status.ts "src/app/api/ai-sessions/[machineId]/[tmuxName]/capabilities/route.ts"
git commit -m "feat(api): expose AI session capabilities

kind and cwd are read from the live session list rather than the query string,
so a caller cannot point discovery at an arbitrary directory. Ownership is
checked before anything else, matching the sibling route."
```

---

### Task 12: Verify end to end against a real machine

**Files:** none — this proves the chain works with real data before any UI is built on it.

- [ ] **Step 1: Build and run**

```bash
npm run build
npm run dev
```

- [ ] **Step 2: Discover a live session's tmux name**

```bash
curl -s localhost:50052/status/online
```
Expected: a JSON list of machine ids including your own.

- [ ] **Step 3: Ask the daemon directly, bypassing auth**

```bash
TOK=$(node -e "const fs=require('fs'),c=require('crypto');const e=fs.readFileSync('.env.local','utf8');const g=k=>(e.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]||'';process.stdout.write(g('WS_INTERNAL_TOKEN')||c.createHash('sha256').update(g('JWT_SECRET').trim()).digest('hex'))")
curl -s -X POST -H "X-Internal-Token: $TOK" -H 'Content-Type: application/json' \
  -d '{"kind":"claude","cwd":"'"$PWD"'"}' \
  localhost:50052/ai-capabilities/2 | head -c 2000
```

Expected: JSON with a non-empty `commands` array — on this machine roughly 29
user commands plus plugin ones — and a `mcpServers` array of around 20 entries
tagged `global`.

- [ ] **Step 4: Check the things most likely to be wrong**

Confirm in that output:
- No `env` or `headers` field appears anywhere.
- Any `args` entry that looked like a token reads `[redacted]`.
- `seo` has the description `SEO Machine`, proving the no-frontmatter fallback.
- Plugin commands are namespaced `plugin:name`.

- [ ] **Step 5: Confirm the offline path**

Ask for a machine id that is not online:

```bash
curl -s -X POST -H "X-Internal-Token: $TOK" -H 'Content-Type: application/json' \
  -d '{"kind":"claude","cwd":"/tmp"}' localhost:50052/ai-capabilities/999
```
Expected: HTTP 503 with `Machine offline or agent too old` — not a hang, and not a 500.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(agent): corrections from end-to-end capability verification"
```

---

## Definition of done

- `npm test` green in both runners.
- `npm run build` clean.
- A real machine returns real commands and MCP servers through the ws-server route.
- No `env`, no `headers`, and no unredacted token anywhere in the payload.
- An offline machine returns 503, and an agent without the message type resolves
  to an empty set after 10s rather than hanging.

## Then: Plan B

The UI — the `/` picker, the `+` menu rows, the MCP panel — gets its own plan,
written against the real output of Task 12 rather than an imagined shape.
