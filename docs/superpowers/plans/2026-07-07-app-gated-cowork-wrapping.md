# App-Gated Cowork Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop force-wrapping every local terminal into tmux; only user-chosen terminal apps auto-wrap for remote access, so all other terminals stay native (fixing the tmux select/copy bug).

**Architecture:** Add a `coworkTerminals` allowlist to agent config. A new `terminal-detect.ts` enumerates installed terminal apps and identifies the current one. A new `cowork.ts` holds the pure shell-wrapper logic — `renderCoworkBlock(tokens)` regenerates an app-gated tmux wrapper whose `case` only matches the allowlisted `TERM_PROGRAM` tokens — plus block install/remove and tmux package-manager selection. `setup-cowork` in `cli.ts` is rewired to detect terminals, offer a checklist, offer to install tmux, and write the gated block. Terminals in non-selected apps never enter tmux, so they get native OS selection and scrolling.

**Tech Stack:** TypeScript (CommonJS, `tsc`), Node.js `node:test`, commander, tmux, POSIX `sh`.

## Global Constraints

- All code lives in `packages/devdash-agent` (TypeScript). Run every command from that directory unless noted.
- Build: `npm run build --prefix packages/devdash-agent` (runs `tsc`). Tests: `npm test --prefix packages/devdash-agent` (runs `tsc` then `node --test`; **10 tests currently pass** — the suite must stay green). Web app typecheck (from repo root): `npx tsc --noEmit`.
- Test files live in `packages/devdash-agent/test/` as plain `node:test` files (`.test.js` / `.test.cjs`) that `require('../dist/<module>')` — they run against **compiled output**, so a module must build before its test runs (`npm test` builds first).
- `cli.ts` calls `program.parse()` at module load, so it **cannot** be `require`d in a test. All unit-testable logic goes in `terminal-detect.ts` and `cowork.ts`; `cli.ts` only does I/O and prompting.
- **Do NOT re-add tmux `pane-scrollbars`** — it wedged tmux at 100% CPU with multiple clients (see the NOTE at `src/pty-manager.ts` and the verbatim wrap body). `mouse on` and no pane-scrollbars are already shipped; keep them exactly.
- The verbatim tmux wrap body (session naming, `@devdash_*` / `@term_program` stamps, `mouse on`, `set-clipboard`, `status on`, `history-limit 50000`, `escape-time 10`, `allow-passthrough on`, `focus-events on`, RGB feature, `MouseDown3*` unbinds, `exec tmux new-session -A`) is carried over **unchanged** from the current `COWORK_BLOCK` at `src/cli.ts:714-736`.
- Shell-token injection is sanitized: only tokens matching `^[A-Za-z0-9._-]+$` may reach the shell `case`; anything else is dropped (rc-file injection defense).
- Browser-originated "New Terminal" sessions (`pty-manager.ts openSession({coworkWrap})`) are a **non-goal** — do not touch `pty-manager.ts`.
- The final npm-published version is a **minor** bump: `2.0.4` → `2.1.0`.

---

### Task 1: Add `coworkTerminals` allowlist to agent config

**Files:**
- Modify: `packages/devdash-agent/src/config.ts:13-24` (the `AgentConfig` interface)

**Interfaces:**
- Consumes: nothing.
- Produces: `AgentConfig.coworkTerminals?: string[]` — canonical terminal-app tokens whose shells auto-wrap into tmux. Read/written by `cli.ts` `setup-cowork` (Task 4).

This is a type-only field addition; its correctness is verified by the compiler and by later tasks that read/write it. No standalone runtime test.

- [ ] **Step 1: Add the field to `AgentConfig`**

In `packages/devdash-agent/src/config.ts`, inside the `AgentConfig` interface, add the field directly after the existing `cowork?: boolean;` line:

```ts
  cowork?: boolean; // wrap browser shells in tmux + enumerate sessions
  /** Terminal-app tokens whose shells auto-wrap into tmux for remote access. */
  coworkTerminals?: string[];
```

- [ ] **Step 2: Build to verify the type compiles**

Run: `npm run build --prefix packages/devdash-agent`
Expected: exit 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/devdash-agent/src/config.ts
git commit -m "feat(agent): add coworkTerminals allowlist to AgentConfig"
```

---

### Task 2: Terminal detection module (`terminal-detect.ts`)

**Files:**
- Create: `packages/devdash-agent/src/terminal-detect.ts`
- Test: `packages/devdash-agent/test/terminal-detect.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface KnownTerminal { name: string; token: string; appBundles: string[]; installed: boolean; current: boolean; }`
  - `function currentTerminalToken(env?: NodeJS.ProcessEnv): string` — canonical token for the terminal setup runs in, or `""` if unknown / inside tmux.
  - `interface DetectDeps { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; appExists?: (bundle: string) => boolean; hasCommand?: (bin: string) => boolean; }`
  - `function detectTerminals(deps?: DetectDeps): KnownTerminal[]` — one row per known terminal (installed/current flags set) plus a synthetic always-include row for an unknown current terminal.

- [ ] **Step 1: Write the failing test**

Create `packages/devdash-agent/test/terminal-detect.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { detectTerminals, currentTerminalToken } = require('../dist/terminal-detect');

// --- currentTerminalToken ---

test('currentTerminalToken reads TERM_PROGRAM', () => {
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'Hyper' }), 'Hyper');
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'iTerm.app' }), 'iTerm.app');
});

