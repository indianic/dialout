# AI Sessions (attach mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every Claude Code and Codex session running across the user's machines as a readable chat in the DevDash PWA, and let the user type into it from a phone.

**Architecture:** The agent already reports tmux sessions. For each one it now resolves the AI CLI process inside the pane, locates that process's structured JSONL transcript on disk, tails it, and normalises each record into a single vendor-neutral `AiEvent` stream pushed over the existing `/multiplex` socket. Input travels the other way as `tmux send-keys`. Nothing parses the ANSI TUI, and no transcript is stored in Postgres.

**Tech Stack:** TypeScript, `node:test` (agent), vitest (web app), Next.js 15 App Router, React 19, `ws`.

**Spec:** `docs/superpowers/specs/2026-08-21-ai-sessions-attach-design.md` — read it before Task 1.

## Global Constraints

- Agent code is `packages/devdash-agent/src/*.ts`, built with `npm run build` to `dist/`. Agent tests are `packages/devdash-agent/test/*.test.js`, CommonJS, and `require('../dist/<module>')` — **they run against `dist/`, so every test run must be preceded by a build** (`npm test` in that package already does `build && node --test`).
- Root `npm test` (vitest) matches `src/**/*.test.ts` only and does **not** run agent tests. Both must be run.
- Every pure function gets a dependency-injection seam via a trailing `deps = {}` parameter, matching `tmuxSessionExists` in `pty-manager.ts` and `killTmuxSession` in `tmux-manager.ts`. This is how they are tested without shelling out.
- New agent capability path is fixed: agent handler → `websocket.ts` message type → ws-server `handleDaemonMessage` case → exported `request*()` → HTTP route in `server.on('request')` → wrapper in `src/lib/daemon-status.ts` → Next.js API route. **A Next.js route must never open a socket to an agent.**
- Any new privileged ws-server HTTP route must be added to `PRIVILEGED_PREFIXES` (`src/ws-server/index.ts:1042`) so it is gated by the constant-time `X-Internal-Token` compare.
- Timestamps in new DB columns are `text` defaulted to `` sql`now()` ``, camelCase property → snake_case column. **Not** `timestamp`.
- **Never classify an AI CLI by its process name.** Measured on the dev machine: a live agent CLI appears in `ps` as `grok`, and Claude Code's binary is `~/.local/share/claude/versions/<version>`. Match against the full argv string.
- Transcript content must never be logged by the ws-server nor written to Postgres — it contains everything the model saw, including repository secrets.
- Adapters degrade, never throw: unknown record type is skipped, unknown content block renders as plain text.

**Out of scope for this plan** (v1 completes with a second plan): web push notifications, the `aiSessionSeen` table, and the service worker. This plan delivers read + type, with live status in-app.

---

### Task 1: Detect which tmux pane is running which AI CLI

**Files:**
- Create: `packages/devdash-agent/src/ai-session-detector.ts`
- Test: `packages/devdash-agent/test/ai-session-detector.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type AiKind = 'claude' | 'codex'`; `interface ProcRow { pid: number; ppid: number; command: string }`; `parseProcessTable(psOutput: string): ProcRow[]`; `descendantsOf(rows: ProcRow[], rootPid: number): ProcRow[]`; `classifyProcess(command: string): AiKind | null`; `findAgentInPane(rows: ProcRow[], panePid: number): { pid: number; kind: AiKind } | null`; `readProcessTable(deps?: ProcessTableDeps): Promise<ProcRow[]>`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-session-detector.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  parseProcessTable, descendantsOf, classifyProcess, findAgentInPane,
} = require('../dist/ai-session-detector');

const PS = [
  '    1     0 /sbin/launchd',
  '56045     1 tmux new-session -d -s dd-ses_abc -c /Users/dev',
  '40148 56045 -zsh',
  '28668 40148 /Users/dev/.local/share/claude/versions/2.1.238',
  '29647 28668 node /Users/dev/.claude/plugins/mcp-server.cjs',
  '77001 40148 /opt/homebrew/Caskroom/codex/0.146.0/bin/codex',
].join('\n');

test('parseProcessTable reads pid, ppid and the full command', () => {
  const rows = parseProcessTable(PS);
  assert.strictEqual(rows.length, 6);
  assert.deepStrictEqual(rows[3], {
    pid: 28668, ppid: 40148,
    command: '/Users/dev/.local/share/claude/versions/2.1.238',
  });
});

test('parseProcessTable ignores blank and malformed lines', () => {
  assert.deepStrictEqual(parseProcessTable('\n  \nnot a process row\n'), []);
});

test('descendantsOf walks the whole subtree, not just direct children', () => {
  const pids = descendantsOf(parseProcessTable(PS), 56045).map((r) => r.pid);
  assert.deepStrictEqual(pids.sort(), [28668, 29647, 40148, 77001]);
});

test('descendantsOf terminates on a cycle', () => {
  // ps output is a snapshot and pid reuse can produce a parent loop; a naive
  // walk would hang the agent's poll loop forever.
  const rows = parseProcessTable('10 11 a\n11 10 b');
  assert.ok(descendantsOf(rows, 10).length <= 2);
});

test('classifyProcess identifies Claude Code by its versioned binary path', () => {
  // The binary is named after a version number, so the process NAME is useless.
  assert.strictEqual(
    classifyProcess('/Users/dev/.local/share/claude/versions/2.1.238'), 'claude');
});

test('classifyProcess identifies a plain claude invocation', () => {
  assert.strictEqual(classifyProcess('claude --resume'), 'claude');
  assert.strictEqual(classifyProcess('/usr/local/bin/claude'), 'claude');
});

test('classifyProcess identifies codex', () => {
  assert.strictEqual(
    classifyProcess('/opt/homebrew/Caskroom/codex/0.146.0/bin/codex'), 'codex');
});

test('classifyProcess does not match unrelated processes', () => {
  assert.strictEqual(classifyProcess('-zsh'), null);
  assert.strictEqual(classifyProcess('node /app/claudette/server.js'), null);
  assert.strictEqual(classifyProcess('vim claude-notes.md'), null);
});

test('findAgentInPane returns the agent process under a pane shell', () => {
  assert.deepStrictEqual(
    findAgentInPane(parseProcessTable(PS), 40148), { pid: 28668, kind: 'claude' });
});

