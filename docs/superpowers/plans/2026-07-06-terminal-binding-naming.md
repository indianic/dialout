# Terminal Binding Wizard + Per-Machine Naming & Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run cowork wizard that adopts existing tmux sessions and installs the wrapper, plus a per-machine terminal name template (rendered at display time) and a short output-preview description on each session card. Spec: `docs/superpowers/specs/2026-07-06-terminal-binding-naming-design.md`.

**Architecture:** The shell wrapper (and browser-origin wrap) stamp raw facts as `@devdash_*` tmux options at session creation. The agent's poller reads them plus a `capture-pane` tail and reports them in the existing `tmux_sessions` message; the ws-server stores them on `terminal_sessions` (preview only if the owner has recording on). Terminal display names are assembled at render time in the web UI by a pure `renderTerminalName(template, vars)` function from each machine's template (stored on the `machines` row). No per-session name state; changing a machine's template re-renders all its sessions instantly.

**Tech Stack:** node-pty + tmux ≥ 3.2 (host: 3.6a), ws, Drizzle/PostgreSQL (postgres.js), Next.js 15 App Router, React 19, xterm 5.

## Global Constraints

- **Never remove or modify the root `.npmrc`** (`@indianic` scope → registry.npmjs.org; prod deploy depends on it).
- **Shared local/prod DB — schema changes ADDITIVE ONLY** (`ADD COLUMN IF NOT EXISTS`, nullable or defaulted). Apply via the explicit script in Task 1, never `drizzle-kit push`.
- Commit to `main`, one commit per task, `feat(cowork): …` / `fix(cowork): …`. **Do NOT `git push`** (push = prod deploy) and **do NOT run the agent release** — both only on explicit user go-ahead after E2E.
- ws-server changes need a `npm run dev` restart to take effect. `npm run build` clobbers the running dev server's `.next` — tasks verify with `npx tsc --noEmit` (and `npx tsx -e` for the pure name lib); the controller rebuilds/restarts at E2E time.
- Agent (`packages/devdash-agent/`) has its own build (`npm run build --prefix packages/devdash-agent`) and node:test suite in `packages/devdash-agent/test/` (files named `*.test.js`). New pure agent logic gets real TDD tests; protocol/UI glue is verified by typecheck + the E2E task.
- **The main Next app has NO test framework and none may be added.** Verify pure functions with `npx tsx -e '…'`; verify everything else with `npx tsc --noEmit` + the E2E task.
- UI uses existing CSS vars/utility classes (`--bg`, `--card`, `--txt`, `--muted`, `--accent`, `--accent-weak`, `--live`, `--r-sm`, `card-v2`, `inp`, `btn-grad`, `status-chip`, `sec-label`) and Phase 2 components. Terminal font: `'JetBrains Mono', Menlo, Monaco, monospace`.
- Wrapper guards **fail open**; `DEVDASH_NO_WRAP=1` always bypasses. Installer is marker-bounded + idempotent.
- **Per machine, not per terminal:** the name template and preview-line count live on the `machines` row and apply to every session on that machine. No per-session overrides.

## Message protocol (single source of truth)

`tmux_sessions` message, `TmuxSessionInfo` gains five fields (all strings; empty when unknown):
```
folder, folderPath, createdLocal, gitBranch, lastLines
```
`lastLines` is up to `PREVIEW_CAP = 5` lines joined by `\n`. Everything else in the message is unchanged.

## Naming tokens (single source of truth)

Template tokens (bracket syntax): `[machine_name]` `[folder_name]` `[folder_path]` `[date]` `[time]` `[ampm]` `[git_branch]` `[term_program]` `[short_id]`.
Default template string (used verbatim everywhere a default is needed):
`[machine_name]-[folder_name]-[date]-[time][ampm]`

---

### Task 1: Schema columns + apply script + types

**Files:**
- Modify: `src/lib/schema.ts` (terminalSessions + machines)
- Create: `scripts/apply-terminal-naming-columns.mjs`
- Modify: `src/types/index.ts` (`Machine`, `LiveTerminalSession`)

**Interfaces:**
- Produces: columns `terminal_sessions.{folder, folder_path, created_local, git_branch, last_lines}` and `machines.{terminal_name_template, terminal_preview_lines}`; type fields used by Tasks 7–10.

- [ ] **Step 1: Add columns to `terminalSessions` in `src/lib/schema.ts`** (after the Phase 2 cowork block, before the closing `});`):

```ts
  // Terminal naming/preview facts — additive only.
  folder: text('folder'),
  folderPath: text('folder_path'),
  createdLocal: text('created_local'),
  gitBranch: text('git_branch'),
  lastLines: text('last_lines'),
```

- [ ] **Step 2: Add columns to the `machines` table in `src/lib/schema.ts`** (after `hidden`, before `createdAt`):

```ts
  terminalNameTemplate: text('terminal_name_template'),
  terminalPreviewLines: integer('terminal_preview_lines').default(3),
```

Ensure `integer` is imported in `schema.ts` (it already is — used by other tables).

- [ ] **Step 3: Create `scripts/apply-terminal-naming-columns.mjs`**