test('currentTerminalToken falls back to marker env when TERM_PROGRAM empty', () => {
  assert.strictEqual(currentTerminalToken({ KITTY_WINDOW_ID: '3' }), 'kitty');
  assert.strictEqual(currentTerminalToken({ ALACRITTY_WINDOW_ID: '1' }), 'alacritty');
  assert.strictEqual(currentTerminalToken({ WEZTERM_PANE: '0' }), 'WezTerm');
});

test('currentTerminalToken returns "" inside tmux', () => {
  assert.strictEqual(currentTerminalToken({ TERM_PROGRAM: 'tmux' }), '');
  assert.strictEqual(currentTerminalToken({ TMUX: '/tmp/tmux-501/default,123,0', TERM_PROGRAM: 'Hyper' }), '');
});

test('currentTerminalToken returns "" when nothing is known', () => {
  assert.strictEqual(currentTerminalToken({}), '');
});

// --- detectTerminals ---

test('detectTerminals flags an installed macOS bundle', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: {},
    appExists: (b) => b === 'iTerm.app',
  });
  const iterm = rows.find((r) => r.token === 'iTerm.app');
  assert.ok(iterm, 'iTerm row present');
  assert.strictEqual(iterm.installed, true);
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.installed, false);
});

test('detectTerminals marks the current terminal', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: { TERM_PROGRAM: 'Hyper' },
    appExists: () => true,
  });
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.current, true);
  const iterm = rows.find((r) => r.token === 'iTerm.app');
  assert.strictEqual(iterm.current, false);
});

test('detectTerminals appends a synthetic row for an unknown current terminal', () => {
  const rows = detectTerminals({
    platform: 'darwin',
    env: { TERM_PROGRAM: 'WarpTerminalXYZ' },
    appExists: () => false,
  });
  const synth = rows.find((r) => r.token === 'WarpTerminalXYZ');
  assert.ok(synth, 'synthetic row present');
  assert.strictEqual(synth.installed, true);
  assert.strictEqual(synth.current, true);
  assert.strictEqual(synth.name, 'WarpTerminalXYZ');
});