test('findAgentInPane returns null when the pane runs no AI CLI', () => {
  const rows = parseProcessTable('40148 56045 -zsh\n50000 40148 vim README.md');
  assert.strictEqual(findAgentInPane(rows, 40148), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-session-detector'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-session-detector.ts
import { execFile } from 'child_process';

// Which AI coding CLI is running inside a tmux pane.
//
// Classification is deliberately NOT by process name. Measured on a real
// machine: Claude Code's binary lives at ~/.local/share/claude/versions/<ver>,
// so its `comm` is a version number, and other agent CLIs rename themselves
// outright. Only the full argv is trustworthy.

export type AiKind = 'claude' | 'codex';

export interface ProcRow {
  pid: number;
  ppid: number;
  command: string;
}

const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(\S.*)$/;

export function parseProcessTable(psOutput: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of psOutput.split('\n')) {
    const m = line.match(PS_ROW_RE);
    if (!m) continue;
    rows.push({ pid: parseInt(m[1], 10), ppid: parseInt(m[2], 10), command: m[3] });
  }
  return rows;
}

// Every descendant of rootPid, depth unbounded. The `seen` set is not an
// optimisation: `ps` output is a snapshot and pid reuse can produce a parent
// cycle, which would otherwise spin the agent's poll loop forever.
export function descendantsOf(rows: ProcRow[], rootPid: number): ProcRow[] {
  const byParent = new Map<number, ProcRow[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.ppid);
    if (siblings) siblings.push(row);
    else byParent.set(row.ppid, [row]);
  }
  const out: ProcRow[] = [];
  const seen = new Set<number>([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    for (const child of byParent.get(stack.pop()!) || []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      out.push(child);
      stack.push(child.pid);
    }
  }
  return out;
}

// Anchored on a path segment boundary so `claudette` and `claude-notes.md`
// do not match, and on the vendors' real install layouts.
const KIND_RULES: { kind: AiKind; re: RegExp }[] = [
  { kind: 'claude', re: /(^|\/)claude(\s|$)|\/\.local\/share\/claude\/versions\// },
  { kind: 'codex',  re: /(^|\/)codex(\s|$)|\/Caskroom\/codex\// },
];

export function classifyProcess(command: string): AiKind | null {
  for (const rule of KIND_RULES) {
    if (rule.re.test(command)) return rule.kind;
  }
  return null;
}

// Shallowest match wins: the agent CLI is a direct child of the pane shell,
// while its MCP servers and subprocesses sit deeper and may share its name.
export function findAgentInPane(
  rows: ProcRow[],
  panePid: number
): { pid: number; kind: AiKind } | null {
  for (const proc of descendantsOf(rows, panePid)) {
    const kind = classifyProcess(proc.command);
    if (kind) return { pid: proc.pid, kind };
  }
  return null;
}

export interface ProcessTableDeps {
  run?: () => Promise<string>;
}

export async function readProcessTable(deps: ProcessTableDeps = {}): Promise<ProcRow[]> {
  const run = deps.run || (() => new Promise<string>((resolve) => {
    // One `ps` for the whole machine, not one per pane.
    execFile('ps', ['-A', '-o', 'pid=,ppid=,command='], { timeout: 5000, maxBuffer: 8 << 20 },
      (err, stdout) => resolve(err ? '' : stdout));
  }));
  return parseProcessTable(await run());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS — all 9 new tests, plus the existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-session-detector.ts packages/devdash-agent/test/ai-session-detector.test.js
git commit -m "feat(agent): detect which AI CLI runs inside a tmux pane"
```

---

### Task 2: Locate a running agent's transcript file

**Files:**
- Create: `packages/devdash-agent/src/ai-transcript-locator.ts`
- Test: `packages/devdash-agent/test/ai-transcript-locator.test.js`

**Interfaces:**
- Consumes: `AiKind` from `./ai-session-detector`.
- Produces: `claudeProjectDir(configHome: string, cwd: string): string`; `pickNewest(files: { path: string; mtimeMs: number }[]): string | null`; `locateTranscript(pid: number, kind: AiKind, deps?: LocatorDeps): string | null`; `interface LocatorDeps { writeHandles?, procCwd?, procEnv?, listJsonl?, transcriptCwd? }`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-transcript-locator.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  claudeProjectDir, pickNewest, locateTranscript,
} = require('../dist/ai-transcript-locator');

test('claudeProjectDir escapes the absolute cwd by replacing every slash', () => {
  assert.strictEqual(
    claudeProjectDir('/home/dev/.claude', '/Volumes/SSD/www/devdash'),
    '/home/dev/.claude/projects/-Volumes-SSD-www-devdash');
});

test('pickNewest returns the most recently modified file', () => {
  assert.strictEqual(pickNewest([
    { path: '/a.jsonl', mtimeMs: 100 },
    { path: '/b.jsonl', mtimeMs: 300 },
    { path: '/c.jsonl', mtimeMs: 200 },
  ]), '/b.jsonl');
});

test('pickNewest returns null for an empty list', () => {
  assert.strictEqual(pickNewest([]), null);
});

test('locateTranscript prefers an open write handle when the CLI holds one', () => {
  // grok-style CLIs keep the transcript open, which makes the mapping exact.
  const path = locateTranscript(28668, 'codex', {
    writeHandles: () => ['/home/dev/.codex/sessions/2026/05/05/rollout-x-uuid.jsonl'],
    procCwd: () => { throw new Error('must not be consulted'); },
  });
  assert.strictEqual(path, '/home/dev/.codex/sessions/2026/05/05/rollout-x-uuid.jsonl');
});

test('locateTranscript ignores open handles that are not transcripts', () => {
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => ['/home/dev/.claude/logs/debug.log', '/dev/null'],
    procCwd: () => '/srv/app',
    procEnv: () => ({ CLAUDE_CONFIG_DIR: '/home/dev/.iclaude' }),
    listJsonl: () => [{ path: '/home/dev/.iclaude/projects/-srv-app/s1.jsonl', mtimeMs: 9 }],
    transcriptCwd: () => '/srv/app',
  });
  assert.strictEqual(path, '/home/dev/.iclaude/projects/-srv-app/s1.jsonl');
});

test('locateTranscript falls back to cwd + newest for Claude Code', () => {
  // Measured: Claude Code opens, appends and closes, so lsof finds nothing.
  const seen = [];
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    listJsonl: (dir) => { seen.push(dir); return [
      { path: `${dir}/old.jsonl`, mtimeMs: 10 },
      { path: `${dir}/new.jsonl`, mtimeMs: 99 },
    ]; },
    transcriptCwd: () => '/srv/app',
  });
  assert.deepStrictEqual(seen, ['/home/dev/.claude/projects/-srv-app']);
  assert.ok(path.endsWith('/new.jsonl'));
});

test('locateTranscript honours CLAUDE_CONFIG_DIR so multiple accounts resolve separately', () => {
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev', CLAUDE_CONFIG_DIR: '/home/dev/.iclaude' }),
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwd: () => '/srv/app',
  });
  assert.strictEqual(path, '/home/dev/.iclaude/projects/-srv-app/s.jsonl');
});

test('locateTranscript rejects a candidate whose own cwd disagrees', () => {
  // The guard against attaching a pane to an unrelated session's transcript.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwd: () => '/some/other/place',
  });
  assert.strictEqual(path, null);
});

test('locateTranscript returns null when nothing is found', () => {
  assert.strictEqual(locateTranscript(1, 'claude', {
    writeHandles: () => [], procCwd: () => '', procEnv: () => ({}),
    listJsonl: () => [], transcriptCwd: () => null,
  }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-transcript-locator'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-transcript-locator.ts
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { AiKind } from './ai-session-detector';

// Map a running agent process to the JSONL transcript it is writing.
//
// Two tiers, both measured on a real machine 2026-08-21:
//   1. lsof — some CLIs hold the transcript open for writing, which makes the
//      mapping exact. Always try this first.
//   2. cwd + newest — Claude Code opens, appends and closes, so lsof finds
//      nothing for it. Narrow by the process's true cwd and its
//      CLAUDE_CONFIG_DIR (which is how two subscriptions on one machine stay
//      apart), then take the newest file and VALIDATE it against the cwd
//      recorded inside the transcript itself.

const TRANSCRIPT_RE = /\.jsonl$/;
const CANDIDATE_RE = /\/(projects|sessions)\/.*\.jsonl$/;

export interface LocatorDeps {
  writeHandles?: (pid: number) => string[];
  procCwd?: (pid: number) => string;
  procEnv?: (pid: number) => Record<string, string>;
  listJsonl?: (dir: string) => { path: string; mtimeMs: number }[];
  transcriptCwd?: (path: string) => string | null;
}

// Claude Code escapes the absolute path by replacing every '/' with '-', so
// the leading slash becomes a leading dash: /Volumes/x -> -Volumes-x.
export function claudeProjectDir(configHome: string, cwd: string): string {
  return `${configHome}/projects/${cwd.replace(/\//g, '-')}`;
}

export function pickNewest(files: { path: string; mtimeMs: number }[]): string | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of files) {
    if (!best || f.mtimeMs > best.mtimeMs) best = f;
  }
  return best ? best.path : null;
}

function defaultWriteHandles(pid: number): string[] {
  try {
    // -F n prints one 'n<path>' line per open file.
    const out = execFileSync('lsof', ['-p', String(pid), '-F', 'n'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    return out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function defaultProcCwd(pid: number): string {
  try {
    if (process.platform === 'linux') return fs.readlinkSync(`/proc/${pid}/cwd`);
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-F', 'n'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    const line = out.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : '';
  } catch {
    return '';
  }
}

function defaultProcEnv(pid: number): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = process.platform === 'linux'
      ? fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')
      : execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='],
          { timeout: 5000, stdio: 'pipe' }).toString().split(' ');
    for (const pair of raw) {
      const eq = pair.indexOf('=');
      if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  } catch { /* env is a refinement, never required */ }
  return env;
}

function defaultListJsonl(dir: string): { path: string; mtimeMs: number }[] {
  try {
    return fs.readdirSync(dir)
      .filter((n) => TRANSCRIPT_RE.test(n))
      .map((n) => ({ path: `${dir}/${n}`, mtimeMs: fs.statSync(`${dir}/${n}`).mtimeMs }));
  } catch {
    return [];
  }
}

// The cwd recorded on the transcript's own records. Reads only the head of the
// file — these grow to megabytes and this runs on every poll.
function defaultTranscriptCwd(path: string): string | null {
  try {
    const fd = fs.openSync(path, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const line of buf.subarray(0, read).toString().split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (typeof rec.cwd === 'string') return rec.cwd;
        if (typeof rec?.payload?.cwd === 'string') return rec.payload.cwd;
      } catch { /* a truncated final line is normal */ }
    }
  } catch { /* unreadable */ }
  return null;
}

export function locateTranscript(
  pid: number,
  kind: AiKind,
  deps: LocatorDeps = {}
): string | null {
  const writeHandles = deps.writeHandles || defaultWriteHandles;
  const procCwd = deps.procCwd || defaultProcCwd;
  const procEnv = deps.procEnv || defaultProcEnv;
  const listJsonl = deps.listJsonl || defaultListJsonl;
  const transcriptCwd = deps.transcriptCwd || defaultTranscriptCwd;

  // Tier 1 — exact.
  const held = writeHandles(pid).find((p) => CANDIDATE_RE.test(p));
  if (held) return held;

  // Tier 2 — narrow, then validate.
  const cwd = procCwd(pid);
  if (!cwd) return null;
  const env = procEnv(pid);
  const home = env.HOME || os.homedir();
  const dir = kind === 'claude'
    ? claudeProjectDir(env.CLAUDE_CONFIG_DIR || `${home}/.claude`, cwd)
    : `${env.CODEX_HOME || `${home}/.codex`}/sessions`;

  const candidate = pickNewest(listJsonl(dir));
  if (!candidate) return null;
  const recorded = transcriptCwd(candidate);
  // A transcript that names a different working directory belongs to another
  // session; attaching to it would show the user someone else's conversation.
  if (recorded && recorded !== cwd) return null;
  return candidate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-transcript-locator.ts packages/devdash-agent/test/ai-transcript-locator.test.js
git commit -m "feat(agent): map a running AI CLI process to its transcript file"
```

---

### Task 3: Follow a transcript as it grows

**Files:**
- Create: `packages/devdash-agent/src/ai-transcript-tail.ts`
- Test: `packages/devdash-agent/test/ai-transcript-tail.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `splitRecords(buffer: string): { records: unknown[]; rest: string }`; `class TranscriptTail { constructor(path: string, onRecords: (records: unknown[]) => void); start(): void; stop(): void; pump(): void; readonly lastGrowthMs: number }`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-transcript-tail.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitRecords, TranscriptTail } = require('../dist/ai-transcript-tail');

test('splitRecords parses whole lines and keeps the partial tail', () => {
  const { records, rest } = splitRecords('{"a":1}\n{"b":2}\n{"c":');
  assert.deepStrictEqual(records, [{ a: 1 }, { b: 2 }]);
  assert.strictEqual(rest, '{"c":');
});

test('splitRecords skips an unparseable line rather than throwing', () => {
  // A vendor format change must never take the feature down.
  const { records } = splitRecords('{"a":1}\nnot json\n{"b":2}\n');
  assert.deepStrictEqual(records, [{ a: 1 }, { b: 2 }]);
});

test('splitRecords on empty input yields nothing', () => {
  assert.deepStrictEqual(splitRecords(''), { records: [], rest: '' });
});

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddtail-')), 't.jsonl');

test('TranscriptTail emits records appended after start', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{"seq":0}\n');
  const seen = [];
  const tail = new TranscriptTail(file, (recs) => seen.push(...recs));
  tail.start();
  fs.appendFileSync(file, '{"seq":1}\n{"seq":2}\n');
  await new Promise((r) => setTimeout(r, 1500));
  tail.stop();
  assert.deepStrictEqual(seen.map((r) => r.seq), [0, 1, 2]);
});

test('TranscriptTail recovers when the file is truncated', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{"seq":1}\n{"seq":2}\n');
  const seen = [];
  const tail = new TranscriptTail(file, (recs) => seen.push(...recs));
  tail.start();
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(file, '{"seq":9}\n'); // shorter than the old read position
  await new Promise((r) => setTimeout(r, 1500));
  tail.stop();
  assert.ok(seen.some((r) => r.seq === 9), 'must re-read from 0 after truncation');
});

test('TranscriptTail on a missing file does not throw', () => {
  const tail = new TranscriptTail('/nonexistent/nope.jsonl', () => {});
  tail.start();
  tail.stop();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-transcript-tail'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-transcript-tail.ts
import * as fs from 'fs';

// Vendor-neutral JSONL follower. It has no idea what a message is; it hands
// raw records to an adapter. Polled rather than fs.watch-driven: watch is
// unreliable on network and virtualised filesystems, and a 1 s stat is cheap.

const POLL_MS = 1000;
const MAX_CHUNK = 4 << 20; // never read more than 4 MB in one pass

export function splitRecords(buffer: string): { records: unknown[]; rest: string } {
  const records: unknown[] = [];
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A vendor format change, or a line caught mid-write. Skip it; the
      // feature must degrade, never die.
    }
  }
  return { records, rest };
}

export class TranscriptTail {
  private position = 0;
  private partial = '';
  private timer: NodeJS.Timeout | null = null;
  lastGrowthMs = 0;

  constructor(
    private readonly path: string,
    private readonly onRecords: (records: unknown[]) => void
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.pump(), POLL_MS);
    this.pump();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // Read from position to EOF. Public so an initial replay can be forced.
  pump(): void {
    let size: number;
    try {
      size = fs.statSync(this.path).size;
    } catch {
      return; // rotated away or not created yet; try again next tick
    }
    if (size < this.position) {
      // Truncated or replaced. Anything else would emit garbage from the
      // middle of a line.
      this.position = 0;
      this.partial = '';
    }
    if (size === this.position) return;

    const length = Math.min(size - this.position, MAX_CHUNK);
    const buf = Buffer.alloc(length);
    let read = 0;
    try {
      const fd = fs.openSync(this.path, 'r');
      read = fs.readSync(fd, buf, 0, length, this.position);
      fs.closeSync(fd);
    } catch {
      return;
    }
    this.position += read;
    this.lastGrowthMs = Date.now();

    const { records, rest } = splitRecords(this.partial + buf.subarray(0, read).toString());
    this.partial = rest;
    if (records.length) this.onRecords(records);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-transcript-tail.ts packages/devdash-agent/test/ai-transcript-tail.test.js
git commit -m "feat(agent): poll-based JSONL transcript follower"
```

---

### Task 4: The normalized event, and the Claude Code adapter

**Files:**
- Create: `packages/devdash-agent/src/ai-adapters/types.ts`
- Create: `packages/devdash-agent/src/ai-adapters/claude.ts`
- Test: `packages/devdash-agent/test/ai-adapter-claude.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `type AiStatus = 'working' | 'waiting_input' | 'waiting_approval' | 'idle'`; `type AiEvent` (five variants, exactly as in the spec); `interface AiAdapter { toEvents(record: unknown): AiEvent[]; title(record: unknown): string | null }`; `PREVIEW_LIMIT`; `preview(text: string): string`; `claudeAdapter: AiAdapter`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-adapter-claude.test.js
const test = require('node:test');
const assert = require('node:assert');
const { claudeAdapter } = require('../dist/ai-adapters/claude');

const at = '2026-08-21T10:00:00.000Z';

test('a user record becomes one user message', () => {
  const events = claudeAdapter.toEvents({
    type: 'user', uuid: 'u1', timestamp: at,
    message: { role: 'user', content: [{ type: 'text', text: 'run the tests' }] },
  });
  assert.deepStrictEqual(events, [
    { kind: 'message', role: 'user', text: 'run the tests', id: 'u1', at },
  ]);
});

test('a plain string content is accepted as well as a block array', () => {
  const events = claudeAdapter.toEvents({
    type: 'user', uuid: 'u2', timestamp: at, message: { role: 'user', content: 'hello' },
  });
  assert.strictEqual(events[0].text, 'hello');
});

test('an assistant record splits text and tool_use into separate events', () => {
  const events = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a1', timestamp: at,
    message: { role: 'assistant', content: [
      { type: 'text', text: 'Running them now.' },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'npm test' } },
    ] },
  });
  assert.strictEqual(events.length, 2);
  assert.deepStrictEqual(events[0],
    { kind: 'message', role: 'assistant', text: 'Running them now.', id: 'a1', at });
  assert.deepStrictEqual(events[1], {
    kind: 'tool_call', name: 'Bash', summary: 'Bash: npm test',
    input: { command: 'npm test' }, id: 'tu1', at,
  });
});

test('tool summaries name the file for file tools', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a2', timestamp: at,
    message: { content: [
      { type: 'tool_use', id: 't', name: 'Edit', input: { file_path: '/srv/app/src/index.ts' } },
    ] },
  });
  assert.strictEqual(e.summary, 'Edit src/index.ts');
});