```js
#!/usr/bin/env node
// Additive, idempotent columns for terminal naming + preview.
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS folder text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS folder_path text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS created_local text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS git_branch text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS last_lines text`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS terminal_name_template text`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS terminal_preview_lines integer DEFAULT 3`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }
await sql.end();
console.log('done');
```

- [ ] **Step 4: Run + verify**

Run: `node scripts/apply-terminal-naming-columns.mjs`
Expected: seven `applied:` lines + `done`.
Verify: `node -e "import('dotenv').then(d=>{d.config();import('postgres').then(async p=>{const sql=p.default(process.env.DATABASE_URL);const a=await sql\`SELECT column_name FROM information_schema.columns WHERE table_name='terminal_sessions'\`;const b=await sql\`SELECT column_name FROM information_schema.columns WHERE table_name='machines'\`;console.log('ts:',a.map(x=>x.column_name).filter(c=>['folder','folder_path','created_local','git_branch','last_lines'].includes(c)).join(','));console.log('m:',b.map(x=>x.column_name).filter(c=>['terminal_name_template','terminal_preview_lines'].includes(c)).join(','));await sql.end();})})"`
Expected: `ts: folder,folder_path,created_local,git_branch,last_lines` and `m: terminal_name_template,terminal_preview_lines`.

- [ ] **Step 5: Update types in `src/types/index.ts`**

Find the `Machine` interface and add (adapt to its exact style):
```ts
  terminalNameTemplate?: string | null;
  terminalPreviewLines?: number | null;
```
Find `LiveTerminalSession` (added in Phase 2) and add:
```ts
  folder: string | null;
  folderPath: string | null;
  createdLocal: string | null;
  gitBranch: string | null;
  lastLines: string | null;
```

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schema.ts scripts/apply-terminal-naming-columns.mjs src/types/index.ts
git commit -m "feat(cowork): additive terminal naming/preview columns + machine template columns"
```

---

### Task 2: Pure `renderTerminalName` library

**Files:**
- Create: `src/lib/terminal-name.ts`

**Interfaces:**
- Produces (used by Tasks 9–10):
  ```ts
  export interface TerminalNameVars {
    machine_name?: string; folder_name?: string; folder_path?: string;
    date?: string; time?: string; ampm?: string;
    git_branch?: string; term_program?: string; short_id?: string;
  }
  export const DEFAULT_TERMINAL_TEMPLATE: string;   // '[machine_name]-[folder_name]-[date]-[time][ampm]'
  export const TERMINAL_NAME_TOKENS: string[];      // the nine token names, no brackets
  export function factsFromSession(s: {           // build vars from a live-session row
    machineName: string; folder: string | null; folderPath: string | null;
    createdLocal: string | null; startedAt: string | null; gitBranch: string | null;
    termProgram: string | null; tmuxName: string;
  }): TerminalNameVars;
  export function renderTerminalName(template: string, vars: TerminalNameVars, fallback: string): string;
  ```

- [ ] **Step 1: Create `src/lib/terminal-name.ts`**

```ts
// Pure terminal-name rendering. Shared by the /terminals list, the attach
// header, and the mobile top bar so one name shows everywhere and updates
// the instant a machine's template changes. No React, no I/O.

export interface TerminalNameVars {
  machine_name?: string;
  folder_name?: string;
  folder_path?: string;
  date?: string;
  time?: string;
  ampm?: string;
  git_branch?: string;
  term_program?: string;
  short_id?: string;
}

export const DEFAULT_TERMINAL_TEMPLATE = '[machine_name]-[folder_name]-[date]-[time][ampm]';

export const TERMINAL_NAME_TOKENS = [
  'machine_name', 'folder_name', 'folder_path',
  'date', 'time', 'ampm',
  'git_branch', 'term_program', 'short_id',
];

// Split an ISO-ish or Date-parseable timestamp into date/time/ampm parts.
function timeParts(iso: string | null): { date: string; time: string; ampm: string } {
  if (!iso) return { date: '', time: '', ampm: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '', ampm: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let h = d.getHours();
  const ampm = h < 12 ? 'am' : 'pm';
  h = h % 12; if (h === 0) h = 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${h}:${min}`, ampm };
}

export function factsFromSession(s: {
  machineName: string;
  folder: string | null;
  folderPath: string | null;
  createdLocal: string | null;
  startedAt: string | null;
  gitBranch: string | null;
  termProgram: string | null;
  tmuxName: string;
}): TerminalNameVars {
  // Prefer the machine-local stamp; fall back to the server row time.
  const t = timeParts(s.createdLocal || s.startedAt);
  const shortId = (s.tmuxName.split('-').pop() || s.tmuxName).slice(0, 8);
  return {
    machine_name: s.machineName || '',
    folder_name: s.folder || '',
    folder_path: s.folderPath || '',
    date: t.date,
    time: t.time,
    ampm: t.ampm,
    git_branch: s.gitBranch || '',
    term_program: s.termProgram && s.termProgram !== 'unknown' ? s.termProgram : '',
    short_id: shortId,
  };
}

