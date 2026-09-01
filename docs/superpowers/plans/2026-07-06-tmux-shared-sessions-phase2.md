# tmux Shared Sessions — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real shared terminal sessions on a single machine (spec §14 Phase 2 of docs/superpowers/specs/2026-06-29-shared-terminal-sessions-design.md): native shells auto-wrap into tmux, the agent enumerates them, the browser (desktop + the Phase 1 mobile shell) lists live sessions and attaches — read-write (Drive) or read-only (Peek) — with terminal-client badges.

**Architecture:** Attach is a `pty_open` variant. The browser sends `pty_open` with new optional fields `tmuxSession` + `readOnly`; the agent spawns `tmux attach-session -t <name>` inside node-pty and registers it in the **same** sessions map — so `pty_data`/`pty_resize`/`pty_close`, the reattach grace period, and keepalive all work unchanged. A poller in the agent diffs `tmux list-sessions` and reports a `tmux_sessions` registry to the ws-server, which upserts `terminal_sessions` rows (the DB is the list API's source of truth). Browser-opened project shells are themselves wrapped in tmux (origin `browser`) when cowork is enabled, so a session started in the office browser is attachable from the phone.

**Tech Stack:** node-pty + tmux ≥ 3.2 (this host: 3.6a), ws, Drizzle/PostgreSQL, Next.js 15 App Router, xterm 5, the Phase 1 mobile components.

## Global Constraints

- **Never remove or modify the root `.npmrc`** (`@indianic` scope → registry.npmjs.org; prod deploy depends on it).
- **DB is shared between local dev and production. Schema changes must be ADDITIVE ONLY** — `ALTER TABLE … ADD COLUMN IF NOT EXISTS` with NULLable/defaulted columns. Never drop, rename, retype, or add NOT NULL without default. Apply via the explicit script in Task 1, NOT `drizzle-kit push`.
- Commit directly to `main`, one commit per task, `feat(cowork): …` / `fix(cowork): …` style. **Do NOT `git push`** (push triggers the production deploy) and **do NOT run the agent release** (`npm run release` publishes to registry.npmjs.org and remote machines self-update) — both happen only on explicit user go-ahead after verification.
- ws-server (`src/ws-server/index.ts`) changes require restarting `npm run dev` to take effect. `npm run build` clobbers the running dev server's `.next` — tasks verify with `npx tsc --noEmit` only; the controller rebuilds/restarts at verification time.
- Agent code (`packages/devdash-agent/`) has its own build (`npm run build --prefix packages/devdash-agent`) and its own test suite (`npm test --prefix packages/devdash-agent`, node test runner). New pure logic in the agent gets real tests (TDD); UI/protocol glue is verified by typecheck + the E2E task.
- Frontend has NO test framework and none may be added; UI verification is `npx tsc --noEmit` + the E2E task.
- UI uses existing CSS vars/utility classes (`--bg`, `--card`, `--accent`, `--live`, `--offline`, `--muted`, `--r-sm`, `card-v2`, `btn-icon`, `btn-grad`, `nav-item`, `glass`) and Phase 1's `devdash-mts-*` components. Terminal font: `'JetBrains Mono', Menlo, Monaco, monospace`.
- All shell-wrapper guards **fail open** (any doubt → normal shell); `DEVDASH_NO_WRAP=1` always bypasses (spec §13).
- The wrapper installer must be idempotent and marker-bounded (same technique as `scripts/install-claude-remote.sh`).
- Spec §17 decisions adopted as proposed: hosts = macOS/Linux/WSL (native Windows deferred); desktop attaches read-write (Drive), mobile defaults to Peek; session naming `<dirbase>-<shortid>`.

## Spec deviations (documented, agreed)

- **Recording:** attach clients are NOT recorded into `terminalChunks` (multiple simultaneous viewers would duplicate chunks); browser-origin sessions keep today's recording via their creating connection. `pipe-pane` recording of native sessions (§6) is deferred to Phase 4. The live-session *registry* rows in `terminal_sessions` still provide the audit trail of what ran where and when.
- **§12.4 pull-to-refresh** → the live list polls every 10 s + a manual refresh button (pull-to-refresh is Phase 4 polish).
- `coworkEnabled`/`allowBrowserControl` machine flags (§13) → v1 ships the agent-side `cowork` config flag (set by `setup-cowork`); the per-machine server-side toggle UI is Phase 4.
- §9 interactive enable inside `devdash-agent update` + package-manager auto-install of tmux → v1 ships a dedicated `setup-cowork` command that checks for tmux and prints the per-OS install command instead of running it with sudo.
- Registry rows store `cols`/`rows` (extra additive columns beyond the spec's list) so Peek can render at the session's true size.

## Message protocol (single source of truth for all tasks)

- Agent → server (new): `{ type: 'tmux_sessions', sessions: TmuxSessionInfo[] }` where
  `TmuxSessionInfo = { name: string; createdAt: number /*unix s*/; attached: number; lastActivity: number /*unix s*/; width: number; height: number; termProgram: string; origin: 'native' | 'browser' }`.
- Browser → server → agent (extended): `pty_open` gains optional `tmuxSession?: string` (attach to this tmux session instead of spawning a shell) and `readOnly?: boolean`.
- Everything else (`pty_data`, `pty_resize`, `pty_close`, `pty_exit`, `pty_opened`, `pty_error`) is unchanged.

---

### Task 1: Additive schema columns + apply script + shared types

**Files:**
- Modify: `src/lib/schema.ts` (terminalSessions table)
- Create: `scripts/apply-cowork-columns.mjs`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `terminalSessions` columns `tmuxName, termProgram, origin, isLive, lastActiveAt, cols, rows` (used by Tasks 6–7); type `LiveTerminalSession` (used by Task 7).

- [ ] **Step 1: Extend the Drizzle table**

In `src/lib/schema.ts`, add to `terminalSessions` after `exitCode`:

```ts
  // Phase 2 (cowork): live tmux-session registry fields — additive only.
  tmuxName: text('tmux_name'),
  termProgram: text('term_program'),
  origin: text('origin'), // 'native' | 'browser'
  isLive: boolean('is_live').default(false),
  lastActiveAt: text('last_active_at'),
  cols: integer('cols'),
  rows: integer('rows'),
```

- [ ] **Step 2: Create `scripts/apply-cowork-columns.mjs`** (explicit additive ALTERs — never drizzle push against the shared DB)

```js
#!/usr/bin/env node
// Applies the Phase 2 cowork columns to terminal_sessions. Additive and
// idempotent (IF NOT EXISTS) — safe on the shared local/prod database.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS tmux_name text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS term_program text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS origin text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS last_active_at text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS cols integer`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS rows integer`,
];

for (const s of stmts) {
  await sql.unsafe(s);
  console.log('applied:', s);
}
await sql.end();
console.log('done');
```

- [ ] **Step 3: Run it and verify**

Run: `node scripts/apply-cowork-columns.mjs`
Expected: seven `applied: …` lines + `done`.
Verify: `node -e "import('dotenv').then(d=>{d.config();import('postgres').then(async p=>{const sql=p.default(process.env.DATABASE_URL);const r=await sql\`SELECT column_name FROM information_schema.columns WHERE table_name='terminal_sessions'\`;console.log(r.map(x=>x.column_name).join(','));await sql.end();})})"`
Expected: output includes `tmux_name,term_program,origin,is_live,last_active_at,cols,rows`.

- [ ] **Step 4: Add the shared type**

In `src/types/index.ts`, append:

```ts
export interface LiveTerminalSession {
  id: number;
  machineId: number;
  tmuxName: string;
  termProgram: string | null;
  origin: 'native' | 'browser' | null;
  isLive: boolean;
  startedAt: string | null;
  lastActiveAt: string | null;
  cols: number | null;
  rows: number | null;
}
```

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts scripts/apply-cowork-columns.mjs src/types/index.ts
git commit -m "feat(cowork): additive terminal_sessions registry columns + LiveTerminalSession type"
```

---

### Task 2: Agent tmux-manager (TDD — the agent package has a real test suite)

**Files:**
- Create: `packages/devdash-agent/src/tmux-manager.ts`
- Test: `packages/devdash-agent/tests/tmux-manager.test.js` (match the existing test style in `packages/devdash-agent/tests/`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Tasks 3–4):
  ```ts
  export interface TmuxSessionInfo {
    name: string; createdAt: number; attached: number; lastActivity: number;
    width: number; height: number; termProgram: string; origin: 'native' | 'browser';
  }
  export function tmuxAvailable(): Promise<boolean>;               // `tmux -V` succeeds (cached)
  export function listSessions(): Promise<TmuxSessionInfo[]>;      // [] when tmux missing / no server
  export function parseSessionLine(line: string): Omit<TmuxSessionInfo, 'termProgram' | 'origin'> | null;  // pure, tested
  export function getSessionOption(name: string, option: string): Promise<string>; // show-options -qv, '' if unset
  export function killTmuxSession(name: string): Promise<void>;
  export function countClients(name: string): Promise<number>;     // list-clients | count
  ```

- [ ] **Step 1: Write the failing tests** (`packages/devdash-agent/tests/tmux-manager.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert');
const { parseSessionLine } = require('../dist/tmux-manager');

test('parseSessionLine parses a full list-sessions line', () => {
  const s = parseSessionLine('devdash-4821|1751800000|1|1751800100|120|32');
  assert.deepStrictEqual(s, {
    name: 'devdash-4821', createdAt: 1751800000, attached: 1,
    lastActivity: 1751800100, width: 120, height: 32,
  });
});

test('parseSessionLine tolerates session names containing dashes and dots', () => {
  const s = parseSessionLine('my.dir-name-77|1|0|2|80|24');
  assert.strictEqual(s.name, 'my.dir-name-77');
  assert.strictEqual(s.attached, 0);
});

test('parseSessionLine returns null on malformed lines', () => {
  assert.strictEqual(parseSessionLine(''), null);
  assert.strictEqual(parseSessionLine('garbage'), null);
  assert.strictEqual(parseSessionLine('a|b|c|d|e|f'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -15`
Expected: FAIL — `Cannot find module '../dist/tmux-manager'`.

- [ ] **Step 3: Implement `packages/devdash-agent/src/tmux-manager.ts`**

```ts
import { execFile } from 'child_process';

// tmux session enumeration + lifecycle for shared (cowork) sessions.
// The attach itself lives in pty-manager (a tmux attach spawned in node-pty
// reuses the whole existing PTY pipeline).

export interface TmuxSessionInfo {
  name: string;
  createdAt: number;      // unix seconds
  attached: number;       // attached client count
  lastActivity: number;   // unix seconds
  width: number;
  height: number;
  termProgram: string;
  origin: 'native' | 'browser';
}

const LIST_FORMAT = '#{session_name}|#{session_created}|#{session_attached}|#{session_activity}|#{window_width}|#{window_height}';

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('tmux', args, { timeout: 5000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

let available: boolean | null = null;

export async function tmuxAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    await run(['-V']);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

// Pure parser for one list-sessions line (kept separate for tests).
// Session names may contain '|'? tmux forbids ':' and '.' gets escaped in
// targets, but '|' is legal — so split from the RIGHT: the last 5 fields are
// numeric, everything before them is the name.
export function parseSessionLine(
  line: string
): Omit<TmuxSessionInfo, 'termProgram' | 'origin'> | null {
  const parts = line.split('|');
  if (parts.length < 6) return null;
  const tail = parts.slice(-5).map((n) => parseInt(n, 10));
  if (tail.some((n) => Number.isNaN(n))) return null;
  const name = parts.slice(0, -5).join('|');
  if (!name) return null;
  const [createdAt, attached, lastActivity, width, height] = tail;
  return { name, createdAt, attached, lastActivity, width, height };
}

export async function getSessionOption(name: string, option: string): Promise<string> {
  try {
    const out = await run(['show-options', '-t', name, '-qv', option]);
    return out.trim();
  } catch {
    return '';
  }
}

// @term_program / @devdash_origin never change after session creation.
const optionCache = new Map<string, { termProgram: string; origin: 'native' | 'browser' }>();

export async function listSessions(): Promise<TmuxSessionInfo[]> {
  if (!(await tmuxAvailable())) return [];
  let out: string;
  try {
    out = await run(['list-sessions', '-F', LIST_FORMAT]);
  } catch {
    return []; // no tmux server running = no sessions
  }
  const sessions: TmuxSessionInfo[] = [];
  const liveNames = new Set<string>();
  for (const line of out.split('\n')) {
    const base = parseSessionLine(line.trim());
    if (!base) continue;
    liveNames.add(base.name);
    let opts = optionCache.get(base.name);
    if (!opts) {
      const [termProgram, originRaw] = await Promise.all([
        getSessionOption(base.name, '@term_program'),
        getSessionOption(base.name, '@devdash_origin'),
      ]);
      opts = {
        termProgram: termProgram || 'unknown',
        origin: originRaw === 'browser' ? 'browser' : 'native',
      };
      optionCache.set(base.name, opts);
    }
    sessions.push({ ...base, ...opts });
  }
  for (const key of optionCache.keys()) {
    if (!liveNames.has(key)) optionCache.delete(key);
  }
  return sessions;
}

export async function killTmuxSession(name: string): Promise<void> {
  try {
    await run(['kill-session', '-t', name]);
  } catch { /* already gone */ }
}

export async function countClients(name: string): Promise<number> {
  try {
    const out = await run(['list-clients', '-t', name]);
    return out.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Build + run tests** — `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -8` → all tests pass (existing suite + 3 new).

- [ ] **Step 5: Live smoke** (tmux 3.6a is on this host):
`tmux new-session -d -s planck-test-1 && tmux set-option -t planck-test-1 @term_program TestTerm && node -e "const m=require('./packages/devdash-agent/dist/tmux-manager');m.listSessions().then(s=>console.log(JSON.stringify(s.filter(x=>x.name==='planck-test-1'))))" && tmux kill-session -t planck-test-1`
Expected: one JSON object, `"termProgram":"TestTerm"`, `"origin":"native"`, numeric width/height.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/tmux-manager.ts packages/devdash-agent/tests/tmux-manager.test.js
git commit -m "feat(cowork): agent tmux-manager — enumerate sessions with client metadata (TDD)"
```

---

### Task 3: pty-manager — tmux attach + browser-origin wrap + close semantics

**Files:**
- Modify: `packages/devdash-agent/src/pty-manager.ts`

**Interfaces:**
- Consumes: `killTmuxSession`, `countClients`, `tmuxAvailable` from `./tmux-manager` (Task 2).
- Produces (used by Task 4):
  ```ts
  export function openAttach(id: string, tmuxName: string, readOnly: boolean, cols: number, rows: number): boolean;
  // openSession gains an options arg: openSession(id, command, cwd, cols, rows, opts?: { coworkWrap?: boolean })
  // closeSession becomes async and tmux-aware (attach clients never kill the tmux session;
  // browser-origin creators kill-session only when no other client is attached).
  ```

- [ ] **Step 1: Extend session bookkeeping**

Replace the `PtySession` interface and add imports at the top of `pty-manager.ts`:

```ts
import { execFile } from 'child_process';
import { killTmuxSession, countClients } from './tmux-manager';

interface PtySession {
  id: string;
  process: import('node-pty').IPty;
  /** Set when this PTY is a tmux client. */
  tmux?: {
    name: string;
    /** True when this connection CREATED the tmux session (browser-origin). */
    creator: boolean;
    readOnly: boolean;
  };
}
```

- [ ] **Step 2: Add `openAttach`** (after `openSession`):

```ts
// Attach to an existing tmux session inside a fresh PTY. The tmux client
// merges input and broadcasts output to all clients — this is the sharing.
export function openAttach(
  id: string,
  tmuxName: string,
  readOnly: boolean,
  cols: number = 80,
  rows: number = 24
): boolean {
  if (!pty) return false;
  if (sessions.has(id)) return true; // idempotent reattach

  const args = ['attach-session', '-t', tmuxName];
  if (readOnly) args.push('-r', '-f', 'ignore-size'); // Peek: don't drive window size (tmux ≥3.2)

  let proc;
  try {
    proc = pty.spawn('tmux', args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
      env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
    });
  } catch (err: any) {
    console.error(`[devdash-agent] tmux attach failed: ${err.message}`);
    return false;
  }

  proc.onData((data: string) => {
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_data', id, data }));
    }
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    if (activeWs && activeWs.readyState === activeWs.OPEN) {
      activeWs.send(JSON.stringify({ type: 'pty_exit', id, code: exitCode }));
    }
  });

  sessions.set(id, { id, process: proc, tmux: { name: tmuxName, creator: false, readOnly } });
  return true;
}
```

- [ ] **Step 3: Browser-origin cowork wrap in `openSession`**

Change the signature to `export function openSession(id: string, command: string, cwd: string, cols: number = 80, rows: number = 24, opts: { coworkWrap?: boolean } = {}): boolean` and replace the `proc = pty.spawn(shell, [], {...})` block with:

```ts
  let proc;
  let tmuxMeta: PtySession['tmux'];
  if (opts.coworkWrap) {
    // Wrap the browser shell in tmux so other devices can attach to it.
    // Fail open: any tmux error falls back to the plain shell below.
    const tmuxName = `dd-${id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8)}`;
    try {
      const tmuxRun = (args: string[]) => {
        const { execFileSync } = require('child_process') as typeof import('child_process');
        execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' });
      };
      tmuxRun(['new-session', '-d', '-s', tmuxName, '-x', String(cols), '-y', String(rows), '-c', resolvedCwd]);
      tmuxRun(['set-option', '-t', tmuxName, '@devdash_origin', 'browser']);
      tmuxRun(['set-option', '-t', tmuxName, '@term_program', 'DevDash']);
      tmuxRun(['set-window-option', '-t', tmuxName, 'window-size', 'latest']);
      tmuxRun(['set-window-option', '-t', tmuxName, 'aggressive-resize', 'on']);
      proc = pty.spawn('tmux', ['attach-session', '-t', tmuxName], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
      tmuxMeta = { name: tmuxName, creator: true, readOnly: false };
    } catch (err: any) {
      console.error(`[devdash-agent] cowork wrap failed, plain shell fallback: ${err.message}`);
      proc = undefined;
    }
  }
  if (!proc) {
    try {
      proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
    } catch (err: any) {
      console.error(`[devdash-agent] PTY spawn failed: ${err.message}`);
      console.error(`[devdash-agent]   shell: ${shell}, cwd: ${resolvedCwd}`);
      return false;
    }
  }
```

and change `sessions.set(id, { id, process: proc });` to `sessions.set(id, { id, process: proc, tmux: tmuxMeta });`.

- [ ] **Step 4: tmux-aware close**

Replace `closeSession` and `closeAllSessions`:

```ts
export async function closeSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  const { tmux } = session;
  session.process.kill();
  if (tmux?.creator) {
    // The user closed the tab that created this session. Kill the tmux
    // session too — unless another client (phone, second browser) is still
    // attached, in which case the session lives on for them.
    // countClients runs after our own client died with a small delay so we
    // don't count ourselves.
    setTimeout(async () => {
      const clients = await countClients(tmux.name);
      if (clients === 0) await killTmuxSession(tmux.name);
    }, 500);
  }
  // Native-origin attach clients (tmux.creator === false): killing the
  // attach PTY only detaches — the shared session is never killed here.
}

export function closeAllSessions(): void {
  for (const [id] of sessions) {
    void closeSession(id);
  }
}
```

- [ ] **Step 5: Build + tests** — `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -6` → pass (no behavior change for plain sessions).

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/pty-manager.ts
git commit -m "feat(cowork): pty-manager tmux attach, browser-origin wrap, session-preserving close semantics"
```

---

### Task 4: Agent wiring — config flag, session poller, attach message handling

**Files:**
- Modify: `packages/devdash-agent/src/config.ts` (add `cowork?: boolean` to `AgentConfig`)
- Modify: `packages/devdash-agent/src/websocket.ts`

**Interfaces:**
- Consumes: `listSessions`, `tmuxAvailable`, `TmuxSessionInfo` (Task 2); `openAttach`, `openSession` opts (Task 3).
- Produces: `tmux_sessions` message to server (schema in the plan header — Task 6 consumes); handles `pty_open` with `tmuxSession`/`readOnly`.

- [ ] **Step 1: `config.ts`** — add to `AgentConfig`: `cowork?: boolean; // wrap browser shells in tmux + enumerate sessions` (after `cronInterval`).

- [ ] **Step 2: Poller in `websocket.ts`**

Add imports: `import { listSessions, tmuxAvailable } from './tmux-manager';`

Add module state near `let ws`:

```ts
let tmuxPollTimer: NodeJS.Timeout | null = null;
let lastTmuxSnapshot = '';
const TMUX_POLL_MS = 5000;
const TMUX_RESYNC_MS = 60_000;
let lastTmuxSentAt = 0;
```

Add functions:

```ts
async function pollTmuxSessions(): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!(await tmuxAvailable())) return;
  try {
    const sessions = await listSessions();
    const snapshot = JSON.stringify(sessions.map((s) => [s.name, s.attached, s.width, s.height]));
    const now = Date.now();
    if (snapshot !== lastTmuxSnapshot || now - lastTmuxSentAt > TMUX_RESYNC_MS) {
      lastTmuxSnapshot = snapshot;
      lastTmuxSentAt = now;
      ws.send(JSON.stringify({ type: 'tmux_sessions', sessions }));
    }
  } catch (err: any) {
    console.error('[devdash-agent] tmux poll failed:', err.message);
  }
}

function startTmuxPolling(): void {
  stopTmuxPolling();
  lastTmuxSnapshot = '';
  tmuxPollTimer = setInterval(() => { void pollTmuxSessions(); }, TMUX_POLL_MS);
  void pollTmuxSessions(); // immediate sync on connect
}

function stopTmuxPolling(): void {
  if (tmuxPollTimer) { clearInterval(tmuxPollTimer); tmuxPollTimer = null; }
}
```

Call `startTmuxPolling();` inside `ws.on('open', …)` after `startHeartbeat(...)`; call `stopTmuxPolling();` in `ws.on('close', …)` before `scheduleReconnect(...)` and in `disconnect()`.

- [ ] **Step 3: Attach handling in `handleMessage`**

Replace the `case 'pty_open':` block body with:

```ts
    case 'pty_open': {
      if (!isPtyAvailable()) {
        ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: 'node-pty not available' }));
        break;
      }
      let opened: boolean;
      if (msg.tmuxSession) {
        opened = openAttach(
          msg.id,
          String(msg.tmuxSession),
          !!msg.readOnly,
          msg.cols || 80,
          msg.rows || 24
        );
      } else {
        opened = openSession(
          msg.id,
          msg.command || '',
          msg.cwd || process.env.HOME || '/',
          msg.cols || 80,
          msg.rows || 24,
          { coworkWrap: !!config.cowork && isPtyAvailable() }
        );
      }
      if (!opened) {
        ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: msg.tmuxSession ? 'Failed to attach to session' : 'Failed to open session' }));
      }
      break;
    }
```

and add `openAttach` to the `./pty-manager` import list.

- [ ] **Step 4: Build + tests** — `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -6` → pass.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/config.ts packages/devdash-agent/src/websocket.ts
git commit -m "feat(cowork): agent session poller (tmux_sessions) + pty_open attach routing + cowork config flag"
```

---

### Task 5: Shell wrapper + `setup-cowork` CLI command

**Files:**
- Modify: `packages/devdash-agent/src/cli.ts` (new command; follow the existing `program.command(...)` style around line 156+)

**Interfaces:**
- Consumes: `tmuxAvailable` (Task 2), `loadConfig`/`saveConfig` (existing in `config.ts` — check exact export names in the file before using).
- Produces: `devdash-agent setup-cowork [--remove]` — installs/removes a marker-bounded wrapper block in `~/.zshrc` and `~/.bashrc`, sets `config.cowork`.

- [ ] **Step 1: Add the wrapper block content + install helpers in `cli.ts`**

```ts
const COWORK_BEGIN = '# >>> devdash cowork wrapper >>>';
const COWORK_END = '# <<< devdash cowork wrapper <<<';

// Re-exec interactive shells inside tmux (spec §12/§10). Every guard fails
// OPEN — on any doubt the user gets their normal shell. DEVDASH_NO_WRAP=1
// always bypasses.
const COWORK_BLOCK = `${COWORK_BEGIN}
# Managed by "devdash-agent setup-cowork" — do not edit inside the markers.
case $- in
  *i*)
    if [ -z "$TMUX" ] && [ -z "$DEVDASH_NO_WRAP" ] && [ -z "$SSH_TTY" ] && [ -t 1 ] \\
       && command -v tmux >/dev/null 2>&1; then
      _dd_base=$(basename "$PWD" 2>/dev/null | LC_ALL=C tr -cd 'a-zA-Z0-9_-' | cut -c1-20)
      [ -n "$_dd_base" ] || _dd_base=shell
      _dd_name="\${_dd_base}-$(( \${RANDOM:-$$} % 9000 + 1000 ))"
      if tmux new-session -d -s "$_dd_name" 2>/dev/null; then
        tmux set-option -t "$_dd_name" @term_program "\${TERM_PROGRAM:-\${TERMINAL_EMULATOR:-unknown}}" 2>/dev/null
        tmux set-option -t "$_dd_name" @devdash_origin native 2>/dev/null
        tmux set-window-option -t "$_dd_name" window-size latest 2>/dev/null
        tmux set-window-option -t "$_dd_name" aggressive-resize on 2>/dev/null
        exec tmux attach-session -t "$_dd_name"
      fi
      unset _dd_base _dd_name
    fi
  ;;
esac
${COWORK_END}`;

function removeCoworkBlock(content: string): string {
  const begin = content.indexOf(COWORK_BEGIN);
  if (begin === -1) return content;
  const end = content.indexOf(COWORK_END);
  if (end === -1) return content;
  return (content.slice(0, begin) + content.slice(end + COWORK_END.length))
    .replace(/\n{3,}$/g, '\n\n');
}

function installCoworkBlock(rcPath: string): 'installed' | 'updated' | 'created' {
  const existed = fs.existsSync(rcPath);
  const content = existed ? fs.readFileSync(rcPath, 'utf-8') : '';
  const had = content.includes(COWORK_BEGIN);
  const cleaned = removeCoworkBlock(content);
  const next = cleaned.replace(/\n*$/, '\n\n') + COWORK_BLOCK + '\n';
  fs.writeFileSync(rcPath, next);
  return had ? 'updated' : existed ? 'installed' : 'created';
}
```

(Reuse the file's existing `fs`/`os`/`path` imports; add any that are missing.)

- [ ] **Step 2: Register the command** (near the other commands; mirror their console styling):

```ts
program
  .command('setup-cowork')
  .description('Enable shared terminal sessions: install the tmux shell wrapper and turn on cowork')
  .option('--remove', 'Uninstall the wrapper and turn cowork off')
  .action(async (opts: { remove?: boolean }) => {
    const { tmuxAvailable } = require('./tmux-manager') as typeof import('./tmux-manager');
    const config = loadConfig();
    const rcFiles = [path.join(os.homedir(), '.zshrc'), path.join(os.homedir(), '.bashrc')];

    if (opts.remove) {
      for (const rc of rcFiles) {
        if (!fs.existsSync(rc)) continue;
        fs.writeFileSync(rc, removeCoworkBlock(fs.readFileSync(rc, 'utf-8')));
        console.log(`  removed wrapper from ${rc}`);
      }
      config.cowork = false;
      saveConfig(config);
      console.log('Cowork disabled. Open terminals are unaffected; new shells start normally.');
      return;
    }

    if (!(await tmuxAvailable())) {
      console.log('\x1b[33mtmux is not installed.\x1b[0m Install it first:');
      console.log(process.platform === 'darwin'
        ? '  brew install tmux'
        : '  sudo apt-get install -y tmux   (or dnf/yum/pacman/zypper equivalent)');
      console.log('Then re-run: devdash-agent setup-cowork');
      process.exitCode = 1;
      return;
    }

    // Only touch rc files that exist — except on a machine with neither,
    // where we create the default shell's rc.
    const existing = rcFiles.filter((f) => fs.existsSync(f));
    const targets = existing.length > 0
      ? existing
      : [(process.env.SHELL || '').includes('bash') ? rcFiles[1] : rcFiles[0]];
    for (const rc of targets) {
      const result = installCoworkBlock(rc);
      console.log(`  ${result}: wrapper in ${rc}`);
    }
    config.cowork = true;
    saveConfig(config);
    console.log('');
    console.log('\x1b[32mCowork enabled.\x1b[0m New interactive terminals now run inside tmux');
    console.log('and appear in DevDash → Terminals. Opt out per-shell: DEVDASH_NO_WRAP=1');
    console.log('Restart the agent to start reporting sessions: devdash-agent restart');
  });
```

(Confirm the actual exported names for `loadConfig`/`saveConfig` in `config.ts` and use those.)

- [ ] **Step 3: Build** — `npm run build --prefix packages/devdash-agent` → success.

- [ ] **Step 4: Wrapper syntax check without installing:**
`node -e "const c=require('/Volumes/SandeepSSD/www/tools/devdash/packages/devdash-agent/dist/cli.js')" 2>/dev/null; node --eval "const fs=require('fs')" ` — instead verify the block parses in both shells:
Write the block to a temp file and run `bash -n <file>` and `zsh -n <file>`:
`node -e "const{execSync}=require('child_process');const src=fs=require('fs');const m=require('/Volumes/SandeepSSD/www/tools/devdash/packages/devdash-agent/dist/cli.js');"` — simpler: extract manually:
Run: `sed -n "/>>> devdash cowork wrapper >>>/,/<<< devdash cowork wrapper <<</p" <(node -e "console.log(require('fs').readFileSync('packages/devdash-agent/src/cli.ts','utf8'))") > /tmp/ddwrap.sh 2>/dev/null || true` — if extraction is awkward, just hand-copy the block from the source into `/private/tmp/.../scratchpad/ddwrap.sh` (WITHOUT the TS template escapes: `\\\\` → `\\`, `\\$` → `$`) and run `bash -n` and `zsh -n` on it.
Expected: both exit 0 (no syntax errors).

- [ ] **Step 5: Do NOT install into the real `~/.zshrc` in this task** — the E2E task exercises install/remove against throwaway `$HOME` copies first, then for real.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/cli.ts
git commit -m "feat(cowork): setup-cowork command — marker-bounded tmux wrapper install with fail-open guards"
```

---

### Task 6: ws-server — registry, DB upsert, attach relay, recording skip

**Files:**
- Modify: `src/ws-server/index.ts`

**Interfaces:**
- Consumes: `tmux_sessions` message (Task 4), schema columns (Task 1).
- Produces: `terminal_sessions` rows kept in sync (`is_live`, metadata) — Task 7's API reads them; `pty_open` relay passes `tmuxSession`/`readOnly` to the daemon; attach connections skip recording.

- [ ] **Step 1: Machine-owner cache + registry + upsert** (add after the `browserConnections` declarations):

```ts
// --- Cowork: live tmux-session registry (per machine) ---
const machineOwnerCache = new Map<number, number>();

async function getMachineOwner(machineId: number): Promise<number | null> {
  if (machineOwnerCache.has(machineId)) return machineOwnerCache.get(machineId)!;
  if (!sql) return null;
  try {
    const rows = await sql`SELECT user_id FROM machines WHERE id = ${machineId}`;
    if (rows.length === 0) return null;
    machineOwnerCache.set(machineId, rows[0].user_id);
    return rows[0].user_id;
  } catch {
    return null;
  }
}

interface TmuxSessionInfo {
  name: string; createdAt: number; attached: number; lastActivity: number;
  width: number; height: number; termProgram: string; origin: string;
}

async function handleTmuxSessions(machineId: number, sessions: TmuxSessionInfo[]): Promise<void> {
  if (!sql) return;
  const userId = await getMachineOwner(machineId);
  if (userId == null) return;
  try {
    const names = sessions.map((s) => s.name);
    for (const s of sessions) {
      const lastActive = new Date(s.lastActivity * 1000).toISOString();
      const updated = await sql`
        UPDATE terminal_sessions
        SET is_live = true, last_active_at = ${lastActive},
            term_program = ${s.termProgram}, origin = ${s.origin},
            cols = ${s.width}, rows = ${s.height}, ended_at = NULL
        WHERE machine_id = ${machineId} AND tmux_name = ${s.name} AND ended_at IS NULL
        RETURNING id`;
      if (updated.length === 0) {
        await sql`
          INSERT INTO terminal_sessions
            (machine_id, user_id, command, cwd, tmux_name, term_program, origin, is_live, last_active_at, cols, rows)
          VALUES
            (${machineId}, ${userId}, ${'tmux:' + s.name}, ${'~'}, ${s.name}, ${s.termProgram},
             ${s.origin}, true, ${lastActive}, ${s.width}, ${s.height})`;
      }
    }
    // Sessions that vanished from the report are over.
    if (names.length > 0) {
      await sql`
        UPDATE terminal_sessions SET is_live = false, ended_at = now()
        WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL
          AND tmux_name NOT IN ${sql(names)}`;
    } else {
      await sql`
        UPDATE terminal_sessions SET is_live = false, ended_at = now()
        WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL`;
    }
  } catch (err: any) {
    console.error('[devdash-ws] tmux registry upsert failed:', err.message);
  }
}
```

- [ ] **Step 2: Route the message** — in `handleDaemonMessage`, add a case:

```ts
    case 'tmux_sessions': {
      void handleTmuxSessions(machineId, Array.isArray(msg.sessions) ? msg.sessions : []);
      break;
    }
```

Also, in `handleDaemonConnection`'s `ws.on('close', …)`, mark the machine's sessions dead so a crashed agent doesn't leave stale "live" rows:

```ts
    if (sql) {
      sql`UPDATE terminal_sessions SET is_live = false, ended_at = now()
          WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL`
        .catch(() => {});
    }
```

- [ ] **Step 3: Relay attach fields + skip recording for attaches**

In `handleBrowserMessage`'s `case 'pty_open'`:
- In the `daemon.ws.send(JSON.stringify({ type: 'pty_open', … }))` payload add: `tmuxSession: msg.tmuxSession || undefined, readOnly: !!msg.readOnly,`.
- Wrap the async recording-setup IIFE in `if (!msg.tmuxSession) { … }` so attach connections never create recording rows (registry rows already track the session; multiple viewers would duplicate chunks).

In `handleMultiplexConnection`'s `case 'pty_open'`:
- Add the same two fields to its `daemon.ws.send(...)` payload.
- Guard its recording block: change `const recording = await isRecordingEnabled(userId);` to `const recording = msg.tmuxSession ? false : await isRecordingEnabled(userId);`.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/ws-server/index.ts
git commit -m "feat(cowork): ws-server tmux registry upsert, attach relay, no recording for attach clients"
```

---

### Task 7: Live-sessions API + Terminals page + Sidebar entry

**Files:**
- Create: `src/app/api/live-sessions/route.ts`
- Create: `src/app/(dash)/terminals/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx` (NAV array)

**Interfaces:**
- Consumes: schema columns (Task 1), `LiveTerminalSession` type (Task 1), DB rows maintained by Task 6.
- Produces: `GET /api/live-sessions` → `{ sessions: LiveTerminalSession[] }` (only the user's machines); `/terminals` page linking to `/terminal/{machineId}/{name}?cols=&rows=&mode=` (Task 8's route).

- [ ] **Step 1: Create `src/app/api/live-sessions/route.ts`** (mirror auth/db idioms from `src/app/api/auth/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { terminalSessions, machines } from '@/lib/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const userMachines = await db.select().from(machines).where(eq(machines.userId, session.userId));
    const machineIds = userMachines.map((m) => m.id);
    if (machineIds.length === 0) return NextResponse.json({ sessions: [] });

    const rows = await db
      .select()
      .from(terminalSessions)
      .where(and(
        inArray(terminalSessions.machineId, machineIds),
        eq(terminalSessions.isLive, true),
        isNotNull(terminalSessions.tmuxName),
      ));

    return NextResponse.json({
      sessions: rows.map((r) => ({
        id: r.id,
        machineId: r.machineId,
        tmuxName: r.tmuxName,
        termProgram: r.termProgram,
        origin: r.origin,
        isLive: r.isLive,
        startedAt: r.startedAt,
        lastActiveAt: r.lastActiveAt,
        cols: r.cols,
        rows: r.rows,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
```

(Verify `getSession` import path by checking how `src/app/api/auth/route.ts` imports it, and match.)

- [ ] **Step 2: Create `src/app/(dash)/terminals/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Eye, Play, TerminalSquare } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import type { LiveTerminalSession } from '@/types';

const POLL_MS = 10_000;

// $TERM_PROGRAM → friendly badge (spec §7). New clients need no code change —
// unknown values render as-is.
const CLIENT_LABELS: Record<string, string> = {
  Apple_Terminal: 'Terminal',
  'iTerm.app': 'iTerm2',
  vscode: 'VS Code',
  Hyper: 'Hyper',
  WezTerm: 'WezTerm',
  DevDash: 'DevDash',
  unknown: '—',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TerminalsPage() {
  const router = useRouter();
  const { session } = useDashboard();
  const [sessions, setSessions] = useState<LiveTerminalSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live-sessions');
      if (r.ok) {
        const data = await r.json();
        setSessions(data.sessions || []);
      }
    } catch { /* keep last list */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const open = (s: LiveTerminalSession, mode: 'peek' | 'drive') => {
    router.push(
      `/terminal/${s.machineId}/${encodeURIComponent(s.tmuxName)}?mode=${mode}&cols=${s.cols || 80}&rows=${s.rows || 24}`
    );
  };

  const machineName = (id: number) =>
    session?.machines.find((m) => m.id === id)?.name || `Machine ${id}`;

  const byMachine = new Map<number, LiveTerminalSession[]>();
  for (const s of sessions) {
    if (!byMachine.has(s.machineId)) byMachine.set(s.machineId, []);
    byMachine.get(s.machineId)!.push(s);
  }

  return (
    <div className="px-6 py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display" style={{ fontSize: 32 }}>Terminals</h1>
        <button className="btn-icon" onClick={() => { setLoading(true); load(); }} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Live shell sessions on your machines. Attach to watch (Peek) or type (Drive).
      </p>

      {sessions.length === 0 && !loading && (
        <div className="card-v2" style={{ padding: 28, textAlign: 'center' }}>
          <TerminalSquare size={28} style={{ color: 'var(--dim)', margin: '0 auto 10px' }} />
          <div style={{ color: 'var(--txt)', fontSize: 14, marginBottom: 6 }}>No live sessions</div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 }}>
            Enable session sharing on a machine with{' '}
            <code style={{ background: 'var(--glass)', padding: '2px 6px', borderRadius: 4 }}>
              devdash-agent setup-cowork
            </code>{' '}
            — new terminal windows (and DevDash project shells) will appear here.
          </div>
        </div>
      )}

      {Array.from(byMachine.entries()).map(([mid, list]) => (
        <div key={mid} style={{ marginBottom: 24 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {machineName(mid)} · {list.length} session{list.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {list.map((s) => (
              <div key={s.id} className="card-v2 flex items-center gap-3" style={{ padding: '12px 16px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--live)', boxShadow: '0 0 6px var(--live)', flex: 'none' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace", fontSize: 13.5, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.tmuxName}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ background: 'var(--accent-weak)', color: 'var(--accent)', borderRadius: 6, padding: '1px 7px' }}>
                      {CLIENT_LABELS[s.termProgram || 'unknown'] || s.termProgram}
                    </span>
                    <span>{s.origin === 'browser' ? 'browser' : 'native'}</span>
                    {s.cols && s.rows ? <span>{s.cols}×{s.rows}</span> : null}
                    <span>active {timeAgo(s.lastActiveAt)}</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={() => open(s, 'peek')} title="Peek (read-only)" aria-label="Peek">
                  <Eye size={15} />
                </button>
                <button className="btn-grad" style={{ padding: '7px 14px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => open(s, 'drive')}>
                  <Play size={13} /> Drive
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note: if `TerminalSquare` is not exported by the installed `lucide-react`, use `Terminal` from lucide-react instead (check with a grep in `node_modules/lucide-react/dist/lucide-react.d.ts`).

- [ ] **Step 3: Sidebar entry** — in `src/components/dashboard/Sidebar.tsx`, add to the `NAV` array after Scanner (and add the icon to the lucide import):

```ts
  { href: '/terminals', label: 'Terminals', icon: TerminalSquare, countKey: null },
```

(same lucide fallback note as above).

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/live-sessions/route.ts "src/app/(dash)/terminals/page.tsx" src/components/dashboard/Sidebar.tsx
git commit -m "feat(cowork): live sessions API + Terminals page with client badges and Peek/Drive"
```

---

### Task 8: Terminal + MobileTerminalShell attach support (tmuxSession / readOnly / fixedSize)

**Files:**
- Modify: `src/components/Terminal.tsx`
- Modify: `src/components/MobileTerminalShell.tsx`
- Modify: `src/components/mobile-terminal.css` (append)

**Interfaces:**
- Consumes: Phase 1 `TerminalHandle` / shell internals.
- Produces (used by Task 9):
  - `Terminal` new optional props: `tmuxSession?: string; readOnly?: boolean; fixedSize?: { cols: number; rows: number };`
  - `MobileTerminalShell` new optional props: `onNewTab?: () => void` (menu hides "+ New shell" when absent), `readOnlyBanner?: boolean`, `onRequestDrive?: () => void` (banner replaces composer+chips in Peek).

- [ ] **Step 1: Terminal.tsx — props + attach open + fixed size + read-only guards**

Add to `TerminalProps`:

```ts
  /** Attach to this tmux session instead of spawning a shell (cowork). */
  tmuxSession?: string;
  /** Read-only attach (Peek): input and resize are suppressed. */
  readOnly?: boolean;
  /** Render at a fixed grid instead of fitting the container (Peek shows the session's true size). */
  fixedSize?: { cols: number; rows: number };
```

and destructure them in the component signature.

In `sendOpen()`, add to the `pty_open` payload: `tmuxSession: tmuxSession || undefined, readOnly: !!readOnly,` and change the cols/rows source to `const cols = fixedSize?.cols || term?.cols || 80;` / `const rows = fixedSize?.rows || term?.rows || 24;`. Skip the follow-up `pty_resize` send when `readOnly` is true.

In `init()`:
- After `term.open(containerRef.current)`, replace the unconditional `try { fitAddon.fit(); } catch {}` with:
  ```ts
  if (fixedSize) {
    try { term.resize(fixedSize.cols, fixedSize.rows); } catch {}
  } else {
    try { fitAddon.fit(); } catch {}
  }
  ```
- Guard `term.onData`: `if (readOnly) return;` as the first line of the handler.
- Guard `term.onResize` send with `if (readOnly) return;` likewise.
- Only create/observe the `ResizeObserver` when `!fixedSize`.

In the `useImperativeHandle`, make `fit` a no-op when `fixedSize` is set (`if (fixedSize) return;` first line), and add `fixedSize?.cols, fixedSize?.rows, readOnly, tmuxSession` — no: keep the dep array `[sessionId, fontSize]`; these props are fixed per mount in practice (Task 9 remounts on mode change via `key`).

- [ ] **Step 2: MobileTerminalShell — optional props**

- Change `onNewTab: () => void;` to `onNewTab?: () => void;` and wrap the `+ New shell` menu item in `{onNewTab && ( … )}`.
- Add props `readOnlyBanner?: boolean; onRequestDrive?: () => void;`.
- In the input area at the bottom, render:

```tsx
      {readOnlyBanner ? (
        <button type="button" className="devdash-mts-peekbar" onClick={onRequestDrive}>
          <span className="devdash-mts-peekdot" /> Peek &mdash; read-only &middot; tap to Drive
        </button>
      ) : (
        <>
          <KeyChipBar onSend={sendRaw} ctrlState={ctrlState} onCtrlStateChange={setCtrlState} />
          {inputMode === 'composer' && (
            <TerminalComposer … existing props … />
          )}
        </>
      )}
```

(keep the existing KeyChipBar/Composer JSX exactly as-is inside the fragment). Also guard `onTermTap`'s raw-mode branch: when `readOnlyBanner` is true, tapping the terminal must NOT focus xterm or switch modes (font double-tap reset stays).

- [ ] **Step 3: Append to `mobile-terminal.css`**

```css
/* --- Peek (read-only) banner --- */
.devdash-mts-peekbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 10px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg-sub);
  border-top: 1px solid var(--b1);
  color: var(--muted);
  font-size: 13px;
  border-left: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  width: 100%;
}
.devdash-mts-peekbar:active { background: var(--glass); }
.devdash-mts-peekdot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--static);
  flex: none;
}

/* Peek panes render the session's true grid and pan horizontally. */
.devdash-mts-pane.peek { overflow: auto; -webkit-overflow-scrolling: touch; }
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors. Existing callers are unaffected (all new props optional; TerminalPanel keeps passing `onNewTab`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Terminal.tsx src/components/MobileTerminalShell.tsx src/components/mobile-terminal.css
git commit -m "feat(cowork): Terminal attach props (tmuxSession/readOnly/fixedSize) + shell Peek banner"
```

---

### Task 9: Attach page `/terminal/[machineId]/[name]`

**Files:**
- Create: `src/app/terminal/[machineId]/[name]/page.tsx`
- Create: `src/app/terminal/terminal-attach.css`

**Interfaces:**
- Consumes: `Terminal` attach props + `TerminalHandle` (Task 8), `MobileTerminalShell` optional props (Task 8), `GET /api/auth` (existing: returns `{ userId, machineId, email, name, machines }`).
- Produces: deep-linkable attach view; query params `mode=peek|drive`, `cols`, `rows` (Task 7 links here).

- [ ] **Step 1: Create `src/app/terminal/[machineId]/[name]/page.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, Play } from 'lucide-react';
import Terminal from '@/components/Terminal';
import type { TerminalHandle, TermConnectionState } from '@/components/Terminal';
import MobileTerminalShell from '@/components/MobileTerminalShell';
import { getSavedFontSize } from '@/components/mobile-term-prefs';
import './../terminal-attach.css';

// Full-screen attach view for a live tmux session (spec §11 Peek/Drive).
// Deep-linkable: /terminal/{machineId}/{tmuxName}?mode=peek|drive&cols=&rows=
export default function AttachPage() {
  const params = useParams<{ machineId: string; name: string }>();
  const sp = useSearchParams();
  const router = useRouter();

  const machineId = Number(params.machineId);
  const tmuxName = decodeURIComponent(params.name);
  const sessionCols = Number(sp.get('cols')) || 80;
  const sessionRows = Number(sp.get('rows')) || 24;

  const [userId, setUserId] = useState<number | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<'peek' | 'drive' | null>(null);
  const [connState, setConnState] = useState<TermConnectionState>('connected');
  const [exited, setExited] = useState(false);
  const handleRef = useRef<TerminalHandle | null>(null);
  // Fresh id per mode so switching Peek↔Drive cleanly respawns the attach client.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
    setIsMobile(touch);
    setMode((sp.get('mode') === 'drive' ? 'drive' : sp.get('mode') === 'peek' ? 'peek' : touch ? 'peek' : 'drive'));
    fetch('/api/auth')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setUserId(s.userId))
      .catch(() => setAuthError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wsUrl = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : process.env.NEXT_PUBLIC_WS_URL ||
          `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`,
    []
  );

  if (authError) {
    return (
      <div className="devdash-attach-center">
        Not signed in. <a href="/" style={{ color: 'var(--accent)', marginLeft: 6 }}>Go to DevDash</a>
      </div>
    );
  }
  if (userId == null || mode == null) {
    return <div className="devdash-attach-center">Connecting&hellip;</div>;
  }

  const peek = mode === 'peek';
  const sessionId = `att-${tmuxName}-${mode}-${nonce}`;
  const switchMode = (m: 'peek' | 'drive') => {
    if (m === mode) return;
    setMode(m);
    setNonce((n) => n + 1);
    setExited(false);
  };

  const term = (
    <Terminal
      key={sessionId}
      sessionId={sessionId}
      wsUrl={wsUrl}
      machineId={machineId}
      userId={userId}
      tmuxSession={tmuxName}
      readOnly={peek}
      fixedSize={peek ? { cols: sessionCols, rows: sessionRows } : undefined}
      fontSize={isMobile ? getSavedFontSize() : undefined}
      onConnectionChange={setConnState}
      onExit={() => setExited(true)}
      ref={(h) => { handleRef.current = h; }}
    />
  );

  if (isMobile) {
    return (
      <MobileTerminalShell
        title={tmuxName}
        tabs={[{ id: sessionId, label: tmuxName, exited }]}
        activeTabId={sessionId}
        connectionState={exited ? 'exited' : connState}
        getActiveHandle={() => handleRef.current}
        onSelectTab={() => {}}
        onCloseTab={() => router.push('/terminals')}
        onClose={() => {
          handleRef.current?.closeSession();
          router.push('/terminals');
        }}
        commands={[]}
        onOpenCommand={() => {}}
        readOnlyBanner={peek}
        onRequestDrive={() => switchMode('drive')}
      >
        <div className={`devdash-mts-pane ${peek ? 'peek' : ''}`}>{term}</div>
      </MobileTerminalShell>
    );
  }

  return (
    <div className="devdash-attach">
      <div className="devdash-attach-bar">
        <button className="devdash-attach-btn" onClick={() => { handleRef.current?.closeSession(); router.push('/terminals'); }} aria-label="Back">
          <ArrowLeft size={15} />
        </button>
        <span className={`devdash-attach-dot ${exited ? 'dead' : 'live'}`} />
        <span className="devdash-attach-title">{tmuxName}</span>
        {connState === 'reconnecting' && <span className="devdash-attach-status">reconnecting&hellip;</span>}
        <div className="devdash-attach-actions">
          <button className={`devdash-attach-mode ${peek ? 'on' : ''}`} onClick={() => switchMode('peek')} title="Read-only">
            <Eye size={13} /> Peek
          </button>
          <button className={`devdash-attach-mode ${!peek ? 'on' : ''}`} onClick={() => switchMode('drive')} title="Read-write">
            <Play size={13} /> Drive
          </button>
        </div>
      </div>
      <div className={`devdash-attach-term ${peek ? 'peek' : ''}`}>{term}</div>
    </div>
  );
}
```

Note on `onCloseTab`/`onClose` for the mobile shell: closing an attach view kills only the attach client (`closeSession` sends `pty_close`; the agent's tmux-aware close never kills a native session, and browser-origin sessions survive while other clients are attached — Task 3 semantics).

- [ ] **Step 2: Create `src/app/terminal/terminal-attach.css`**

```css
.devdash-attach {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  z-index: 9999;
}
.devdash-attach-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 10px;
  background: var(--bg-sub);
  border-bottom: 1px solid var(--b1);
}
.devdash-attach-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--r-sm);
}
.devdash-attach-btn:hover { background: var(--glass); color: var(--txt); }
.devdash-attach-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.devdash-attach-dot.live { background: var(--live); box-shadow: 0 0 6px var(--live); }
.devdash-attach-dot.dead { background: var(--offline); }
.devdash-attach-title {
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  font-size: 13px;
  color: var(--txt);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.devdash-attach-status { font-size: 11.5px; color: var(--static); }
.devdash-attach-actions { margin-left: auto; display: flex; gap: 4px; }
.devdash-attach-mode {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--b1);
  background: none;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.devdash-attach-mode.on {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
  color: var(--accent);
}
.devdash-attach-term { flex: 1; min-height: 0; padding: 4px 6px 0; }
.devdash-attach-term.peek { overflow: auto; }
.devdash-attach-center {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  color: var(--muted);
  font-size: 14px;
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/terminal/[machineId]/[name]/page.tsx" src/app/terminal/terminal-attach.css
git commit -m "feat(cowork): deep-linkable attach page with Peek/Drive on desktop and the mobile shell"
```

---

### Task 10: End-to-end verification (main session — needs browser, dev stack, real tmux)

Runs in the MAIN session. Fixes go in as `fix(cowork): …` commits.

- [ ] **Step 1:** Restart the stack: `npm run dev` (picks up ws-server changes), then start the source agent with cowork on: set `"cowork": true` in the local profile (`~/.devdash-agent/config.json` — via `node packages/devdash-agent/dist/cli.js config set cowork true` if supported, else edit the JSON), then `node dist/cli.js start --profile local` from `packages/devdash-agent`.
- [ ] **Step 2 — wrapper install/remove safety:** run `setup-cowork` against a throwaway HOME (`HOME=/private/tmp/.../scratchpad/fakehome node packages/devdash-agent/dist/cli.js setup-cowork`), verify the marker block lands in the fake `.zshrc`, run `zsh -n`/`bash -n` on it, run `--remove`, verify clean removal and idempotent re-install.
- [ ] **Step 3 — native session flow:** simulate a wrapped terminal: `tmux new-session -d -s demo-$RANDOM …` with `@term_program iTerm.app`, `@devdash_origin native` stamps + window-size options. Within ~5 s the agent reports it; `/terminals` lists it with the iTerm2 badge, native origin, size, "active just now".
- [ ] **Step 4 — Drive:** click Drive → attach page opens read-write; type `echo shared-$RANDOM`; verify with `tmux capture-pane -p -t <name>` that the command ran in the real session; run `tmux send-keys -t <name> 'echo from-native' Enter` and see it appear live in the browser (two-way, criterion §12.7-9 desktop side).
- [ ] **Step 5 — Peek:** open the same session in Peek → typing does nothing (readOnly), view renders at the session's cols×rows, banner shows; tap banner → switches to Drive and input works.
- [ ] **Step 6 — browser-origin wrap:** open a project shell from the dashboard (cowork on) → a `dd-…` session appears in `/terminals` (origin browser, DevDash badge); attach to it from a second tab; both see each other's keystrokes. Close the creating tab → session survives while the second client is attached; close the second → session is killed (verify `tmux ls`).
- [ ] **Step 7 — lifecycle:** exit the shell inside a native session → row goes dead (isLive=false) within ~5 s and disappears from `/terminals`; attach clients get `pty_exit`. Kill the agent → all its rows marked dead.
- [ ] **Step 8 — mobile:** Chrome mobile emulation (606 px viewport + innerWidth override where needed): `/terminals` list is tappable, attach opens the MobileTerminalShell in Peek with the banner; Drive works with composer + chips.
- [ ] **Step 9:** `npm run build` (then restart `npm run dev`), full `npx tsc --noEmit`, agent suite `npm test --prefix packages/devdash-agent`.
- [ ] **Step 10:** Report: what's verified, what needs a real phone, and the go/no-go question for (a) `git push` (prod deploy) and (b) agent release to registry.npmjs.org.

## Self-Review Notes

- Spec coverage: §4 on-ramp (wrapper, Task 5) ✅; §4 bridge attach-in-PTY (Tasks 3–4) ✅; §5 flow (Tasks 4/6/7/9) ✅; §6 rows: wrapper ✅, tmux-manager ✅ (pipe-pane deferred, documented), agent wiring ✅, ws-server ✅ (message names adapted: `tmux_sessions` instead of `session_list`, attach rides `pty_open` — simpler than new verbs, same capability), schema ✅ (+cols/rows extra), desktop UI ✅, mobile §12.4 list ✅ (as /terminals responsive page), analytics panel → Phase 4 (§14 says so) ✅, installer → minimal `setup-cowork` (documented deviation); §7 client tracking ✅ (badge map + roll-up stat deferred with analytics); §10 lifecycle ✅; §11 Peek/Drive + window-size latest ✅; §13 fail-open guards + opt-out ✅, read-only enforcement server-side is the `-r` attach flag (UI toggle deferred, documented).
- Type consistency: `TmuxSessionInfo` defined once in tmux-manager (Task 2), duplicated as a local interface in ws-server (Task 6 — different package, no shared types possible); `LiveTerminalSession` (Task 1) used by Tasks 7; `pty_open` extension fields named `tmuxSession`/`readOnly` in Terminal (Task 8), ws-server relay (Task 6), and agent handler (Task 4) — identical strings.
- Placeholder scan: Task 5 Step 4's block-extraction command is intentionally "copy the block to a temp file" — a manual-but-precise instruction, not a TBD.