test('an unknown tool still gets a usable summary', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a3', timestamp: at,
    message: { content: [{ type: 'tool_use', id: 't', name: 'Weather', input: { city: 'Pune' } }] },
  });
  assert.strictEqual(e.summary, 'Weather');
});

test('tool_result becomes a truncated preview linked to its call', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'user', uuid: 'u3', timestamp: at,
    message: { content: [
      { type: 'tool_result', tool_use_id: 'tu1', is_error: false, content: 'x'.repeat(5000) },
    ] },
  });
  assert.strictEqual(e.kind, 'tool_result');
  assert.strictEqual(e.forId, 'tu1');
  assert.strictEqual(e.ok, true);
  assert.ok(e.preview.length < 5000, 'tool output can be megabytes');
});

test('a thinking block becomes a thinking event', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a4', timestamp: at,
    message: { content: [{ type: 'thinking', thinking: 'weighing options' }] },
  });
  assert.deepStrictEqual(e, { kind: 'thinking', text: 'weighing options', id: 'a4', at });
});

test('sidechain records are dropped', () => {
  // Subagent chatter would interleave incomprehensibly with the main thread.
  assert.deepStrictEqual(claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a5', timestamp: at, isSidechain: true,
    message: { content: [{ type: 'text', text: 'subagent noise' }] },
  }), []);
});

test('unknown record types and malformed records yield nothing, never throw', () => {
  assert.deepStrictEqual(claudeAdapter.toEvents({ type: 'file-history-snapshot' }), []);
  assert.deepStrictEqual(claudeAdapter.toEvents(null), []);
  assert.deepStrictEqual(claudeAdapter.toEvents({ type: 'user' }), []);
  assert.deepStrictEqual(claudeAdapter.toEvents('nonsense'), []);
});

test('an unknown content block renders as plain text rather than disappearing', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a6', timestamp: at,
    message: { content: [{ type: 'future_block_type', text: 'still readable' }] },
  });
  assert.strictEqual(e.kind, 'message');
  assert.strictEqual(e.text, 'still readable');
});