test('detectTerminals uses hasCommand on linux', () => {
  const rows = detectTerminals({
    platform: 'linux',
    env: {},
    hasCommand: (bin) => bin === 'kitty',
  });
  const kitty = rows.find((r) => r.token === 'kitty');
  assert.strictEqual(kitty.installed, true);
  const hyper = rows.find((r) => r.token === 'Hyper');
  assert.strictEqual(hyper.installed, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -A3 terminal-detect`
Expected: FAIL — `Cannot find module '../dist/terminal-detect'` (module not built yet).

- [ ] **Step 3: Write the module**

Create `packages/devdash-agent/src/terminal-detect.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

export interface KnownTerminal {
  /** Display name for the checklist, e.g. "iTerm". */
  name: string;
  /** Canonical token stored in config and matched at runtime. */
  token: string;
  /** macOS .app bundle basenames that indicate it is installed. */
  appBundles: string[];
  /** true when the app bundle is present on disk (or launcher present on Linux). */
  installed: boolean;
  /** true when this is the terminal setup is currently running in. */
  current: boolean;
}

interface KnownEntry {
  name: string;
  token: string;
  appBundles: string[];
  /** Linux launcher binaries checked via `command -v` (best-effort). */
  linuxBins: string[];
}

// token = TERM_PROGRAM value unless noted; runtime marker fallbacks handled in
// currentTerminalToken(). Order here is the checklist's base order.
const KNOWN_TERMINALS: KnownEntry[] = [
  { name: 'Hyper',          token: 'Hyper',          appBundles: ['Hyper.app'],                              linuxBins: ['hyper'] },
  { name: 'iTerm',          token: 'iTerm.app',      appBundles: ['iTerm.app'],                              linuxBins: [] },
  { name: 'Apple Terminal', token: 'Apple_Terminal', appBundles: ['Terminal.app'],                           linuxBins: [] },
  { name: 'VS Code',        token: 'vscode',         appBundles: ['Visual Studio Code.app', 'Code.app'],     linuxBins: ['code'] },
  { name: 'Ghostty',        token: 'ghostty',        appBundles: ['Ghostty.app'],                            linuxBins: ['ghostty'] },
  { name: 'WezTerm',        token: 'WezTerm',        appBundles: ['WezTerm.app'],                            linuxBins: ['wezterm'] },
  { name: 'Kitty',          token: 'kitty',          appBundles: ['kitty.app'],                              linuxBins: ['kitty'] },
  { name: 'Alacritty',      token: 'alacritty',      appBundles: ['Alacritty.app'],                          linuxBins: ['alacritty'] },
  { name: 'GNOME Terminal', token: 'gnome-terminal', appBundles: [],                                         linuxBins: ['gnome-terminal'] },
  { name: 'Konsole',        token: 'konsole',        appBundles: [],                                         linuxBins: ['konsole'] },
];

export interface DetectDeps {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** macOS: true when the given .app bundle exists in a standard location. */
  appExists?: (bundle: string) => boolean;
  /** Linux: true when the given launcher binary is on PATH. */
  hasCommand?: (bin: string) => boolean;
}

const APP_DIRS = [
  '/Applications',
  path.join(os.homedir(), 'Applications'),
  '/System/Applications',
  '/System/Applications/Utilities',
];

function defaultAppExists(bundle: string): boolean {
  for (const dir of APP_DIRS) {
    try {
      if (fs.existsSync(path.join(dir, bundle))) return true;
    } catch {
      /* FS error → treat as not present, keep checking */
    }
  }
  return false;
}

function defaultHasCommand(bin: string): boolean {
  try {
    execFileSync('command', ['-v', bin], { stdio: 'pipe', shell: '/bin/sh' });
    return true;
  } catch {
    return false;
  }
}

/** Canonical token for the terminal setup is running in, or "" if unknown. */
export function currentTerminalToken(env: NodeJS.ProcessEnv = process.env): string {
  // Inside tmux the real outer app is unknowable → report unknown.
  if (env.TMUX || env.TERM_PROGRAM === 'tmux') return '';
  let tp = env.TERM_PROGRAM || '';
  if (!tp) {
    if (env.KITTY_WINDOW_ID) tp = 'kitty';
    else if (env.ALACRITTY_WINDOW_ID) tp = 'alacritty';
    else if (env.WEZTERM_PANE) tp = 'WezTerm';
  }
  return tp;
}

export function detectTerminals(deps: DetectDeps = {}): KnownTerminal[] {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const appExists = deps.appExists ?? defaultAppExists;
  const hasCommand = deps.hasCommand ?? defaultHasCommand;
  const currentToken = currentTerminalToken(env);

  const rows: KnownTerminal[] = KNOWN_TERMINALS.map((e) => {
    const installed = platform === 'darwin'
      ? e.appBundles.some(appExists)
      : e.linuxBins.some(hasCommand);
    return {
      name: e.name,
      token: e.token,
      appBundles: e.appBundles,
      installed,
      current: currentToken !== '' && e.token === currentToken,
    };
  });

  // Always-include rule: current terminal isn't in the known table → append it
  // so the user can always pick "this terminal."
  if (currentToken !== '' && !rows.some((r) => r.token === currentToken)) {
    rows.push({
      name: currentToken,
      token: currentToken,
      appBundles: [],
      installed: true,
      current: true,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: all tests pass, `# fail 0`, total count is now `10 + 7 = 17`.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/terminal-detect.ts packages/devdash-agent/test/terminal-detect.test.js
git commit -m "feat(agent): terminal-detect module — enumerate apps, identify current terminal"
```

---

### Task 3: App-gated cowork block + tmux install selection (`cowork.ts`)

**Files:**
- Create: `packages/devdash-agent/src/cowork.ts`
- Test: `packages/devdash-agent/test/cowork.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const COWORK_BEGIN: string`, `const COWORK_END: string` (marker lines).
  - `function sanitizeTokens(tokens: string[]): string[]` — keep only `^[A-Za-z0-9._-]+$`, dedup, preserve order.
  - `function renderMatchGate(tokens: string[]): string` — the `_dd_tp` resolution + `case` that sets `_dd_match` (column-0, testable in isolation).
  - `function renderCoworkBlock(tokens: string[]): string` — the full marker-delimited rc block, app-gated by `tokens`.
  - `function removeCoworkBlock(content: string): string` — strip the marker block from rc-file content.
  - `function installCoworkBlock(rcPath: string, tokens: string[]): 'installed' | 'updated' | 'created'` — write the gated block into an rc file.
  - `interface TmuxInstall { command: string; canAuto: boolean; manual?: string; }`
  - `function pickTmuxInstall(platform: NodeJS.Platform, hasCommand: (bin: string) => boolean): TmuxInstall` — choose the install command per package manager.

- [ ] **Step 1: Write the failing test**

Create `packages/devdash-agent/test/cowork.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const {
  sanitizeTokens, renderMatchGate, renderCoworkBlock,
  removeCoworkBlock, pickTmuxInstall, COWORK_BEGIN, COWORK_END,
} = require('../dist/cowork');

// --- sanitizeTokens ---

test('sanitizeTokens keeps legal tokens and dedups', () => {
  assert.deepStrictEqual(
    sanitizeTokens(['Hyper', 'iTerm.app', 'Hyper', 'Apple_Terminal']),
    ['Hyper', 'iTerm.app', 'Apple_Terminal']
  );
});

test('sanitizeTokens drops tokens with illegal characters', () => {
  assert.deepStrictEqual(
    sanitizeTokens(['Hyper', 'foo; rm -rf ~', 'a b', '$(x)', 'ok-1']),
    ['Hyper', 'ok-1']
  );
});

// --- renderMatchGate under sh -c (the runtime match decision) ---

function runGate(tokens, env) {
  const gate = renderMatchGate(tokens);
  const script = `${gate}\n[ -n "$_dd_match" ] && echo WRAP || echo NATIVE`;
  return execFileSync('sh', ['-c', script], {
    env: { PATH: process.env.PATH, ...env },
  }).toString().trim();
}

test('renderMatchGate WRAPs a matching TERM_PROGRAM', () => {
  assert.strictEqual(runGate(['Hyper', 'iTerm.app'], { TERM_PROGRAM: 'Hyper' }), 'WRAP');
  assert.strictEqual(runGate(['Hyper', 'iTerm.app'], { TERM_PROGRAM: 'iTerm.app' }), 'WRAP');
});

test('renderMatchGate leaves a non-listed TERM_PROGRAM NATIVE', () => {
  assert.strictEqual(runGate(['Hyper'], { TERM_PROGRAM: 'Apple_Terminal' }), 'NATIVE');
  assert.strictEqual(runGate(['Hyper'], { TERM_PROGRAM: 'vscode' }), 'NATIVE');
});

test('renderMatchGate resolves marker envs (kitty/alacritty/wezterm)', () => {
  assert.strictEqual(runGate(['kitty'], { KITTY_WINDOW_ID: '2' }), 'WRAP');
  assert.strictEqual(runGate(['alacritty'], { ALACRITTY_WINDOW_ID: '1' }), 'WRAP');
  assert.strictEqual(runGate(['WezTerm'], { WEZTERM_PANE: '0' }), 'WRAP');
});

test('renderMatchGate with an empty allowlist never WRAPs', () => {
  assert.strictEqual(runGate([], { TERM_PROGRAM: 'Hyper' }), 'NATIVE');
});

// --- renderCoworkBlock ---

test('renderCoworkBlock injects a case arm for each token', () => {
  const block = renderCoworkBlock(['Hyper', 'iTerm.app']);
  assert.ok(block.startsWith(COWORK_BEGIN));
  assert.ok(block.trimEnd().endsWith(COWORK_END));
  assert.match(block, /Hyper\|iTerm\.app\) _dd_match=1 ;;/);
  assert.match(block, /exec tmux new-session -A -s/);
  // The pane-scrollbars footgun must never reappear.
  assert.doesNotMatch(block, /pane-scrollbars/);
});

test('renderCoworkBlock with empty tokens has a no-op case arm', () => {
  const block = renderCoworkBlock([]);
  assert.match(block, /\*\) ;;/);
  assert.doesNotMatch(block, /_dd_match=1/);
});

test('renderCoworkBlock drops illegal tokens before injection', () => {
  const block = renderCoworkBlock(['Hyper', 'evil; rm -rf ~']);
  assert.doesNotMatch(block, /rm -rf/);
  assert.match(block, /Hyper\) _dd_match=1 ;;/);
});

// --- removeCoworkBlock ---

test('removeCoworkBlock strips the marker block and leaves other content', () => {
  const rc = `export FOO=1\n\n${renderCoworkBlock(['Hyper'])}\n\nexport BAR=2\n`;
  const out = removeCoworkBlock(rc);
  assert.doesNotMatch(out, /devdash cowork wrapper/);
  assert.match(out, /export FOO=1/);
  assert.match(out, /export BAR=2/);
});

test('removeCoworkBlock is a no-op when no block present', () => {
  assert.strictEqual(removeCoworkBlock('export FOO=1\n'), 'export FOO=1\n');
});

// --- pickTmuxInstall ---

test('pickTmuxInstall picks brew on macOS when present', () => {
  const r = pickTmuxInstall('darwin', (b) => b === 'brew');
  assert.strictEqual(r.command, 'brew install tmux');
  assert.strictEqual(r.canAuto, true);
});

test('pickTmuxInstall gives manual steps on macOS without brew', () => {
  const r = pickTmuxInstall('darwin', () => false);
  assert.strictEqual(r.canAuto, false);
  assert.match(r.manual, /Homebrew/);
});

test('pickTmuxInstall picks the first present linux package manager', () => {
  const r = pickTmuxInstall('linux', (b) => b === 'dnf');
  assert.strictEqual(r.command, 'sudo dnf install -y tmux');
  assert.strictEqual(r.canAuto, true);
});

test('pickTmuxInstall gives manual steps on linux without a package manager', () => {
  const r = pickTmuxInstall('linux', () => false);
  assert.strictEqual(r.canAuto, false);
  assert.ok(r.manual && r.manual.length > 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -A3 cowork.test`
Expected: FAIL — `Cannot find module '../dist/cowork'`.

- [ ] **Step 3: Write the module**

Create `packages/devdash-agent/src/cowork.ts`. The wrap body inside `if [ -n "$_dd_match" ]` is copied verbatim from the current `src/cli.ts:714-736`:

```ts
import * as fs from 'fs';

export const COWORK_BEGIN = '# >>> devdash cowork wrapper >>>';
export const COWORK_END = '# <<< devdash cowork wrapper <<<';

// Only tokens matching this may reach the shell `case` — rc-file injection
// defense. TERM_PROGRAM values and our marker tokens are all within this set.
const TOKEN_RE = /^[A-Za-z0-9._-]+$/;

export function sanitizeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (TOKEN_RE.test(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// The _dd_tp resolution + case that sets _dd_match. Column-0 so it can be
// unit-tested under `sh -c` in isolation; renderCoworkBlock indents it.
export function renderMatchGate(tokens: string[]): string {
  const clean = sanitizeTokens(tokens);
  const arm = clean.length > 0
    ? `${clean.join('|')}) _dd_match=1 ;;`
    : '*) ;;';
  return `_dd_tp="\${TERM_PROGRAM:-}"
[ -n "$KITTY_WINDOW_ID" ] && _dd_tp="kitty"
[ -n "$ALACRITTY_WINDOW_ID" ] && _dd_tp="alacritty"
[ -n "$WEZTERM_PANE" ] && _dd_tp="WezTerm"
_dd_match=""
case "$_dd_tp" in
  ${arm}
esac`;
}

// The verbatim tmux wrap body (carried over from the pre-gating COWORK_BLOCK).
// Do NOT add pane-scrollbars here — it wedges tmux at 100% CPU.
const WRAP_BODY = `_dd_base=$(basename "$PWD" 2>/dev/null | LC_ALL=C tr -cd 'a-zA-Z0-9_-' | cut -c1-20)
[ -n "$_dd_base" ] || _dd_base=shell
_dd_name="\${_dd_base}-$(( \${RANDOM:-$$} % 9000 + 1000 ))"
if tmux new-session -d -s "$_dd_name" 2>/dev/null; then
  tmux set-option -t "$_dd_name" @term_program "\${TERM_PROGRAM:-\${TERMINAL_EMULATOR:-unknown}}" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_origin native 2>/dev/null
  tmux set-window-option -t "$_dd_name" window-size latest 2>/dev/null
  tmux set-window-option -t "$_dd_name" aggressive-resize on 2>/dev/null
  tmux set-option -g mouse on 2>/dev/null
  tmux set-option -s set-clipboard on 2>/dev/null
  tmux set-option -g status on 2>/dev/null
  tmux set-option -g history-limit 50000 2>/dev/null
  tmux set-option -sg escape-time 10 2>/dev/null
  tmux set-option -g allow-passthrough on 2>/dev/null
  tmux set-option -g focus-events on 2>/dev/null
  tmux show-options -g terminal-features 2>/dev/null | grep -q RGB || tmux set-option -sa terminal-features "*:RGB" 2>/dev/null
  tmux unbind-key -n MouseDown3Pane 2>/dev/null
  tmux unbind-key -n MouseDown3Status 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_folder "$(basename "$PWD" 2>/dev/null)" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_folder_path "$PWD" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_created "$(date +%Y-%m-%dT%H:%M:%S)" 2>/dev/null
  tmux set-option -t "$_dd_name" @devdash_git "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" 2>/dev/null
  exec tmux new-session -A -s "$_dd_name"
fi
unset _dd_base _dd_name`;

function indent(text: string, pad: string): string {
  return text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
}

// Regenerate the full app-gated rc block from the allowlist. An empty (or
// fully-sanitized-away) list yields a block that never wraps.
export function renderCoworkBlock(tokens: string[]): string {
  const gate = indent(renderMatchGate(tokens), '      ');
  const body = indent(WRAP_BODY, '        ');
  return `${COWORK_BEGIN}
# Managed by "devdash-agent setup-cowork" — do not edit inside the markers.
case $- in
  *i*)
    if [ -z "$TMUX" ] && [ -z "$DEVDASH_NO_WRAP" ] && [ -z "$SSH_TTY" ] && [ -t 1 ] \\
       && command -v tmux >/dev/null 2>&1; then
${gate}
      if [ -n "$_dd_match" ]; then
${body}
      fi
      unset _dd_tp _dd_match
    fi
  ;;
esac
${COWORK_END}`;
}

export function removeCoworkBlock(content: string): string {
  const begin = content.indexOf(COWORK_BEGIN);
  if (begin === -1) return content;
  const end = content.indexOf(COWORK_END);
  if (end === -1 || end < begin) return content;
  return (content.slice(0, begin) + content.slice(end + COWORK_END.length))
    .replace(/\n{3,}$/g, '\n\n');
}

export function installCoworkBlock(
  rcPath: string,
  tokens: string[]
): 'installed' | 'updated' | 'created' {
  const existed = fs.existsSync(rcPath);
  const content = existed ? fs.readFileSync(rcPath, 'utf-8') : '';
  const had = content.includes(COWORK_BEGIN);
  const cleaned = removeCoworkBlock(content);
  const next = cleaned.replace(/\n*$/, '\n\n') + renderCoworkBlock(tokens) + '\n';
  fs.writeFileSync(rcPath, next);
  return had ? 'updated' : existed ? 'installed' : 'created';
}

export interface TmuxInstall {
  /** Exact shell command to install tmux, or '' when only manual steps apply. */
  command: string;
  /** true when the command can be run automatically (package manager present). */
  canAuto: boolean;
  /** Manual instructions when canAuto is false. */
  manual?: string;
}

// Linux package managers in preference order → install command.
const LINUX_MANAGERS: Array<{ bin: string; command: string }> = [
  { bin: 'apt-get', command: 'sudo apt-get install -y tmux' },
  { bin: 'dnf',     command: 'sudo dnf install -y tmux' },
  { bin: 'yum',     command: 'sudo yum install -y tmux' },
  { bin: 'pacman',  command: 'sudo pacman -S --noconfirm tmux' },
  { bin: 'zypper',  command: 'sudo zypper install -y tmux' },
];

export function pickTmuxInstall(
  platform: NodeJS.Platform,
  hasCommand: (bin: string) => boolean
): TmuxInstall {
  if (platform === 'darwin') {
    if (hasCommand('brew')) return { command: 'brew install tmux', canAuto: true };
    return {
      command: '',
      canAuto: false,
      manual: 'Homebrew is not installed. Install it from https://brew.sh then run: brew install tmux',
    };
  }
  for (const m of LINUX_MANAGERS) {
    if (hasCommand(m.bin)) return { command: m.command, canAuto: true };
  }
  return {
    command: '',
    canAuto: false,
    manual: 'No supported package manager found. Install tmux with your distro\'s package manager (apt/dnf/yum/pacman/zypper).',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: all pass, `# fail 0`. Total is now `17 + 18 = 35`.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-agent/src/cowork.ts packages/devdash-agent/test/cowork.test.js
git commit -m "feat(agent): cowork.ts — app-gated wrapper block, sanitization, tmux install selection"
```

---

### Task 4: Rewire `setup-cowork` to the app-gated flow

**Files:**
- Modify: `packages/devdash-agent/src/cli.ts` — remove the inline `COWORK_BEGIN`/`COWORK_END`/`COWORK_BLOCK`/`removeCoworkBlock`/`installCoworkBlock` (lines ~702-761) and the `setup-cowork` `.command(...).action(...)` (lines ~763-853); replace with imports from the new modules and the rewritten flow.

**Interfaces:**
- Consumes:
  - From `./cowork`: `renderCoworkBlock`, `removeCoworkBlock`, `installCoworkBlock`, `pickTmuxInstall`, `sanitizeTokens`, `COWORK_BEGIN`.
  - From `./terminal-detect`: `detectTerminals`, `currentTerminalToken`, `KnownTerminal`.
  - From `./config`: existing `loadConfig`, `saveConfig`, and the new `AgentConfig.coworkTerminals` (Task 1).
  - Existing helpers in `cli.ts`: `createRL`, `ask`.
- Produces: the rewired `setup-cowork` command (no new exported symbols; `cli.ts` is not imported by tests).

This task has no unit test (`cli.ts` runs `program.parse()` on import and cannot be required). Its verification is: the suite still builds+passes, `--help` renders, and a scripted end-to-end run of the compiled CLI against a temp `$HOME` writes a correctly gated block. The behavioral proof of the select/copy fix is Task 5.

- [ ] **Step 1: Replace the inline block + helpers with imports**

In `packages/devdash-agent/src/cli.ts`, add to the import block near the top (after the existing `./config` import at line 8):

```ts
import { renderCoworkBlock, removeCoworkBlock, installCoworkBlock, pickTmuxInstall, sanitizeTokens, COWORK_BEGIN } from './cowork';
import { detectTerminals, currentTerminalToken, KnownTerminal } from './terminal-detect';
```

Then delete the entire inline section from `const COWORK_BEGIN = ...` (line ~702) through the end of the `installCoworkBlock` function (line ~761) — that logic now lives in `./cowork`. Keep the `// --- setup-cowork ---` comment header.

- [ ] **Step 2: Rewrite the `setup-cowork` command**

Replace the existing `program.command('setup-cowork')...action(...)` block (lines ~763-853) with:

```ts
program
  .command('setup-cowork')
  .description('Choose which terminal app(s) auto-wrap into tmux for DevDash remote access')
  .option('--remove', 'Uninstall the wrapper, clear the allowlist, and go fully native')
  .option('--terminals <csv>', 'Non-interactive: comma-separated terminal tokens to allow')
  .option('--yes', 'Auto-confirm installing tmux if it is missing')
  .option('--adopt-all', 'Adopt all existing tmux sessions non-interactively')
  .option('--no-adopt', 'Skip adopting existing sessions')
  .action(async (opts: { remove?: boolean; terminals?: string; yes?: boolean; adoptAll?: boolean; adopt?: boolean }) => {
    const { tmuxAvailable, listSessions } = require('./tmux-manager') as typeof import('./tmux-manager');
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const config = loadConfig();
    const rcFiles = [path.join(os.homedir(), '.zshrc'), path.join(os.homedir(), '.bashrc')];

    const hasCommand = (bin: string): boolean => {
      try { execFileSync('command', ['-v', bin], { stdio: 'pipe', shell: '/bin/sh' }); return true; }
      catch { return false; }
    };

    // --remove: strip the block, clear the allowlist, go native.
    if (opts.remove) {
      for (const rc of rcFiles) {
        if (!fs.existsSync(rc)) continue;
        fs.writeFileSync(rc, removeCoworkBlock(fs.readFileSync(rc, 'utf-8')));
        console.log(`  removed wrapper from ${rc}`);
      }
      config.cowork = false;
      config.coworkTerminals = [];
      saveConfig(config);
      console.log('Reverted to native terminals. Open terminals are unaffected; new shells start normally.');
      return;
    }

    // tmux check → offer to install.
    if (!(await tmuxAvailable())) {
      const plan = pickTmuxInstall(process.platform, hasCommand);
      if (!plan.canAuto) {
        console.log('\x1b[33mtmux is not installed.\x1b[0m');
        console.log(`  ${plan.manual}`);
        process.exitCode = 1;
        return;
      }
      console.log('\x1b[33mtmux is not installed.\x1b[0m It will be installed with:');
      console.log(`  ${plan.command}`);
      let go = opts.yes === true;
      if (!go) {
        const rl = createRL();
        const ans = (await ask(rl, 'Run this now? [y/N]: ')).trim().toLowerCase();
        rl.close();
        go = ans === 'y' || ans === 'yes';
      }
      if (!go) {
        console.log(`Declined. Install tmux manually (${plan.command}) then re-run: devdash-agent setup-cowork`);
        process.exitCode = 1;
        return;
      }
      try {
        execFileSync('/bin/sh', ['-c', plan.command], { stdio: 'inherit' });
      } catch {
        console.log('\x1b[31mtmux install failed.\x1b[0m Install it manually then re-run setup-cowork.');
        process.exitCode = 1;
        return;
      }
      if (!(await tmuxAvailable())) {
        console.log('\x1b[31mtmux still not found after install.\x1b[0m Install it manually then re-run setup-cowork.');
        process.exitCode = 1;
        return;
      }
    }

    // Terminal selection.
    let selected: string[];
    if (typeof opts.terminals === 'string') {
      selected = sanitizeTokens(opts.terminals.split(',').map((t) => t.trim()).filter(Boolean));
    } else {
      const detected = detectTerminals();
      // installed apps first, then the rest; current terminal marked.
      const ordered = [...detected].sort((a, b) => Number(b.installed) - Number(a.installed));
      const preTicked = new Set<string>([
        ...ordered.filter((t) => t.current).map((t) => t.token),
        ...(config.coworkTerminals ?? []),
      ]);
      const ticks = ordered.map((t) => preTicked.has(t.token));
      console.log('');
      console.log('Which terminal app(s) should be exposed to DevDash remote (auto-wrap into tmux)?');
      console.log('All other terminals stay native (full OS text selection + scrolling).');
      console.log('');
      const render = () => ordered.forEach((t, i) => {
        const box = ticks[i] ? '[x]' : '[ ]';
        const tags = [t.installed ? '' : 'not installed', t.current ? 'this terminal' : ''].filter(Boolean).join(', ');
        console.log(`  ${i + 1}) ${box} ${t.name}${tags ? `  (${tags})` : ''}`);
      });
      render();
      const rl = createRL();
      const ans = (await ask(rl, '\nToggle by number (space/comma separated), Enter to confirm: ')).trim();
      rl.close();
      for (const tok of ans.split(/[, ]+/).filter(Boolean)) {
        const idx = parseInt(tok, 10) - 1;
        if (idx >= 0 && idx < ticks.length) ticks[idx] = !ticks[idx];
      }
      selected = sanitizeTokens(ordered.filter((_, i) => ticks[i]).map((t) => t.token));
    }

    // Adopt existing tmux sessions (unchanged behavior).
    const all = await listSessions();
    const orphans = all.filter((s) => s.origin !== 'browser' && !s.folder);
    if (orphans.length > 0 && opts.adopt !== false) {
      console.log('');
      console.log(`Found ${orphans.length} existing tmux session(s) not managed by DevDash:`);
      orphans.forEach((s, i) => console.log(`  ${i + 1}) ${s.name}  (${s.termProgram})`));
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

    // Persist the allowlist and write / remove the block.
    config.coworkTerminals = selected;
    if (selected.length === 0) {
      for (const rc of rcFiles) {
        if (!fs.existsSync(rc)) continue;
        fs.writeFileSync(rc, removeCoworkBlock(fs.readFileSync(rc, 'utf-8')));
        console.log(`  removed wrapper from ${rc}`);
      }
      config.cowork = false;
      saveConfig(config);
      console.log('');
      console.log('No remote terminal selected — all terminals are native (OS selection + scrolling).');
      return;
    }

    const existing = rcFiles.filter((f) => fs.existsSync(f));
    const targets = existing.length > 0
      ? existing
      : [(process.env.SHELL || '').includes('bash') ? rcFiles[1] : rcFiles[0]];
    for (const rc of targets) {
      const result = installCoworkBlock(rc, selected);
      console.log(`  ${result}: wrapper in ${rc}`);
    }
    config.cowork = true;
    saveConfig(config);
    console.log('');
    console.log(`\x1b[32mCowork enabled.\x1b[0m Remote app(s): ${selected.join(', ')}`);
    console.log('These auto-wrap into tmux and appear in DevDash → Terminals.');
    console.log('Every other terminal stays native (OS text selection + native scrolling).');
    if (currentTerminalToken() === '') {
      console.log('\x1b[33mNote:\x1b[0m setup ran inside tmux, so "this terminal" could not be pre-ticked.');
      console.log('Re-run from a native terminal window if the checklist missed your app.');
    }
    console.log('Restart the agent to start reporting sessions: devdash-agent restart');
  });
```

- [ ] **Step 3: Build and run the full suite**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: build succeeds; `# fail 0`; total still 35 (no cli tests, but nothing broke).

- [ ] **Step 4: Smoke-test the compiled CLI against a temp HOME (non-interactive path)**

Run:
```bash
cd packages/devdash-agent && \
TMPHOME="$(mktemp -d)" && printf 'export EXISTING=1\n' > "$TMPHOME/.zshrc" && \
HOME="$TMPHOME" node dist/cli.js setup-cowork --terminals "Hyper,iTerm.app" --no-adopt && \
echo '--- .zshrc ---' && cat "$TMPHOME/.zshrc" && \
echo '--- config ---' && cat "$TMPHOME/.devdash-agent/config.json"
```
Expected: `.zshrc` keeps `export EXISTING=1` and gains a `# >>> devdash cowork wrapper >>>` block whose case arm reads `Hyper|iTerm.app) _dd_match=1 ;;`; `config.json` has `"cowork": true` and `"coworkTerminals": ["Hyper","iTerm.app"]`. (If tmux is not installed on the runner, the command exits before writing — install tmux first or run on a machine that has it.)

- [ ] **Step 5: Smoke-test the `--remove` and empty-selection paths**

Run:
```bash
cd packages/devdash-agent && \
HOME="$TMPHOME" node dist/cli.js setup-cowork --terminals "" --no-adopt && \
echo '--- after empty ---' && cat "$TMPHOME/.zshrc" && \
HOME="$TMPHOME" node dist/cli.js setup-cowork --remove && \
echo '--- config after remove ---' && cat "$TMPHOME/.devdash-agent/config.json"; \
rm -rf "$TMPHOME"
```
Expected: after empty selection the wrapper block is gone from `.zshrc` (but `export EXISTING=1` remains) and `coworkTerminals` is `[]`; after `--remove`, config shows `"cowork": false` and `"coworkTerminals": []`.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/cli.ts
git commit -m "feat(agent): rewire setup-cowork — app checklist, tmux install offer, gated block"
```

---

### Task 5: End-to-end select/copy verification (the central fix)

**Files:**
- Create: `packages/devdash-agent/docs/verify-select-copy.md` (a short, repeatable verification record; create the `docs/` dir if absent).

**Interfaces:**
- Consumes: the installed agent from Tasks 1-4 (built `dist/`), a real terminal environment, and DevDash → Terminals in the browser.
- Produces: a written verification record with observed results; no code.

Unit tests cannot confirm OS-level mouse selection. This task drives the real flow and records the outcome. It is the acceptance surface from the spec's Selection & Copy Matrix.

- [ ] **Step 1: Configure a single remote app and restart the agent**

Run (pick an app you have installed that is NOT the one you'll test native selection in — e.g. select `iTerm.app` and test native selection in Hyper, or vice-versa):
```bash
cd packages/devdash-agent && npm run build && \
node dist/cli.js setup-cowork --terminals "iTerm.app" --no-adopt
devdash-agent restart
```
Expected: config shows `coworkTerminals: ["iTerm.app"]`; the wrapper is installed in the rc file.

- [ ] **Step 2: Verify a NON-selected app is native (no tmux)**

Open a brand-new window in a non-selected terminal app (e.g. Hyper). In it, run:
```bash
echo "TMUX=[$TMUX]"
```
Expected: `TMUX=[]` (empty) — the shell did **not** wrap into tmux.

- [ ] **Step 3: Verify native OS selection persists and copies**

In that same non-selected-app window: print a line of text (`echo the quick brown fox`), then **drag with the mouse to select** part of it and **release the mouse button**.
Expected: the highlight **stays visible after release** (does not clear). Press Cmd+C (macOS) / Ctrl+Shift+C (Linux), then paste elsewhere.
Expected: the selected text is on the clipboard. This is the direct fix for "selection unselects as soon as I stop pressing the mouse." Record PASS/FAIL and the app used.

- [ ] **Step 4: Verify the SELECTED app wraps and appears in DevDash**

Open a new window in the selected app (iTerm). Run:
```bash
echo "TMUX=[$TMUX]"
```
Expected: `TMUX=[...]` is **non-empty** (inside tmux). Open DevDash → Terminals in the browser.
Expected: the new iTerm session is listed. Confirm remote selection works there: Shift+drag gives a native highlight, and on a mobile/web client OSC-52 copy still functions (already-shipped handler).

- [ ] **Step 5: Record results**

Write `packages/devdash-agent/docs/verify-select-copy.md` capturing: date, agent version, the selected app, the non-selected app tested, and PASS/FAIL for each of steps 2-4 (native `$TMUX` empty; highlight persists after release; Cmd/Ctrl+C copies; selected app wraps + appears in DevDash). If any step FAILs, stop and fix before Task 6 — do not proceed to publish.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/docs/verify-select-copy.md
git commit -m "docs(agent): record end-to-end select/copy verification for app-gated cowork"
```

---

### Task 6: Version bump, publish to npm, push to main

**Files:**
- Modify: `packages/devdash-agent/package.json` (version `2.0.4` → `2.1.0`).

**Interfaces:**
- Consumes: a fully green suite and a PASSing Task 5 verification.
- Produces: a published `devdash-agent@2.1.0` and pushed `main`.

- [ ] **Step 1: Final full verification (agent + web)**

Run:
```bash
cd /Volumes/SandeepSSD/www/tools/devdash && \
echo "=== agent build ===" && npm run build --prefix packages/devdash-agent 2>&1 | tail -2 && \
echo "=== agent tests ===" && npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (pass|fail|tests)' && \
echo "=== web tsc ===" && npx tsc --noEmit 2>&1 | head -3; echo "tsc exit=${PIPESTATUS[0]}" && \
echo "=== no scrollbar refs ===" && (grep -rn "pane-scrollbars\|pane_scrollbars" packages/devdash-agent/src || echo "none (good)")
```
Expected: agent build clean; `# fail 0`; web `tsc exit=0`; scrollbar check prints `none (good)`.

- [ ] **Step 2: Bump the version**

In `packages/devdash-agent/package.json`, change `"version": "2.0.4"` to `"version": "2.1.0"`.

Run: `node -p "require('./packages/devdash-agent/package.json').version"`
Expected: `2.1.0`.

- [ ] **Step 3: Commit the bump**

```bash
git add packages/devdash-agent/package.json
git commit -m "chore(agent): release 2.1.0 — app-gated cowork wrapping (native local terminals by default)"
```

- [ ] **Step 4: Publish to npm**

Run from `packages/devdash-agent`:
```bash
cd packages/devdash-agent && npm run build && npm publish
```
Expected: the agent published at the bumped version. Publishing is `npm run build` then `npm publish` to the public registry — confirm the version bump with the user before running.

Verify: `npm view devdash-agent version`
Expected: `2.1.0`.

- [ ] **Step 5: Push to main (GitLab CI auto-deploys the web app)**

```bash
git push origin main
```
Expected: push succeeds; GitLab CI pipeline starts.

- [ ] **Step 6: Tell the user to re-run setup**

Print a message instructing the user to run `devdash-agent setup-cowork` to pick their remote terminal app (from a native terminal window so "this terminal" pre-ticks), then `devdash-agent restart`.

---

## Notes on spec coverage

- **Goals / select-&-copy fix:** Tasks 3 (gated block never wraps non-selected apps) + 5 (e2e proof).
- **Selection & Copy Matrix acceptance:** Task 5 steps 2-4.
- **terminal-detect.ts:** Task 2 (`detectTerminals`, `currentTerminalToken`, always-include rule, marker fallbacks, Linux `command -v`).
- **config `coworkTerminals`:** Task 1.
- **renderCoworkBlock + sanitization + empty-list no-op:** Task 3.
- **Runtime match decision under `sh -c`:** Task 3 (`renderMatchGate` tests, sentinel WRAP/NATIVE, no tmux/exec).
- **Package-manager selection:** Task 3 (`pickTmuxInstall`).
- **setup-cowork flow (`--remove`, tmux install offer, `--terminals`, `--yes`, checklist, adopt, summary, inside-tmux note):** Task 4.
- **Migration (marker block replaced atomically old→new):** covered by `installCoworkBlock` remove-then-write (Task 3) + re-run instructions (Task 6 step 6).
- **Rollout / minor version:** Task 6.
- **Non-goal `pty-manager.ts` untouched:** no task modifies it.