// Render `template`, substituting [token]. When a token is empty, drop it AND
// one run of adjacent separators (-, _, space) so no dangling/doubled
// separators remain. If the whole render is empty, use `fallback`.
export function renderTerminalName(
  template: string,
  vars: TerminalNameVars,
  fallback: string
): string {
  if (!template) return fallback;
  let out = template;
  for (const token of TERMINAL_NAME_TOKENS) {
    const value = (vars as Record<string, string | undefined>)[token] ?? '';
    if (value) {
      out = out.split(`[${token}]`).join(value);
    } else {
      // Remove the token plus a leading OR trailing separator run.
      const re = new RegExp(`(?:[-_ ]+)?\\[${token}\\]|\\[${token}\\](?:[-_ ]+)?`, 'g');
      out = out.replace(re, '');
    }
  }
  // Any leftover unknown [tokens] → strip. Collapse doubled separators + trim.
  out = out.replace(/\[[a-z_]+\]/g, '');
  out = out.replace(/[-_]{2,}/g, (m) => m[0]).replace(/^[-_ ]+|[-_ ]+$/g, '').trim();
  return out || fallback;
}
```

- [ ] **Step 2: Verify with tsx (no test framework in this app)**

Run:
```bash
npx tsx -e "
import { renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE } from './src/lib/terminal-name.ts';
const vars = factsFromSession({ machineName:'SKMTest-local', folder:'phasepilot', folderPath:'/www/phasepilot', createdLocal:'2026-07-06T11:02:00', startedAt:null, gitBranch:'', termProgram:'iTerm.app', tmuxName:'phasepilot-ab12cd34' });
console.log('default:', renderTerminalName(DEFAULT_TERMINAL_TEMPLATE, vars, 'FALLBACK'));
console.log('nogit:', renderTerminalName('[machine_name]-[folder_name]-[git_branch]-[time]', vars, 'FB'));
console.log('empty:', renderTerminalName('[git_branch]', { git_branch:'' }, 'FB'));
"
```
Expected (exactly):
```
default: SKMTest-local-phasepilot-2026-07-06-11:02am
nogit: SKMTest-local-phasepilot-11:02
empty: FB
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminal-name.ts
git commit -m "feat(cowork): pure renderTerminalName with token collapse + fallback"
```

---

### Task 3: tmux-manager — read new options + capturePane (TDD)

**Files:**
- Modify: `packages/devdash-agent/src/tmux-manager.ts`
- Test: `packages/devdash-agent/test/tmux-manager.test.js`

**Interfaces:**
- Consumes: existing `run`, `getSessionOption`, `TmuxSessionInfo`.
- Produces (used by Task 6):
  ```ts
  // TmuxSessionInfo gains: folder, folderPath, createdLocal, gitBranch (strings, '' when unset)
  export function capturePane(name: string, lines: number): Promise<string>; // tail, '' on failure
  ```

- [ ] **Step 1: Extend `TmuxSessionInfo`** — add to the interface (after `origin`):

```ts
  folder: string;
  folderPath: string;
  createdLocal: string;
  gitBranch: string;
```

- [ ] **Step 2: Read the new options in `listSessions`** — where the option cache builds `opts`, extend it. Replace the `optionCache` value type and the fetch block so it also reads `@devdash_folder`, `@devdash_folder_path`, `@devdash_created`, `@devdash_git`:

```ts
// (cache type)
const optionCache = new Map<string, {
  termProgram: string; origin: 'native' | 'browser';
  folder: string; folderPath: string; createdLocal: string; gitBranch: string;
}>();
```
and in the miss branch:
```ts
    if (!opts) {
      const [termProgram, originRaw, folder, folderPath, createdLocal, gitBranch] = await Promise.all([
        getSessionOption(base.name, '@term_program'),
        getSessionOption(base.name, '@devdash_origin'),
        getSessionOption(base.name, '@devdash_folder'),
        getSessionOption(base.name, '@devdash_folder_path'),
        getSessionOption(base.name, '@devdash_created'),
        getSessionOption(base.name, '@devdash_git'),
      ]);
      opts = {
        termProgram: termProgram || 'unknown',
        origin: originRaw === 'browser' ? 'browser' : 'native',
        folder, folderPath, createdLocal, gitBranch,
      };
      optionCache.set(base.name, opts);
    }