test('title reads custom-title, then last-prompt', () => {
  assert.strictEqual(
    claudeAdapter.title({ type: 'custom-title', customTitle: 'Fix the deploy' }), 'Fix the deploy');
  assert.strictEqual(
    claudeAdapter.title({ type: 'last-prompt', lastPrompt: 'why is CI red' }), 'why is CI red');
  assert.strictEqual(claudeAdapter.title({ type: 'assistant' }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-adapters/claude'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-adapters/types.ts

// The one shape the whole feature speaks. The browser never learns which
// vendor produced a session, which is the entire point of the adapter layer.

export type AiStatus = 'working' | 'waiting_input' | 'waiting_approval' | 'idle';

export type AiEvent =
  | { kind: 'message';     role: 'user' | 'assistant'; text: string; id: string; at: string }
  | { kind: 'tool_call';   name: string; summary: string; input: unknown; id: string; at: string }
  | { kind: 'tool_result'; forId: string; ok: boolean; preview: string; at: string }
  | { kind: 'thinking';    text: string; id: string; at: string }
  | { kind: 'state';       status: AiStatus; at: string };

export interface AiAdapter {
  // Never throws. An unrecognised record yields [].
  toEvents(record: unknown): AiEvent[];
  // A display title if this record carries one, else null.
  title(record: unknown): string | null;
}

// Tool output is routinely megabytes (a full test run, a large file read).
// Only a preview crosses the socket; the full text is never needed to follow
// a conversation, and shipping it would stall a phone on mobile data.
export const PREVIEW_LIMIT = 2000;

export function preview(text: string): string {
  return text.length <= PREVIEW_LIMIT ? text : `${text.slice(0, PREVIEW_LIMIT)}\n…truncated`;
}
```

```ts
// packages/devdash-agent/src/ai-adapters/claude.ts
import { AiAdapter, AiEvent, preview } from './types';

// Claude Code writes ~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl,
// one JSON record per line. `user` and `assistant` records carry a full
// Anthropic message object; the rest are session metadata.

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

// A short human string, so the UI never has to understand a tool's schema.
function summarize(name: string, input: any): string {
  if (input && typeof input === 'object') {
    if (typeof input.command === 'string') return `${name}: ${input.command}`;
    if (typeof input.file_path === 'string') {
      // Absolute paths are long and the leading directories are noise on a
      // phone; the last two segments identify the file well enough.
      const parts = input.file_path.split('/').filter(Boolean);
      return `${name} ${parts.slice(-2).join('/')}`;
    }
    if (typeof input.pattern === 'string') return `${name}: ${input.pattern}`;
  }
  return name;
}

export const claudeAdapter: AiAdapter = {
  toEvents(record: unknown): AiEvent[] {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return [];
    if (rec.type !== 'user' && rec.type !== 'assistant') return [];
    // Subagent output would interleave incomprehensibly with the main thread.
    if (rec.isSidechain) return [];

    const at: string = typeof rec.timestamp === 'string' ? rec.timestamp : '';
    const id: string = typeof rec.uuid === 'string' ? rec.uuid : '';
    const content = rec.message?.content;
    if (content == null) return [];

    if (typeof content === 'string') {
      if (!content) return [];
      return [{ kind: 'message', role: rec.type, text: content, id, at }];
    }
    if (!Array.isArray(content)) return [];

    const events: AiEvent[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      switch (block.type) {
        case 'tool_use':
          events.push({
            kind: 'tool_call', name: String(block.name || 'tool'),
            summary: summarize(String(block.name || 'tool'), block.input),
            input: block.input, id: String(block.id || id), at,
          });
          break;
        case 'tool_result':
          events.push({
            kind: 'tool_result', forId: String(block.tool_use_id || ''),
            ok: !block.is_error, preview: preview(textOf(block.content)), at,
          });
          break;
        case 'thinking':
          events.push({ kind: 'thinking', text: String(block.thinking || ''), id, at });
          break;
        default: {
          // Includes 'text' and any block type a future release introduces.
          // Rendering it as text keeps a new vendor format readable instead of
          // silently dropping half the conversation.
          const text = typeof block.text === 'string' ? block.text : '';
          if (text) events.push({ kind: 'message', role: rec.type, text, id, at });
        }
      }
    }
    return events;
  },

  title(record: unknown): string | null {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return null;
    if (rec.type === 'custom-title' && typeof rec.customTitle === 'string') return rec.customTitle;
    if (rec.type === 'last-prompt' && typeof rec.lastPrompt === 'string') return rec.lastPrompt;
    return null;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS — 11 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-adapters packages/devdash-agent/test/ai-adapter-claude.test.js
git commit -m "feat(agent): normalized AiEvent type and the Claude Code adapter"
```

---

### Task 5: The Codex adapter

Written now, not later, **specifically so the event schema cannot quietly become Claude-shaped.** A single adapter always leaks its vendor into a supposedly neutral format.

**Files:**
- Create: `packages/devdash-agent/src/ai-adapters/codex.ts`
- Create: `packages/devdash-agent/src/ai-adapters/index.ts`
- Test: `packages/devdash-agent/test/ai-adapter-codex.test.js`

**Interfaces:**
- Consumes: `AiAdapter`, `AiEvent` from `./types`; `AiKind` from `../ai-session-detector`.
- Produces: `codexAdapter: AiAdapter`; `adapterFor(kind: AiKind): AiAdapter`; re-exports everything from `./types`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-adapter-codex.test.js
const test = require('node:test');
const assert = require('node:assert');
const { codexAdapter } = require('../dist/ai-adapters/codex');
const { adapterFor } = require('../dist/ai-adapters/index');

const at = '2026-08-21T10:00:00.000Z';

test('a codex response_item message becomes a normalized message', () => {
  const events = codexAdapter.toEvents({
    timestamp: at, type: 'response_item',
    payload: { type: 'message', role: 'assistant', id: 'c1',
      content: [{ type: 'output_text', text: 'done' }] },
  });
  assert.deepStrictEqual(events, [
    { kind: 'message', role: 'assistant', text: 'done', id: 'c1', at },
  ]);
});

test('a codex user message keeps the user role', () => {
  const [e] = codexAdapter.toEvents({
    timestamp: at, type: 'response_item',
    payload: { type: 'message', role: 'user', id: 'c2', content: [{ text: 'go' }] },
  });
  assert.strictEqual(e.role, 'user');
});

test('session_meta yields a title from the cwd', () => {
  assert.strictEqual(
    codexAdapter.title({ type: 'session_meta', payload: { cwd: '/srv/app' } }), 'app');
});

test('unrecognised codex records yield nothing, never throw', () => {
  assert.deepStrictEqual(codexAdapter.toEvents({ type: 'turn_context' }), []);
  assert.deepStrictEqual(codexAdapter.toEvents(null), []);
  assert.deepStrictEqual(codexAdapter.toEvents({ type: 'response_item' }), []);
});

test('adapterFor returns a distinct adapter per kind', () => {
  assert.notStrictEqual(adapterFor('claude'), adapterFor('codex'));
  assert.strictEqual(typeof adapterFor('codex').toEvents, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-adapters/codex'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-adapters/codex.ts
import { AiAdapter, AiEvent } from './types';

// Codex writes ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl as
// { timestamp, type, payload } where type is
// session_meta | turn_context | event_msg | response_item.
//
// Deliberately minimal in v1: messages and titles only. Its purpose is to keep
// the AiEvent schema honest, not to reach parity with the Claude adapter.

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

export const codexAdapter: AiAdapter = {
  toEvents(record: unknown): AiEvent[] {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return [];
    if (rec.type !== 'response_item') return [];
    const payload = rec.payload;
    if (!payload || payload.type !== 'message') return [];

    const text = textOf(payload.content);
    if (!text) return [];
    return [{
      kind: 'message',
      role: payload.role === 'user' ? 'user' : 'assistant',
      text,
      id: String(payload.id || ''),
      at: typeof rec.timestamp === 'string' ? rec.timestamp : '',
    }];
  },

  title(record: unknown): string | null {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return null;
    // Codex records no user-facing title, so the folder is the best available.
    if (rec.type === 'session_meta' && typeof rec.payload?.cwd === 'string') {
      const parts = rec.payload.cwd.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    }
    return null;
  },
};
```

```ts
// packages/devdash-agent/src/ai-adapters/index.ts
import { AiKind } from '../ai-session-detector';
import { AiAdapter } from './types';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';

const ADAPTERS: Record<AiKind, AiAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export function adapterFor(kind: AiKind): AiAdapter {
  return ADAPTERS[kind];
}

export * from './types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-adapters packages/devdash-agent/test/ai-adapter-codex.test.js
git commit -m "feat(agent): minimal Codex adapter and the adapter registry"
```

---

### Task 6: Derive session status from the event stream

**Files:**
- Create: `packages/devdash-agent/src/ai-status.ts`
- Test: `packages/devdash-agent/test/ai-status.test.js`

**Interfaces:**
- Consumes: `AiEvent`, `AiStatus` from `./ai-adapters/types`.
- Produces: `deriveStatus(events: AiEvent[], lastGrowthMs: number, nowMs: number): AiStatus`; constants `IDLE_MS = 300_000`, `APPROVAL_MS = 3_000`, `INPUT_MS = 2_000`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-status.test.js
const test = require('node:test');
const assert = require('node:assert');
const { deriveStatus } = require('../dist/ai-status');

const NOW = 1_000_000;
const msg = (role) => ({ kind: 'message', role, text: 'x', id: 'm', at: '' });
const call = (id) => ({ kind: 'tool_call', name: 'Bash', summary: 'Bash', input: {}, id, at: '' });
const result = (forId) => ({ kind: 'tool_result', forId, ok: true, preview: '', at: '' });

// The four rules overlap by construction, so they are evaluated in order and
// the first match wins. Each test below pins one row of that table.

test('rule 1: no growth for over five minutes is idle', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 400_000, NOW), 'idle');
});

test('rule 1 beats rule 2: an old unresolved tool call is idle, not waiting', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 400_000, NOW), 'idle');
});

test('rule 2: a tool call unresolved for over three seconds is waiting_approval', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 5_000, NOW), 'waiting_approval');
});

test('rule 2 does not fire while the call is still fresh', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 1_000, NOW), 'working');
});

test('a resolved tool call is not waiting_approval', () => {
  assert.strictEqual(
    deriveStatus([call('t1'), result('t1')], NOW - 5_000, NOW), 'working');
});

test('rule 3: a settled assistant message is waiting_input', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 10_000, NOW), 'waiting_input');
});

test('rule 3 does not fire before the settle window', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 500, NOW), 'working');
});

test('rule 4: a fresh user message means the agent is working', () => {
  assert.strictEqual(deriveStatus([msg('user')], NOW - 500, NOW), 'working');
});

test('a settled user message is still working — the agent owes a reply', () => {
  assert.strictEqual(deriveStatus([msg('user')], NOW - 10_000, NOW), 'working');
});

test('an empty stream is idle', () => {
  assert.strictEqual(deriveStatus([], 0, NOW), 'idle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-status'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-status.ts
import { AiEvent, AiStatus } from './ai-adapters/types';

// Status is derived from the transcript alone, never from the TUI.
//
// The rules overlap by construction — an unresolved tool call is also a
// growing transcript — so they are evaluated in order and the first match
// wins. Changing the order changes the meaning.

export const IDLE_MS = 300_000;
export const APPROVAL_MS = 3_000;
export const INPUT_MS = 2_000;

export function deriveStatus(
  events: AiEvent[],
  lastGrowthMs: number,
  nowMs: number
): AiStatus {
  if (!events.length) return 'idle';
  const quietFor = nowMs - lastGrowthMs;

  // 1. Nothing has happened for a long time.
  if (quietFor > IDLE_MS) return 'idle';

  // 2. A tool call with no matching result. In attach mode the permission
  // prompt itself is not a typed event, so an unresolved call that has sat
  // still is the best available signal that the CLI is asking to proceed.
  const resolved = new Set<string>();
  for (const e of events) if (e.kind === 'tool_result') resolved.add(e.forId);
  const unresolved = events.some((e) => e.kind === 'tool_call' && !resolved.has(e.id));
  if (unresolved && quietFor > APPROVAL_MS) return 'waiting_approval';

  // 3. A complete assistant message that has settled: the agent has finished
  // and the ball is with the user.
  const last = events[events.length - 1];
  if (last.kind === 'message' && last.role === 'assistant' && quietFor > INPUT_MS) {
    return 'waiting_input';
  }

  // 4. Anything else: the transcript is advancing, or the last thing said was
  // the user's and a reply is owed.
  return 'working';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/ai-status.ts packages/devdash-agent/test/ai-status.test.js
git commit -m "feat(agent): derive AI session status from the transcript"
```

---

### Task 7: Wire the agent — discovery, tailing and input

**Files:**
- Create: `packages/devdash-agent/src/ai-sessions.ts`
- Modify: `packages/devdash-agent/src/websocket.ts` (imports at top; poll loop beside `pollTmuxSessions`; `startAiPolling()` beside `startTmuxPolling()` at ~line 98; new cases in `handleMessage`)
- Test: `packages/devdash-agent/test/ai-sessions.test.js`

**Interfaces:**
- Consumes: `findAgentInPane`, `readProcessTable`, `ProcRow`, `AiKind` (Task 1); `locateTranscript` (Task 2); `TranscriptTail` (Task 3); `adapterFor`, `AiEvent`, `AiStatus` (Task 5); `deriveStatus` (Task 6); `listSessions` from `./tmux-manager`.
- Produces: `interface AiSessionSummary { tmuxName, kind, title, folder, folderPath, gitBranch, profile, status, updatedAt }`; `discoverAiSessions(deps?): Promise<AiSessionSummary[]>`; `openAiSession(tmuxName, onEvents): void`; `closeAiSession(tmuxName): void`; `closeAllAiSessions(): void`; `sendAiInput(tmuxName, text, deps?): void`; `sendKeysArgs(tmuxName, text): string[][]`; `REPLAY_LIMIT`.

- [ ] **Step 1: Write the failing test**

```js
// packages/devdash-agent/test/ai-sessions.test.js
const test = require('node:test');
const assert = require('node:assert');
const { sendKeysArgs, discoverAiSessions } = require('../dist/ai-sessions');

const ESC = '\u001b';    // the byte a phone's Esc chip sends
const CTRL_C = '\u0003'; // the byte a phone's Ctrl-C chip sends

test('sendKeysArgs sends the text literally, then Enter', () => {
  assert.deepStrictEqual(sendKeysArgs('dd-abc', 'yes please'), [
    ['send-keys', '-t', 'dd-abc', '-l', '--', 'yes please'],
    ['send-keys', '-t', 'dd-abc', 'Enter'],
  ]);
});

test('sendKeysArgs does not let text starting with a dash become a flag', () => {
  // Without the -- terminator tmux would parse '-X ...' as an option, which
  // turns composed text into tmux commands.
  const [literal] = sendKeysArgs('dd-abc', '-X kill-session');
  assert.strictEqual(literal[literal.length - 2], '--');
  assert.strictEqual(literal[literal.length - 1], '-X kill-session');
});

test('sendKeysArgs maps a bare control key to a key press, not literal text', () => {
  assert.deepStrictEqual(sendKeysArgs('dd-abc', ESC), [
    ['send-keys', '-t', 'dd-abc', 'Escape'],
  ]);
  assert.deepStrictEqual(sendKeysArgs('dd-abc', CTRL_C), [
    ['send-keys', '-t', 'dd-abc', 'C-c'],
  ]);
});

test('discoverAiSessions returns one entry per pane running an AI CLI', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: 'main', lastActivity: 1 },
      { name: 'plain', folder: 'x', folderPath: '/srv/x', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: (name) => (name === 'dd-a' ? 100 : 200),
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: '/home/d/.local/share/claude/versions/2.1.238' },
      { pid: 200, ppid: 1, command: '-zsh' },
    ]),
    locate: () => '/home/d/.claude/projects/-srv-app/s.jsonl',
    profileOf: () => 'default',
  });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].tmuxName, 'dd-a');
  assert.strictEqual(found[0].kind, 'claude');
  assert.strictEqual(found[0].folder, 'app');
});

test('discoverAiSessions skips a pane whose transcript cannot be located', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: () => 100,
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: 'claude' },
    ]),
    locate: () => null,
    profileOf: () => 'default',
  });
  assert.deepStrictEqual(found, []);
});

test('discoverAiSessions surfaces the profile so two subscriptions stay apart', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: () => 100,
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: 'claude' },
    ]),
    locate: () => '/x/s.jsonl',
    profileOf: () => '.iclaude',
  });
  assert.strictEqual(found[0].profile, '.iclaude');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../dist/ai-sessions'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/devdash-agent/src/ai-sessions.ts
import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import { AiKind, findAgentInPane, readProcessTable, ProcRow } from './ai-session-detector';
import { locateTranscript } from './ai-transcript-locator';
import { TranscriptTail } from './ai-transcript-tail';
import { adapterFor, AiEvent, AiStatus } from './ai-adapters';
import { deriveStatus } from './ai-status';
import { listSessions } from './tmux-manager';

export interface AiSessionSummary {
  tmuxName: string;
  kind: AiKind;
  title: string;
  folder: string;
  folderPath: string;
  gitBranch: string;
  profile: string;
  status: AiStatus;
  updatedAt: number;
}

// Replay cap. Opening a month-old session must not flood the socket, and a
// phone cannot render ten thousand bubbles anyway.
export const REPLAY_LIMIT = 200;

interface LiveSession {
  tail: TranscriptTail;
  events: AiEvent[];
  kind: AiKind;
  title: string;
}

const open = new Map<string, LiveSession>();

export interface DiscoverDeps {
  listSessions?: () => Promise<any[]>;
  panePid?: (tmuxName: string) => number;
  processTable?: () => Promise<ProcRow[]>;
  locate?: (pid: number, kind: AiKind) => string | null;
  profileOf?: (pid: number) => string;
}

function defaultPanePid(tmuxName: string): number {
  try {
    const out = execFileSync('tmux', ['list-panes', '-t', tmuxName, '-F', '#{pane_pid}'],
      { timeout: 5000, stdio: 'pipe' }).toString();
    return parseInt(out.split('\n')[0], 10) || 0;
  } catch {
    return 0;
  }
}

// The label that keeps two Claude subscriptions on one machine apart. DevDash
// never sees an account — only which config home the process was started with.
function defaultProfileOf(pid: number): string {
  try {
    const env = process.platform === 'linux'
      ? fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
      : execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='],
          { timeout: 5000, stdio: 'pipe' }).toString();
    const m = env.match(/CLAUDE_CONFIG_DIR=([^\s\0]+)/);
    if (!m) return 'default';
    const parts = m[1].split('/').filter(Boolean);
    return parts[parts.length - 1] || 'default';
  } catch {
    return 'default';
  }
}