```
(`sessions.push({ ...base, ...opts })` already spreads all fields.)

NOTE: `@devdash_folder` etc. can change if a session is re-stamped, but in practice they are set once at creation — caching them is consistent with the existing `@term_program`/`@devdash_origin` caching.

- [ ] **Step 3: Add `capturePane`** (after `countClients`):

```ts
// Last `lines` lines of a session's active pane, for the preview description.
// Best-effort: '' on any failure or empty pane.
export async function capturePane(name: string, lines: number): Promise<string> {
  if (lines <= 0) return '';
  try {
    // -p prints to stdout, -t targets the session (its active pane).
    const out = await run(['capture-pane', '-p', '-t', name]);
    const rows = out.replace(/\n+$/, '').split('\n');
    return rows.slice(-lines).join('\n');
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Write the failing test** — append to `packages/devdash-agent/test/tmux-manager.test.js`. Since `capturePane` shells out, test only the pure line-tail slicing via a small exported helper. Add this helper export to `tmux-manager.ts` right above `capturePane`:

```ts
// Exported for unit testing the tail slice without shelling out.
export function tailLines(text: string, lines: number): string {
  if (lines <= 0) return '';
  const rows = text.replace(/\n+$/, '').split('\n');
  return rows.slice(-lines).join('\n');
}
```
and make `capturePane` use it: replace its body's rows/slice logic with `return tailLines(out, lines);`.

Then the test:
```js
const { tailLines } = require('../dist/tmux-manager');

test('tailLines returns the last N non-trailing-blank lines', () => {
  assert.strictEqual(tailLines('a\nb\nc\nd\n', 2), 'c\nd');
  assert.strictEqual(tailLines('only\n\n\n', 3), 'only');
  assert.strictEqual(tailLines('x\ny', 0), '');
  assert.strictEqual(tailLines('', 3), '');
});
```

- [ ] **Step 5: Build + run — verify fail then pass**

Run: `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -8`
Expected first (before Step 1–4 code exists / if run against old dist): FAIL. After implementing: all tests pass (existing + `tailLines`).

- [ ] **Step 6: Live smoke**

```bash
tmux new-session -d -s tn-smoke-1 -c /Volumes/SandeepSSD/www/tools
tmux set-option -t tn-smoke-1 @devdash_folder tools
tmux send-keys -t tn-smoke-1 'echo hello-preview' Enter
sleep 1
node -e "const m=require('./packages/devdash-agent/dist/tmux-manager');(async()=>{const s=(await m.listSessions()).find(x=>x.name==='tn-smoke-1');console.log('folder:',s.folder);console.log('preview:',JSON.stringify(await m.capturePane('tn-smoke-1',3)));})()"
tmux kill-session -t tn-smoke-1
```
Expected: `folder: tools` and a preview string containing `hello-preview`.

- [ ] **Step 7: Commit**

```bash
git add packages/devdash-agent/src/tmux-manager.ts packages/devdash-agent/test/tmux-manager.test.js
git commit -m "feat(cowork): tmux-manager reads folder/created/git options + capturePane preview"
```

---

### Task 4: Wrapper + browser-origin stamps

**Files:**
- Modify: `packages/devdash-agent/src/cli.ts` (`COWORK_BLOCK`)
- Modify: `packages/devdash-agent/src/pty-manager.ts` (cowork-wrap block)

**Interfaces:**
- Produces: sessions created by the wrapper and by browser-origin wrap carry `@devdash_folder`, `@devdash_folder_path`, `@devdash_created`, `@devdash_git` (read by Task 3).

- [ ] **Step 1: Stamp facts in the shell wrapper** — in `COWORK_BLOCK`, after the existing `@term_program` / `@devdash_origin` / window-option lines and before `exec tmux new-session -A -s "$_dd_name"`, add these stamp lines (mind TS-template escaping — the emitted shell must contain literal `$(...)`/`${...}`):

```
        tmux set-option -t "$_dd_name" @devdash_folder "$(basename "$PWD" 2>/dev/null)" 2>/dev/null
        tmux set-option -t "$_dd_name" @devdash_folder_path "$PWD" 2>/dev/null
        tmux set-option -t "$_dd_name" @devdash_created "$(date +%Y-%m-%dT%H:%M:%S)" 2>/dev/null
        tmux set-option -t "$_dd_name" @devdash_git "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" 2>/dev/null
```
In the TS template literal these become (escape `$` as `\$`):
```ts
        tmux set-option -t "\$_dd_name" @devdash_folder "\$(basename "\$PWD" 2>/dev/null)" 2>/dev/null
        tmux set-option -t "\$_dd_name" @devdash_folder_path "\$PWD" 2>/dev/null
        tmux set-option -t "\$_dd_name" @devdash_created "\$(date +%Y-%m-%dT%H:%M:%S)" 2>/dev/null
        tmux set-option -t "\$_dd_name" @devdash_git "\$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" 2>/dev/null
```
All fail-open (each `2>/dev/null`, never aborts the shell).

- [ ] **Step 2: Stamp facts in the browser-origin wrap** — in `pty-manager.ts`'s `openSession` cowork-wrap `try` block, after the existing `@devdash_origin`/`@term_program` stamps and before spawning the attach, add (using the existing `tmuxRun` helper + `resolvedCwd` + node):

```ts
      const base = resolvedCwd.split('/').filter(Boolean).pop() || '';
      const nowIso = new Date().toISOString().replace(/\.\d+Z$/, '').replace('Z', '');
      tmuxRun(['set-option', '-t', tmuxName, '@devdash_folder', base]);
      tmuxRun(['set-option', '-t', tmuxName, '@devdash_folder_path', resolvedCwd]);
      tmuxRun(['set-option', '-t', tmuxName, '@devdash_created', nowIso]);
      let branch = '';
      try {
        const { execFileSync } = require('child_process') as typeof import('child_process');
        branch = execFileSync('git', ['-C', resolvedCwd, 'rev-parse', '--abbrev-ref', 'HEAD'],
          { timeout: 3000, stdio: 'pipe' }).toString().trim();
      } catch {}
      tmuxRun(['set-option', '-t', tmuxName, '@devdash_git', branch]);
```
(If `execFileSync` is already imported at the top of the file from a prior task, use that import instead of the inline require.)

- [ ] **Step 3: Build** — `npm run build --prefix packages/devdash-agent` → success. `npm test --prefix packages/devdash-agent 2>&1 | tail -4` → all pass (no behavior change to tested code).

- [ ] **Step 4: Verify emitted wrapper is valid shell** — extract the block into a temp file against a fake HOME and syntax-check both shells:

```bash
FH=/private/tmp/claude-501/-Volumes-SandeepSSD-www-tools-devdash/*/scratchpad/tnfh
mkdir -p $FH && HOME=$FH node packages/devdash-agent/dist/cli.js setup-cowork >/dev/null 2>&1
grep -q '@devdash_folder' $FH/.zshrc && echo "stamps present"
bash -n $FH/.zshrc && echo "bash ok"; zsh -n $FH/.zshrc && echo "zsh ok"
HOME=$FH node packages/devdash-agent/dist/cli.js setup-cowork --remove >/dev/null 2>&1; rm -rf $FH
```
Expected: `stamps present`, `bash ok`, `zsh ok`. (CAUTION: always pass `HOME=$FH`; never touch the real rc.)

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/cli.ts packages/devdash-agent/src/pty-manager.ts
git commit -m "feat(cowork): wrapper + browser-origin wrap stamp folder/path/created/git facts"
```

---

### Task 5: `setup-cowork` adopt-existing-sessions wizard

**Files:**
- Modify: `packages/devdash-agent/src/cli.ts` (`setup-cowork` action)

**Interfaces:**
- Consumes: `listSessions` (Task 3), `tmuxAvailable`; existing `createRL`/`ask` helpers in cli.ts (confirm exact names).
- Produces: adopting stamps `@devdash_origin=native` + folder facts on chosen pre-existing tmux sessions so the poller reports them.

- [ ] **Step 1: Add the adopt step to the `setup-cowork` action** — after the tmux-availability check and before installing the wrapper, insert an interactive adopt prompt. Use the file's existing readline helpers (`createRL` / `ask`) and lucide-free console styling already used in cli.ts:

```ts
    // Offer to adopt pre-existing tmux sessions (ones DevDash didn't create).
    const { listSessions } = require('./tmux-manager') as typeof import('./tmux-manager');
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const all = await listSessions();
    const orphans = all.filter((s) => s.origin !== 'browser' && !s.folder); // unstamped = not ours
    if (orphans.length > 0 && !opts.noAdopt) {
      console.log('');
      console.log(`Found ${orphans.length} existing tmux session(s) not managed by DevDash:`);
      orphans.forEach((s, i) => {
        console.log(`  ${i + 1}) ${s.name}  (${s.termProgram})`);
      });
      let pick: string;
      if (opts.adoptAll) {
        pick = 'a';
      } else {
        const rl = createRL();
        pick = (await ask(rl, 'Bind which to DevDash? [1,2,… / a=all / n=none]: ')).trim().toLowerCase();
        rl.close();
      }
      let chosen: typeof orphans = [];
      if (pick === 'a') chosen = orphans;
      else if (pick && pick !== 'n') {
        const idx = pick.split(/[, ]+/).map((x) => parseInt(x, 10) - 1).filter((n) => n >= 0 && n < orphans.length);
        chosen = idx.map((i) => orphans[i]);
      }
      for (const s of chosen) {
        const tmux = (args: string[]) => { try { execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' }); } catch {} };
        // Read the session's real cwd from its active pane for the folder facts.
        let cwd = '';
        try {
          cwd = execFileSync('tmux', ['display-message', '-p', '-t', s.name, '#{pane_current_path}'],
            { timeout: 5000, stdio: 'pipe' }).toString().trim();
        } catch {}
        const base = cwd.split('/').filter(Boolean).pop() || '';
        tmux(['set-option', '-t', s.name, '@devdash_origin', 'native']);
        if (s.termProgram === 'unknown') tmux(['set-option', '-t', s.name, '@term_program', 'unknown']);
        if (base) tmux(['set-option', '-t', s.name, '@devdash_folder', base]);
        if (cwd) tmux(['set-option', '-t', s.name, '@devdash_folder_path', cwd]);
      }
      if (chosen.length > 0) console.log(`\x1b[32m✓ Adopted ${chosen.length} session(s)\x1b[0m (live after the agent's next poll)`);
    }
```

- [ ] **Step 2: Register the new flags** on the `setup-cowork` command definition — add `.option('--adopt-all', 'Adopt all existing tmux sessions non-interactively')` and `.option('--no-adopt', 'Skip adopting existing sessions')`, and widen the action's `opts` type to `{ remove?: boolean; adoptAll?: boolean; noAdopt?: boolean }`.

Note: commander maps `--no-adopt` to `opts.adopt === false`; if the file's commander version does that, read `opts.adopt === false` instead of `opts.noAdopt`. Confirm by checking how any existing `--no-*` flag is read in cli.ts (e.g. `--no-cowork`); match that convention.

- [ ] **Step 3: Build** — `npm run build --prefix packages/devdash-agent` → success.

- [ ] **Step 4: Verify the prompt path against real tmux (no real rc changes)**

```bash
tmux new-session -d -s adopt-demo-1 -c /Volumes/SandeepSSD/www/tools
FH=/private/tmp/claude-501/-Volumes-SandeepSSD-www-tools-devdash/*/scratchpad/tnfh2
mkdir -p $FH
HOME=$FH node packages/devdash-agent/dist/cli.js setup-cowork --adopt-all --no-cowork 2>&1 | tail -6 || true
tmux show-options -t adopt-demo-1 -qv @devdash_origin; tmux show-options -t adopt-demo-1 -qv @devdash_folder
HOME=$FH node packages/devdash-agent/dist/cli.js setup-cowork --remove >/dev/null 2>&1; rm -rf $FH
tmux kill-session -t adopt-demo-1
```
Expected: adopt output lists `adopt-demo-1`; the two `show-options` print `native` and `tools`.
(If `--no-cowork` isn't a valid combined flag, drop it — the point is to exercise adopt without persisting cowork; note any adjustment.)

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/cli.ts
git commit -m "feat(cowork): setup-cowork adopts pre-existing tmux sessions (interactive + --adopt-all/--no-adopt)"
```

---

### Task 6: Agent report — extend payload + capture in poller

**Files:**
- Modify: `packages/devdash-agent/src/websocket.ts`

**Interfaces:**
- Consumes: `listSessions` (Task 3 fields), `capturePane` (Task 3).
- Produces: `tmux_sessions` message where each session includes `folder, folderPath, createdLocal, gitBranch, lastLines` (Task 7 consumes).

- [ ] **Step 1: Import `capturePane`** — extend the `./tmux-manager` import to include `capturePane`.

- [ ] **Step 2: Add the preview cap constant** near the other tmux poll constants:

```ts
const PREVIEW_CAP = 5;
```

- [ ] **Step 3: Enrich each session with its preview in `pollTmuxSessions`** — after `const sessions = await listSessions();` and before building the snapshot, attach `lastLines`:

```ts
    const enriched = await Promise.all(sessions.map(async (s) => ({
      ...s,
      lastLines: await capturePane(s.name, PREVIEW_CAP),
    })));
```
Then change the snapshot + send to use `enriched`. Keep the change-detection snapshot as-is EXCEPT also include a short hash of lastLines so preview updates propagate. Replace the snapshot line with:

```ts
    const snapshot = JSON.stringify(enriched.map((s) => [s.name, s.attached, s.width, s.height, s.lastLines]));
```
and the send with `ws.send(JSON.stringify({ type: 'tmux_sessions', sessions: enriched }));`.

NOTE: including `lastLines` in the snapshot means the poller now reports whenever visible output changes — that's intended (previews stay fresh) and still bounded by the 5s poll interval.

- [ ] **Step 4: Build + tests** — `npm run build --prefix packages/devdash-agent && npm test --prefix packages/devdash-agent 2>&1 | tail -4` → pass.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/websocket.ts
git commit -m "feat(cowork): agent reports folder/git/created facts + capture-pane preview per session"
```

---

### Task 7: ws-server — store new fields (preview gated on recording)

**Files:**
- Modify: `src/ws-server/index.ts`

**Interfaces:**
- Consumes: extended `tmux_sessions` message (Task 6); schema columns (Task 1).
- Produces: `terminal_sessions` rows carry `folder, folder_path, created_local, git_branch, last_lines` (last_lines only when the owner has recording on) — Task 9 reads them.

- [ ] **Step 1: Extend the local `TmuxSessionInfo` interface** in `src/ws-server/index.ts` (the ws-server's own copy) with:

```ts
  folder?: string; folderPath?: string; createdLocal?: string; gitBranch?: string; lastLines?: string;
```

- [ ] **Step 2: Store the fields in `handleTmuxSessions`** — this fn already loops sessions and does UPDATE-then-INSERT. First resolve preview permission once per call:

```ts
  const recordOn = await isRecordingEnabled(userId);
```
(place it right after `const userId = await getMachineOwner(machineId); if (userId == null) return;`).

In the UPDATE, add the new columns to the SET list:
```ts
        SET is_live = true, last_active_at = ${lastActive},
            term_program = ${s.termProgram}, origin = ${s.origin},
            cols = ${s.width}, rows = ${s.height}, ended_at = NULL,
            folder = ${s.folder ?? null}, folder_path = ${s.folderPath ?? null},
            created_local = ${s.createdLocal ?? null}, git_branch = ${s.gitBranch ?? null},
            last_lines = ${recordOn ? (s.lastLines ?? null) : null}
```
In the INSERT, add the columns + values:
```ts
        INSERT INTO terminal_sessions
          (machine_id, user_id, command, cwd, tmux_name, term_program, origin, is_live,
           last_active_at, cols, rows, folder, folder_path, created_local, git_branch, last_lines)
        VALUES
          (${machineId}, ${userId}, ${'tmux:' + s.name}, ${s.folderPath || '~'}, ${s.name},
           ${s.termProgram}, ${s.origin}, true, ${lastActive}, ${s.width}, ${s.height},
           ${s.folder ?? null}, ${s.folderPath ?? null}, ${s.createdLocal ?? null},
           ${s.gitBranch ?? null}, ${recordOn ? (s.lastLines ?? null) : null})
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/ws-server/index.ts
git commit -m "feat(cowork): ws-server stores folder/git/created facts + recording-gated preview lines"
```

---

### Task 8: Machine settings PATCH API

**Files:**
- Modify: `src/app/api/machines/route.ts` (add `PATCH`)

**Interfaces:**
- Consumes: `getSession` (session auth), `machines` table (Task 1 columns).
- Produces: `PATCH /api/machines` with body `{ id, terminalNameTemplate?, terminalPreviewLines? }` → updates the owner's machine; Task 10 calls it.

- [ ] **Step 1: Add a `PATCH` handler** to `src/app/api/machines/route.ts`. Use the session-cookie auth (`getSession`) rather than the query-param `userId` the GET uses, since this mutates. Import what's needed (`getSession` from `@/lib/auth`, `and`/`eq` from drizzle-orm):

```ts
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { id?: number; terminalNameTemplate?: string; terminalPreviewLines?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Owner scope: only update a machine this user owns.
  const owned = await db.select().from(machines)
    .where(and(eq(machines.id, id), eq(machines.userId, session.userId)));
  if (owned.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.terminalNameTemplate === 'string') patch.terminalNameTemplate = body.terminalNameTemplate.slice(0, 200);
  if (typeof body.terminalPreviewLines === 'number') {
    patch.terminalPreviewLines = Math.max(0, Math.min(5, Math.round(body.terminalPreviewLines)));
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  await db.update(machines).set(patch).where(eq(machines.id, id));
  return NextResponse.json({ ok: true });
}
```
Add the imports (`getSession`, `and`) — confirm `getSession` path matches `src/app/api/auth/route.ts`.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/machines/route.ts
git commit -m "feat(cowork): PATCH /api/machines for per-machine terminal template + preview lines"
```

---

### Task 9: Terminals page + attach header + mobile top bar render names & preview

**Files:**
- Modify: `src/app/api/live-sessions/route.ts` (include new fields)
- Modify: `src/app/(dash)/terminals/page.tsx`
- Modify: `src/app/terminal/[machineId]/[name]/page.tsx`

**Interfaces:**
- Consumes: `renderTerminalName`, `factsFromSession`, `DEFAULT_TERMINAL_TEMPLATE` (Task 2); `LiveTerminalSession` fields (Task 1); `session.machines[].terminalNameTemplate/terminalPreviewLines` (Task 1 type; already delivered by `/api/auth` and `/api/machines` which `select()` the whole row).

- [ ] **Step 1: Include the new fields in `/api/live-sessions`** — in the `.map((r) => ({ … }))` response, add:

```ts
        folder: r.folder,
        folderPath: r.folderPath,
        createdLocal: r.createdLocal,
        gitBranch: r.gitBranch,
        lastLines: r.lastLines,
```

- [ ] **Step 2: Render the name + preview in `terminals/page.tsx`** — import the lib and the machine lookup:

```tsx
import { renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE } from '@/lib/terminal-name';
```
Replace the card's title (currently `{s.tmuxName}`) with a computed display name, and add a preview block. Inside the `list.map((s) => …)`, before the return, compute:

```tsx
                const machine = session?.machines.find((m) => m.id === s.machineId);
                const template = machine?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE;
                const previewLines = machine?.terminalPreviewLines ?? 3;
                const displayName = renderTerminalName(
                  template,
                  factsFromSession({
                    machineName: machine?.name || '',
                    folder: s.folder, folderPath: s.folderPath, createdLocal: s.createdLocal,
                    startedAt: s.startedAt, gitBranch: s.gitBranch, termProgram: s.termProgram,
                    tmuxName: s.tmuxName,
                  }),
                  s.tmuxName
                );
                const preview = (s.lastLines || '').split('\n').filter(Boolean).slice(-previewLines);
```
Use `displayName` for the primary title (JetBrains Mono line), keep `s.tmuxName` shown small/muted as the stable id below or beside the badges, and render the preview when `previewLines > 0 && preview.length`:

```tsx
                    <div className="devdash-term-name">{displayName}</div>
                    <div className="devdash-term-id">{s.tmuxName}</div>
                    {previewLines > 0 && preview.length > 0 && (
                      <pre className="devdash-term-preview">{preview.join('\n')}</pre>
                    )}
```
Add minimal styles inline or reuse existing tokens — `.devdash-term-name` = the existing mono title style; `.devdash-term-id` = 10.5px `var(--dim)`; `.devdash-term-preview` = 11px mono, `var(--muted)`, `white-space: pre-wrap`, `max-height` ~3.4em, `overflow: hidden`, small top margin. Put these three rules in the page (a `<style jsx>` is fine, or extend an existing CSS file the page already imports). Keep the badges row (client/origin/size/active-ago) as-is.

- [ ] **Step 3: Name the attach header + mobile top bar** in `terminal/[machineId]/[name]/page.tsx` — fetch the machine template alongside auth (the `/api/auth` payload already includes `machines`), compute the display name once, and pass it as the shell `title` and the desktop header title instead of the raw `tmuxName`. In the mount effect that fetches `/api/auth`, also stash the machine:

```tsx
    fetch('/api/auth').then((r)=>r.ok?r.json():Promise.reject()).then((s)=>{
      setUserId(s.userId);
      const m = (s.machines || []).find((x: { id: number }) => x.id === machineId);
      setMachine(m || null);
    }).catch(() => setAuthError(true));
```
Add `const [machine, setMachine] = useState<{ name?: string; terminalNameTemplate?: string | null } | null>(null);`, and compute:
```tsx
  const displayName = renderTerminalName(
    machine?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE,
    factsFromSession({
      machineName: machine?.name || '', folder: null, folderPath: null, createdLocal: null,
      startedAt: null, gitBranch: null, termProgram: null, tmuxName,
    }),
    tmuxName
  );
```
Use `displayName` for `title={displayName}` (mobile shell) and the desktop `.devdash-attach-title` text. (The attach page doesn't have the session's folder facts handy; `machine_name` + `short_id` from the tmux name still render a sensible name, and the exact folder-rich name shows on the `/terminals` list. Acceptable per spec — the attach view is secondary.)

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/live-sessions/route.ts "src/app/(dash)/terminals/page.tsx" "src/app/terminal/[machineId]/[name]/page.tsx"
git commit -m "feat(cowork): render per-machine terminal names + output preview in list and attach view"
```

---

### Task 10: Settings → Terminals panel

**Files:**
- Create: `src/components/TerminalNamingSettings.tsx`
- Modify: `src/app/(dash)/settings/page.tsx` (render the new panel)

**Interfaces:**
- Consumes: `PATCH /api/machines` (Task 8); `renderTerminalName`/`factsFromSession`/`DEFAULT_TERMINAL_TEMPLATE`/`TERMINAL_NAME_TOKENS` (Task 2); `useDashboard().session.machines` for the machine list + current values.
- Produces: per-machine template + preview-lines editor.

- [ ] **Step 1: Create `src/components/TerminalNamingSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Save, Type } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE, TERMINAL_NAME_TOKENS,
} from '@/lib/terminal-name';

export default function TerminalNamingSettings() {
  const { session, reloadSession } = useDashboard() as any; // reloadSession optional; see step 2
  const machines: Array<{ id: number; name: string; terminalNameTemplate?: string | null; terminalPreviewLines?: number | null }> =
    session?.machines || [];
  const [machineId, setMachineId] = useState<number>(session?.machineId || machines[0]?.id || 0);
  const current = machines.find((m) => m.id === machineId);
  const [template, setTemplate] = useState(current?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE);
  const [lines, setLines] = useState<number>(current?.terminalPreviewLines ?? 3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onPickMachine = (id: number) => {
    setMachineId(id);
    const m = machines.find((x) => x.id === id);
    setTemplate(m?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE);
    setLines(m?.terminalPreviewLines ?? 3);
    setSaved(false);
  };

  const insertToken = (tok: string) => setTemplate((t) => `${t}[${tok}]`);

  const previewName = renderTerminalName(
    template,
    factsFromSession({
      machineName: current?.name || 'machine', folder: 'phasepilot', folderPath: '/www/phasepilot',
      createdLocal: new Date().toISOString().replace(/\.\d+Z$/, ''), startedAt: null,
      gitBranch: 'main', termProgram: 'iTerm.app', tmuxName: 'phasepilot-ab12cd34',
    }),
    'phasepilot-ab12cd34'
  );

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: machineId, terminalNameTemplate: template, terminalPreviewLines: lines }),
      });
      setSaved(true);
      reloadSession?.();
    } catch { /* silent */ }
    setSaving(false);
  };

  if (machines.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="sec-label flex items-center gap-2">
        <Type size={15} style={{ color: 'var(--muted)' }} />
        <span>Terminal Naming</span>
      </div>
      <div className="card-v2" style={{ padding: 18 }}>
        {machines.length > 1 && (
          <div className="mb-4">
            <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 6 }}>Machine</div>
            <select className="inp" style={{ width: 'auto' }} value={machineId} onChange={(e) => onPickMachine(Number(e.target.value))}>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Name template</div>
        <input className="inp" style={{ width: '100%', fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace" }}
          value={template} onChange={(e) => { setTemplate(e.target.value); setSaved(false); }} />
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
          {TERMINAL_NAME_TOKENS.map((tok) => (
            <button key={tok} type="button" onClick={() => insertToken(tok)}
              className="status-chip" style={{ cursor: 'pointer', fontSize: 11 }}>[{tok}]</button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          Preview: <span style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace" }}>{previewName}</span>
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 18 }}>
          <div>
            <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600 }}>Description lines</div>
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Last lines of output shown on the card (0 hides)</div>
          </div>
          <select className="inp" style={{ width: 'auto' }} value={lines} onChange={(e) => { setLines(Number(e.target.value)); setSaved(false); }}>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="flex justify-end" style={{ marginTop: 18 }}>
          <button onClick={save} disabled={saving} className="btn-grad flex items-center gap-1.5">
            {saving ? <span className="spin" style={{ width: 14, height: 14, display: 'inline-block' }} /> : <Save size={15} />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm/adjust the DashboardContext hooks used** — verify `useDashboard()` exposes `session` (with `machines` + `machineId`). If a `reloadSession`/`refreshSession` function exists, use its real name; if none exists, drop the `reloadSession?.()` call and instead do a light `window.location.reload()` after save, OR leave it (saved state shows; the new template applies on next natural session load). Pick the least-invasive option that exists and note it.

- [ ] **Step 3: Render the panel** — in `src/app/(dash)/settings/page.tsx`, import and render `<TerminalNamingSettings />` below `<SettingsPanel />`:

```tsx
import TerminalNamingSettings from '@/components/TerminalNamingSettings';
// …
      <SettingsPanel />
      <TerminalNamingSettings />
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit 2>&1 | head -20` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TerminalNamingSettings.tsx "src/app/(dash)/settings/page.tsx"
git commit -m "feat(cowork): Settings → Terminal Naming panel (per-machine template + preview lines)"
```

---

### Task 11: End-to-end verification (main session)

Runs in the MAIN session (browser + dev stack + real tmux). Fixes go in as `fix(cowork): …` commits.

- [ ] **Step 1:** Restart the stack: `npm run dev` (picks up ws-server + Next changes). Restart the source agent with cowork on: `node dist/cli.js start --profile local` from `packages/devdash-agent`.
- [ ] **Step 2 — wizard adopt:** create two pre-existing tmux sessions (no DevDash stamps), run `HOME=<fakehome> node packages/devdash-agent/dist/cli.js setup-cowork --adopt-all --no-cowork` style against the real agent's config path is not needed — instead adopt directly by running the real `setup-cowork` adopt path (or stamp via the CLI) and confirm within ~5s the sessions appear in `/terminals` with folder + badge. Verify unpicked sessions do NOT appear.
- [ ] **Step 3 — naming:** confirm the default template renders `<machine>-<folder>-<date>-<time><ampm>` on the card. In Settings → Terminal Naming, change the template (e.g. add `[git_branch]`, drop `[date]`), Save, refresh `/terminals` → names update; a session with no git branch shows no dangling separator.
- [ ] **Step 4 — preview:** with recording ON, run `echo preview-line-XYZ` in a live session → within ~5s the card shows the last lines incl. `preview-line-XYZ`. Set Description lines = 0 → preview hides. Turn recording OFF (Settings), run another command → new `last_lines` not stored (verify via a DB query that `last_lines` is null for that session).
- [ ] **Step 5 — per-machine:** confirm the template is scoped to the machine (a second machine, if available, keeps its own; otherwise verify the PATCH only touched the one machine row via DB).
- [ ] **Step 6 — browser-origin:** open a project Shell (cowork on) → the `dd-*` session shows a name built from its folder + `DevDash` term badge; preview reflects its output.
- [ ] **Step 7 — regression:** attach Drive/Peek still work; the attach header shows the rendered name; the mobile shell top bar shows it.
- [ ] **Step 8:** `npm run build` (then restart `npm run dev`), full `npx tsc --noEmit`, agent suite `npm test --prefix packages/devdash-agent`.
- [ ] **Step 9:** Report verified vs. real-device-only items, and the go/no-go for (a) `git push` (prod deploy) and (b) agent release.

## Self-Review Notes

- Spec coverage: §3 live scope (all wrapped auto; wizard adopts only unstamped) → Tasks 5/6/7; §4 display-time render → Tasks 2/9/10; §5 flow → Tasks 3/4/6/7; §6 component table → Tasks 3–10; §7 tokens + collapse + fallback → Task 2; §8 preview cap + recording gate + preview_lines display → Tasks 3/6/7/9/10; §9 wizard → Task 5; §10 schema → Task 1; §11 settings UI → Task 10; §12 security (recording gate, owner-scoped PATCH, path opt-in) → Tasks 7/8/2; §13 graceful degradation (fallbacks) → Task 2 render rules; §15 acceptance → Task 11.
- Type consistency: `TmuxSessionInfo` gains the 4 option fields (Task 3) + `lastLines` at report time (Task 6); ws-server's own `TmuxSessionInfo` mirror + optional fields (Task 7). `TerminalNameVars`/`renderTerminalName`/`factsFromSession`/`DEFAULT_TERMINAL_TEMPLATE`/`TERMINAL_NAME_TOKENS` defined once (Task 2), consumed identically in Tasks 9/10. `LiveTerminalSession` (Task 1) fields consumed in Task 9.
- Placeholder scan: Task 5 Step 4 and Task 11 Step 2 note where a flag/path may need adjusting — these are explicit "confirm the convention in the file" instructions, not TBDs.