export async function discoverAiSessions(deps: DiscoverDeps = {}): Promise<AiSessionSummary[]> {
  const list = deps.listSessions || listSessions;
  const panePid = deps.panePid || defaultPanePid;
  const table = deps.processTable || (() => readProcessTable());
  const locate = deps.locate || ((pid: number, kind: AiKind) => locateTranscript(pid, kind));
  const profileOf = deps.profileOf || defaultProfileOf;

  const rows = await table();
  const out: AiSessionSummary[] = [];
  for (const session of await list()) {
    const pid = panePid(session.name);
    if (!pid) continue;
    const agent = findAgentInPane(rows, pid);
    if (!agent) continue;
    // A session whose transcript cannot be found is not showable as chat.
    // Listing it would produce a row that opens into permanent emptiness.
    if (!locate(agent.pid, agent.kind)) continue;

    const live = open.get(session.name);
    out.push({
      tmuxName: session.name,
      kind: agent.kind,
      title: live?.title || session.folder || session.name,
      folder: session.folder || '',
      folderPath: session.folderPath || '',
      gitBranch: session.gitBranch || '',
      profile: profileOf(agent.pid),
      status: live ? deriveStatus(live.events, live.tail.lastGrowthMs, Date.now()) : 'idle',
      updatedAt: (session.lastActivity || 0) * 1000,
    });
  }
  return out;
}

export function openAiSession(
  tmuxName: string,
  onEvents: (events: AiEvent[], status: AiStatus) => void
): void {
  closeAiSession(tmuxName);

  void (async () => {
    const table = await readProcessTable();
    const pid = defaultPanePid(tmuxName);
    const agent = pid ? findAgentInPane(table, pid) : null;
    if (!agent) return;
    const path = locateTranscript(agent.pid, agent.kind);
    if (!path) return;

    const adapter = adapterFor(agent.kind);
    const live: LiveSession = {
      tail: null as unknown as TranscriptTail,
      events: [], kind: agent.kind, title: '',
    };

    live.tail = new TranscriptTail(path, (records) => {
      const batch: AiEvent[] = [];
      for (const record of records) {
        const title = adapter.title(record);
        if (title) live.title = title;
        batch.push(...adapter.toEvents(record));
      }
      live.events.push(...batch);
      // Bound memory: a long session's transcript is unbounded, the agent's
      // heap is not.
      if (live.events.length > REPLAY_LIMIT * 5) {
        live.events = live.events.slice(-REPLAY_LIMIT * 5);
      }
      if (batch.length) {
        onEvents(batch, deriveStatus(live.events, live.tail.lastGrowthMs, Date.now()));
      }
    });

    open.set(tmuxName, live);
    live.tail.start();
  })();
}

export function closeAiSession(tmuxName: string): void {
  const live = open.get(tmuxName);
  if (!live) return;
  live.tail.stop();
  open.delete(tmuxName);
}

export function closeAllAiSessions(): void {
  for (const name of Array.from(open.keys())) closeAiSession(name);
}

// Named keys must be sent as key presses, not literal text: sending the byte
// 0x03 literally types a control character into the buffer instead of
// interrupting the agent.
const NAMED_KEYS: Record<string, string> = {
  '\u001b': 'Escape',
  '\u0003': 'C-c',
  '\r': 'Enter',
  '\t': 'Tab',
};

export function sendKeysArgs(tmuxName: string, text: string): string[][] {
  const named = NAMED_KEYS[text];
  if (named) return [['send-keys', '-t', tmuxName, named]];
  return [
    // `-l` sends literally; `--` stops tmux parsing text that starts with '-'
    // as an option, which would otherwise let composed text run tmux commands.
    ['send-keys', '-t', tmuxName, '-l', '--', text],
    ['send-keys', '-t', tmuxName, 'Enter'],
  ];
}

export interface SendDeps {
  run?: (args: string[]) => void;
}

export function sendAiInput(tmuxName: string, text: string, deps: SendDeps = {}): void {
  const run = deps.run || ((args: string[]) => {
    execFile('tmux', args, { timeout: 5000 }, () => { /* best effort */ });
  });
  for (const args of sendKeysArgs(tmuxName, text)) run(args);
}
```

Then in `packages/devdash-agent/src/websocket.ts`, add to the imports at the top:

```ts
import {
  discoverAiSessions, openAiSession, closeAiSession, closeAllAiSessions, sendAiInput,
} from './ai-sessions';
```

add the poll loop beside the existing tmux one (near line 46):

```ts
let aiPollTimer: NodeJS.Timeout | null = null;
let lastAiSnapshot = '';
const AI_POLL_MS = 5000;

async function pollAiSessions(): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const sessions = await discoverAiSessions();
    const snapshot = JSON.stringify(sessions);
    if (snapshot === lastAiSnapshot) return;
    lastAiSnapshot = snapshot;
    ws.send(JSON.stringify({ type: 'ai_session_list', sessions }));
  } catch (err: any) {
    console.error('[devdash-agent] ai session poll failed:', err.message);
  }
}

function startAiPolling(): void {
  stopAiPolling();
  lastAiSnapshot = '';
  aiPollTimer = setInterval(() => { void pollAiSessions(); }, AI_POLL_MS);
  void pollAiSessions();
}

function stopAiPolling(): void {
  if (aiPollTimer) { clearInterval(aiPollTimer); aiPollTimer = null; }
  closeAllAiSessions();
}
```

call `startAiPolling();` immediately after the existing `startTmuxPolling();` in the `open` handler, call `stopAiPolling();` everywhere `stopTmuxPolling()` is called, and add these cases to `handleMessage`:

```ts
    case 'ai_session_list_request': {
      const sessions = await discoverAiSessions();
      ws.send(JSON.stringify({ type: 'ai_session_list', requestId: msg.requestId, sessions }));
      break;
    }

    case 'ai_session_open': {
      const name = String(msg.tmuxName || '');
      if (!name) break;
      openAiSession(name, (events, status) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ai_session_events', tmuxName: name, events, status }));
        }
      });
      break;
    }

    case 'ai_session_close': {
      closeAiSession(String(msg.tmuxName || ''));
      break;
    }

    case 'ai_session_input': {
      // Input is keystrokes into the pane: a natively-launched TUI cannot
      // accept structured input. This is the ceiling of attach mode.
      if (msg.tmuxName && typeof msg.text === 'string') {
        sendAiInput(String(msg.tmuxName), msg.text);
      }
      break;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -10`
Expected: PASS — including the existing `websocket.test.js`.

- [ ] **Step 5: Verify against a real session**

With a real `claude` running in a tmux session on this machine:

```bash
cd packages/devdash-agent && npm run build && node -e "require('./dist/ai-sessions').discoverAiSessions().then(s => console.log(JSON.stringify(s, null, 2)))"
```

Expected: at least one entry with the right `folder`, `kind: 'claude'`, and a `profile` matching the config dir that session was started with. **If `profile` is wrong for a second-subscription session, stop and fix it here** — it is the feature's headline benefit.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/ai-sessions.ts packages/devdash-agent/src/websocket.ts packages/devdash-agent/test/ai-sessions.test.js
git commit -m "feat(agent): discover, tail and type into AI CLI sessions

Sessions whose transcript cannot be located are not listed: a row that
opens into permanent emptiness is worse than no row."
```

---

### Task 8: Relay through the ws-server

**Files:**
- Modify: `src/ws-server/index.ts` — new `handleDaemonMessage` cases beside `case 'tmux_sessions'` (~line 555); new `request*()` exports after `requestFsBrowse` (~line 875); `PRIVILEGED_PREFIXES` at line 1042; new HTTP routes after the `/browse/` branch (~line 1093)

**Interfaces:**
- Consumes: the agent messages from Task 7 (`ai_session_list`, `ai_session_events`).
- Produces: `requestAiSessions(machineId: number): Promise<any[] | null>`; `openAiSession(machineId: number, tmuxName: string): boolean`; `closeAiSession(machineId: number, tmuxName: string): boolean`; `sendAiInput(machineId: number, tmuxName: string, text: string): boolean`. HTTP: `POST /ai-sessions/:machineId`, `/ai-open/:machineId`, `/ai-close/:machineId`, `/ai-input/:machineId`.

- [ ] **Step 1: Add the daemon message cases**

In `handleDaemonMessage`, beside the existing `case 'tmux_sessions':`:

```ts
    case 'ai_session_list': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        pendingRequests.delete(msg.requestId);
        resolver(msg);
      }
      // Unsolicited polls also refresh every open dashboard, so a session
      // changing status updates the list without anyone asking.
      broadcastDashboard({
        type: 'ai_session_list', machineId, sessions: msg.sessions || [],
      });
      break;
    }

    case 'ai_session_events': {
      // Transcript content is deliberately NOT logged here — it contains
      // everything the model saw, including any secrets in the repository.
      broadcastDashboard({
        type: 'ai_session_events',
        machineId,
        tmuxName: msg.tmuxName,
        events: msg.events || [],
        status: msg.status,
      });
      break;
    }
```

- [ ] **Step 2: Add the request functions**

After `requestFsBrowse`:

```ts
export async function requestAiSessions(machineId: number): Promise<any[] | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result.sessions || []);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_session_list_request', requestId }));
  });
}

// Fire-and-forget: a tail produces many messages over time rather than one
// reply, so these answer as broadcast ai_session_events, not as a resolution.
function sendToDaemon(machineId: number, payload: Record<string, unknown>): boolean {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return false;
  daemon.ws.send(JSON.stringify(payload));
  return true;
}

export function openAiSession(machineId: number, tmuxName: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_open', tmuxName });
}

export function closeAiSession(machineId: number, tmuxName: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_close', tmuxName });
}

export function sendAiInput(machineId: number, tmuxName: string, text: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_input', tmuxName, text });
}
```

- [ ] **Step 3: Add the HTTP routes and gate them**

Change line 1042 to include the new prefixes:

```ts
  const PRIVILEGED_PREFIXES = ['/scan/', '/check/', '/browse/', '/project-scan/',
    '/run-command/', '/kill-tmux/', '/ai-sessions/', '/ai-open/', '/ai-close/', '/ai-input/'];
```

Then after the `/browse/` branch:

```ts
  } else if (url.pathname.startsWith('/ai-sessions/') && req.method === 'POST') {
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const sessions = await requestAiSessions(machineId);
    if (sessions === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
    }

  } else if ((url.pathname.startsWith('/ai-open/') || url.pathname.startsWith('/ai-close/')
              || url.pathname.startsWith('/ai-input/')) && req.method === 'POST') {
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const tmuxName = String(body.tmuxName || '');
    let ok = false;
    if (url.pathname.startsWith('/ai-open/')) ok = openAiSession(machineId, tmuxName);
    else if (url.pathname.startsWith('/ai-close/')) ok = closeAiSession(machineId, tmuxName);
    else ok = sendAiInput(machineId, tmuxName, String(body.text || ''));

    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true } : { error: 'Machine offline' }));
```

- [ ] **Step 4: Verify it compiles and the ws-server still starts**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

Run: `npm run ws:start`
Expected: starts without the missing-secret error and logs its listen line. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add src/ws-server/index.ts
git commit -m "feat(ws-server): relay AI session list, events and input

Transcript content is never logged here; it carries whatever the model saw."
```

---

### Task 9: Next.js bridge and API routes

**Files:**
- Modify: `src/lib/daemon-status.ts` (append after `requestFsBrowse`)
- Create: `src/app/api/ai-sessions/route.ts`
- Create: `src/app/api/ai-sessions/[machineId]/[tmuxName]/route.ts`

**Interfaces:**
- Consumes: the ws-server HTTP routes from Task 8.
- Produces: `interface AiSessionSummary` (client-side copy); `requestAiSessions(machineId: number): Promise<AiSessionSummary[] | null>`; `aiSessionCommand(machineId, action, tmuxName, text?): Promise<boolean>`. REST: `GET /api/ai-sessions?machineId=`, `POST /api/ai-sessions/[machineId]/[tmuxName]`.

- [ ] **Step 1: Add the daemon-status wrappers**

```ts
// src/lib/daemon-status.ts — append

export interface AiSessionSummary {
  tmuxName: string;
  kind: 'claude' | 'codex';
  title: string;
  folder: string;
  folderPath: string;
  gitBranch: string;
  profile: string;
  status: 'working' | 'waiting_input' | 'waiting_approval' | 'idle';
  updatedAt: number;
}

export async function requestAiSessions(
  machineId: number
): Promise<AiSessionSummary[] | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-sessions/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return null;
  }
}

export async function aiSessionCommand(
  machineId: number,
  action: 'open' | 'close' | 'input',
  tmuxName: string,
  text?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/ai-${action}/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({ tmuxName, text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Add the list route**

```ts
// src/app/api/ai-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isEnrolled } from '@/lib/two-factor';
import { requestAiSessions } from '@/lib/daemon-status';

// Session + 2FA are checked here deliberately. An AI session transcript is at
// least as sensitive as a terminal, so this follows the enforced routes, not
// the handful of legacy ones that trust the caller.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const machineId = parseInt(req.nextUrl.searchParams.get('machineId') || '', 10)
    || session.machineId;

  const sessions = await requestAiSessions(machineId);
  if (sessions === null) {
    return NextResponse.json({ sessions: [], offline: true });
  }
  return NextResponse.json({ sessions, offline: false });
}
```

**Before writing this, confirm the two imports exist:** run `grep -n "export async function getSession" src/lib/auth.ts` and `grep -rn "export async function isEnrolled" src/lib/`. If `isEnrolled` lives elsewhere, import it from where it actually is — do not invent a module.

- [ ] **Step 3: Add the command route**

```ts
// src/app/api/ai-sessions/[machineId]/[tmuxName]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isEnrolled } from '@/lib/two-factor';
import { aiSessionCommand } from '@/lib/daemon-status';

const ACTIONS = new Set(['open', 'close', 'input']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ machineId: string; tmuxName: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrollment required' }, { status: 403 });
  }

  const { machineId, tmuxName } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const ok = await aiSessionCommand(
    parseInt(machineId, 10), action as 'open' | 'close' | 'input',
    decodeURIComponent(tmuxName), typeof body.text === 'string' ? body.text : undefined
  );
  return NextResponse.json(ok ? { ok: true } : { error: 'Machine offline' },
    { status: ok ? 200 : 503 });
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build 2>&1 | tail -25`
Expected: build succeeds; `/api/ai-sessions` and `/api/ai-sessions/[machineId]/[tmuxName]` both appear in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/daemon-status.ts src/app/api/ai-sessions
git commit -m "feat(api): AI session list and command routes

Both enforce session + 2FA: a transcript is at least as sensitive as a
terminal, so these follow the enforced routes, not the legacy ones."
```

---

### Task 10: The session list page

**Files:**
- Create: `src/components/ai/AiStatusDot.tsx`
- Create: `src/app/(dash)/ai/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx` (nav item beside Terminals)

**Interfaces:**
- Consumes: `GET /api/ai-sessions` (Task 9); `useDashboard()` for `session`.
- Produces: `AiStatusDot({ status }: { status: string })`.

- [ ] **Step 1: Write the status dot**

```tsx
// src/components/ai/AiStatusDot.tsx
'use client';

const LABELS: Record<string, { label: string; color: string }> = {
  working:          { label: 'Working',   color: 'var(--live)' },
  waiting_approval: { label: 'Needs you', color: 'var(--static)' },
  waiting_input:    { label: 'Waiting',   color: 'var(--accent)' },
  idle:             { label: 'Idle',      color: 'var(--dim)' },
};

export default function AiStatusDot({ status }: { status: string }) {
  const meta = LABELS[status] || LABELS.idle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                   color: 'var(--muted)', flexShrink: 0 }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%',
                                 background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 2: Write the list page**

```tsx
// src/app/(dash)/ai/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import AiStatusDot from '@/components/ai/AiStatusDot';
import { useDashboard } from '@/components/dashboard/DashboardContext';

interface AiSession {
  tmuxName: string; kind: string; title: string; folder: string;
  gitBranch: string; profile: string; status: string; updatedAt: number;
}

// Scoped to the selected machine, matching the model the sidebar picker,
// projects and terminals all already use.
export default function AiSessionsPage() {
  const { session } = useDashboard();
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
      setOffline(!!data.offline);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="AI Sessions"
        subtitle="Every agent CLI running on your machines."
        icon={<Bot size={20} />}
        actions={
          <button className="btn-ghost" onClick={() => void load()}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {loading ? (
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>Looking for sessions…</p>
      ) : offline ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
          This machine&rsquo;s agent is offline, so its sessions cannot be listed.
        </p>
      ) : sessions.length === 0 ? (
        <div style={{ maxWidth: '62ch' }}>
          <p style={{ color: 'var(--txt)', fontSize: 15, marginBottom: 8 }}>
            No agent sessions running.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7 }}>
            Start <code>claude</code> or <code>codex</code> in a terminal on this machine and it
            will appear here within a few seconds. The session has to be inside tmux — run{' '}
            <code>devdash-agent setup-cowork</code> once if your terminals are not wrapped yet.
          </p>
        </div>
      ) : (
        <ul style={{ display: 'grid', gap: 8, listStyle: 'none', padding: 0 }}>
          {sessions.map((s) => (
            <li key={s.tmuxName}>
              <Link
                href={`/ai/${session?.machineId}/${encodeURIComponent(s.tmuxName)}`}
                className="card"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                         gap: 12, padding: '14px 16px' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--txt)', fontSize: 14.5,
                                 fontWeight: 500, overflow: 'hidden',
                                 textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </span>
                  <span style={{ display: 'block', color: 'var(--dim)', fontSize: 12,
                                 marginTop: 3 }}>
                    {s.kind} · {s.folder}{s.gitBranch ? ` · ${s.gitBranch}` : ''}
                    {s.profile !== 'default' ? ` · ${s.profile}` : ''}
                  </span>
                </span>
                <AiStatusDot status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar entry**

Open `src/components/dashboard/Sidebar.tsx`, find the nav array containing the Terminals entry, and add an item in the same shape the neighbouring entries use, importing `Bot` from `lucide-react`:

```tsx
{ href: '/ai', label: 'AI Sessions', icon: Bot },
```

- [ ] **Step 4: Verify**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds and `/ai` appears in the route list.

Then `npm run dev`, sign in, open `/ai` with a real `claude` running in tmux.
Expected: the session is listed with its folder and branch. **Also check the offline state** by stopping the agent — it must say the agent is offline rather than showing a bare empty list.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dash)/ai" src/components/ai src/components/dashboard/Sidebar.tsx
git commit -m "feat(ui): AI Sessions list page"
```

---

### Task 11: The chat view

**Files:**
- Create: `src/components/ai/AiChat.tsx`
- Create: `src/components/ai/AiComposer.tsx`
- Create: `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/ai-sessions/[machineId]/[tmuxName]` (Task 9); `AiStatusDot` (Task 10); the `ai_session_events` dashboard event (Task 8).
- Produces: the finished feature.

- [ ] **Step 1: Write the chat renderer**

```tsx
// src/components/ai/AiChat.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Terminal, Wrench } from 'lucide-react';

export interface AiEvent {
  kind: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'state';
  role?: 'user' | 'assistant';
  text?: string;
  name?: string;
  summary?: string;
  preview?: string;
  ok?: boolean;
  id?: string;
  forId?: string;
  at?: string;
}

export default function AiChat({ events }: { events: AiEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the tail, the way a terminal does. Keyed on length rather than the
  // array identity so a re-render with no new events does not yank the user
  // back down while they are reading history.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length]);

  return (
    <div style={{ display: 'grid', gap: 10, padding: '12px 0' }}>
      {events.map((e, i) => {
        if (e.kind === 'message') {
          const mine = e.role === 'user';
          return (
            <div key={`${e.id}-${i}`}
                 style={{ justifySelf: mine ? 'end' : 'start', maxWidth: '85%' }}>
              <div style={{
                background: mine ? 'var(--accent-weak)' : 'var(--card)',
                border: '1px solid var(--b1)', borderRadius: 14,
                padding: '10px 13px', color: 'var(--txt)', fontSize: 14.5,
                lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}>
                {e.text}
              </div>
            </div>
          );
        }
        if (e.kind === 'tool_call') {
          return (
            <div key={`${e.id}-${i}`}
                 style={{ display: 'flex', alignItems: 'center', gap: 8,
                          color: 'var(--muted)', fontSize: 12.5,
                          fontFamily: "'JetBrains Mono', monospace" }}>
              <Wrench size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap' }}>{e.summary}</span>
            </div>
          );
        }
        if (e.kind === 'tool_result') {
          // Collapsed by default: tool output is long and rarely what the
          // reader came for, but hiding it entirely would lose the errors.
          return (
            <details key={`${e.forId}-${i}`}
                     style={{ fontSize: 12,
                              color: e.ok ? 'var(--dim)' : 'var(--offline)' }}>
              <summary style={{ cursor: 'pointer' }}>
                <Terminal size={12} style={{ display: 'inline', marginRight: 5 }} />
                {e.ok ? 'output' : 'failed'}
              </summary>
              <pre style={{ marginTop: 6, padding: 10, background: 'var(--bg-sub)',
                            borderRadius: 8, overflowX: 'auto', fontSize: 11.5,
                            lineHeight: 1.6 }}>{e.preview}</pre>
            </details>
          );
        }
        return null; // thinking and state are not bubbles in v1
      })}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 2: Write the composer**

```tsx
// src/components/ai/AiComposer.tsx
'use client';

import { useState } from 'react';
import { Send, Lock, Unlock } from 'lucide-react';

// Typing here injects keystrokes into a pane the user may also be sitting in
// front of. The lock is not decoration: two inputs into one TUI interleave
// into nonsense, so taking input is always an explicit act.
export default function AiComposer({
  attachedElsewhere,
  onSend,
}: {
  attachedElsewhere: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const locked = attachedElsewhere && !unlocked;

  const submit = () => {
    const value = text.trim();
    if (!value || locked) return;
    onSend(value);
    setText('');
  };

  return (
    <div style={{ borderTop: '1px solid var(--b1)', background: 'var(--card)',
                  padding: '10px 12px', display: 'grid', gap: 8 }}>
      {attachedElsewhere && (
        <button
          onClick={() => setUnlocked((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
                   color: unlocked ? 'var(--static)' : 'var(--muted)' }}
        >
          {unlocked ? <Unlock size={13} /> : <Lock size={13} />}
          {unlocked
            ? 'You are typing into a session open at your desk'
            : 'Also attached at your desk — tap to take input'}
        </button>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          disabled={locked}
          placeholder={locked ? 'Locked' : 'Message the agent…'}
          style={{ flex: 1, minHeight: 44, maxHeight: 140, resize: 'none',
                   background: 'var(--bg-sub)', border: '1px solid var(--b1)',
                   borderRadius: 12, padding: '11px 13px', color: 'var(--txt)',
                   /* 16px stops iOS zooming the page when the field is focused */
                   fontSize: 16 }}
        />
        <button className="btn-grad" onClick={submit} disabled={locked}
                aria-label="Send"
                style={{ height: 44, width: 44, padding: 0, display: 'grid',
                         placeItems: 'center' }}>
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire KeyChipBar into the composer**

The spec decides the composer reuses `KeyChipBar` rather than growing a new key
palette: answering a TUI means sending single keys far more often than
sentences, and that component already solves this on the mobile terminal.

First confirm its contract: `grep -n "interface KeyChipBarProps" -A 10 src/components/KeyChipBar.tsx`.
As of writing it takes `onSend`, `ctrlState`, `onCtrlStateChange`, `enabledKeys`
and `haptics`. Then add it to `AiComposer`, above the textarea row:

```tsx
import KeyChipBar from '@/components/KeyChipBar';

// beside the existing `unlocked` state:
const [ctrlState, setCtrlState] = useState(false);

// in the returned markup, directly above the textarea row:
{!locked && (
  <KeyChipBar
    onSend={onSend}
    ctrlState={ctrlState}
    onCtrlStateChange={setCtrlState}
  />
)}
```

`KeyChipBar` emits raw control bytes, which is exactly what the `NAMED_KEYS`
table in `sendKeysArgs` maps back to tmux key names — so Esc and Ctrl-C arrive
as key presses rather than as literal characters typed into the buffer.

- [ ] **Step 4: Write the page**

```tsx
// src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import AiChat, { AiEvent } from '@/components/ai/AiChat';
import AiComposer from '@/components/ai/AiComposer';
import AiStatusDot from '@/components/ai/AiStatusDot';
import { useDashboardSocket } from '@/hooks/useDashboardSocket';

export default function AiSessionPage() {
  const params = useParams();
  const router = useRouter();
  const machineId = parseInt(String(params?.machineId), 10);
  const tmuxName = decodeURIComponent(String(params?.tmuxName));

  const [events, setEvents] = useState<AiEvent[]>([]);
  const [status, setStatus] = useState('idle');

  const command = useCallback(
    async (action: 'open' | 'close' | 'input', text?: string) => {
      await fetch(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
    },
    [machineId, tmuxName]
  );

  // Open on mount, close on unmount — the agent stops tailing when nobody is
  // watching, so an abandoned tab does not keep a file poll alive forever.
  useEffect(() => {
    void command('open');
    return () => { void command('close'); };
  }, [command]);

  useDashboardSocket((event: any) => {
    if (event.type !== 'ai_session_events') return;
    if (event.machineId !== machineId || event.tmuxName !== tmuxName) return;
    setEvents((prev) => [...prev, ...(event.events || [])]);
    if (event.status) setStatus(event.status);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10,
                       padding: '10px 12px', borderBottom: '1px solid var(--b1)' }}>
        <button className="btn-icon" onClick={() => router.push('/ai')} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <span style={{ flex: 1, minWidth: 0, color: 'var(--txt)', fontSize: 14.5,
                       overflow: 'hidden', textOverflow: 'ellipsis',
                       whiteSpace: 'nowrap' }}>{tmuxName}</span>
        <AiStatusDot status={status} />
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        <AiChat events={events} />
      </div>

      <AiComposer attachedElsewhere={false} onSend={(text) => void command('input', text)} />
    </div>
  );
}
```

**Before writing this, confirm the hook's calling convention:** run `grep -n "export function useDashboardSocket" -A 12 src/hooks/useDashboardSocket.ts`. If it takes an options object or returns a subscribe function rather than taking a callback, adapt the call — do not change the hook to fit this page.

- [ ] **Step 5: Verify end to end**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds.

Then, with `claude` running in a tmux session and the agent connected:
1. Open `/ai`, tap the session. Expected: the recent conversation renders as chat.
2. Type "say hello" and send. Expected: it appears in the real terminal and the reply streams into the chat.
3. Reload the page. Expected: history reappears.
4. Open the same page on a phone. Expected: the composer sits above the keyboard and the page does not zoom when the field is focused.

- [ ] **Step 6: Run both test suites**

Run: `npm test 2>&1 | tail -5`
Expected: all vitest tests pass.

Run: `cd packages/devdash-agent && npm test 2>&1 | tail -5`
Expected: all node:test tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dash)/ai" src/components/ai
git commit -m "feat(ui): AI session chat view with composer

The take-input lock is load-bearing: two inputs into one TUI interleave
into nonsense, so typing from the phone into a session that is open at the
desk is always an explicit act."
```

---

## What this plan does not deliver

The spec's v1 also requires **web push** when a session starts waiting. That is a separate subsystem — service worker, VAPID keys, the `aiSessionSeen` table with its `apply-ai-session-seen.mjs` script and its entry in the `.gitlab-ci.yml` `script:` chain — and it only produces working software on top of this plan. It gets its own plan once this one is running.

Attach mode also cannot render **Allow/Deny buttons**; permission prompts exist as typed events only in headless mode. Here the user answers them by sending `y`. Structured approvals need launch mode, whose spec is not yet written.

Two known gaps deliberately left for the follow-up, so they are not forgotten:

- `AiComposer` receives `attachedElsewhere={false}` hard-coded, because the attached-client count is not yet plumbed through `AiSessionSummary`. The lock UI is built and tested; only its input is missing. Wire it when the summary carries `attached`.
- The chat view accumulates events from the socket only. The agent replays on open because `TranscriptTail.pump()` reads from position 0 on a fresh tail, but nothing caps what the browser holds in memory across a very long session.
