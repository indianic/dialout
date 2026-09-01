# Arrow-Key Terminal Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the numbered-toggle `setup-cowork` checklist with an interactive arrow-key multi-select (↑/↓ move, Space toggle, a toggle-all, Enter confirm, Esc cancel), and stop auto-selecting the current terminal so users don't accidentally wrap their daily driver.

**Architecture:** A new pure `checklist.ts` module holds the selection state + rendering (fully unit-testable). `cli.ts` gains a thin raw-mode keypress driver that renders `checklist.ts` frames and, on a non-TTY stdin, falls back to the existing numbered prompt. The default checked-set changes: previously-selected tokens stay ticked, but the current terminal is NO longer pre-ticked.

**Tech Stack:** TypeScript (CommonJS, `tsc`), Node.js `node:test`, Node `readline` raw-mode keypress events (no new deps), commander.

## Global Constraints

- All code lives in `packages/devdash-agent`. Run commands from the repo root unless noted. Build: `npm run build --prefix packages/devdash-agent`. Tests: `npm test --prefix packages/devdash-agent` (runs `tsc` then `node --test`; **33 tests currently pass** — the suite must stay green).
- `dist/` is git-tracked and is exactly what npm ships (`package.json` `files:["dist"]`, `main:./dist/index.js`, NO prepublish build). Every `src` change MUST have its rebuilt `dist/` committed in the same commit.
- `cli.ts` calls `program.parse()` at module load → NOT requirable in tests. All unit-testable logic goes in `checklist.ts`; the raw-mode driver in `cli.ts` is verified by manual smoke + the non-TTY fallback path.
- Do NOT touch `src/pty-manager.ts`, `src/cowork.ts`, or `src/terminal-detect.ts` logic (only import from them).
- The interactive picker must NOT pre-check the current terminal. Pre-checked set = `new Set(config.coworkTerminals ?? [])` only. Rows are still ordered installed-first and the current terminal still shows a `this terminal` hint.
- Selected tokens must still pass through `sanitizeTokens` before reaching `installCoworkBlock`/config (unchanged injection defense).
- Legend text shown above the picker must state: *selected = wrapped in tmux for remote (Shift/Fn+drag to copy); unselected = fully native.*
- Existing flags unchanged: `--terminals <csv>`, `--yes`, `--remove`, `--adopt-all`, `--no-adopt`. `--terminals` and `--remove` must remain fully non-interactive.
- Final published version is a MINOR bump from the current `2.1.0` → `2.2.0`.

---

### Task 1: Pure checklist state + rendering module (`checklist.ts`)

**Files:**
- Create: `packages/devdash-agent/src/checklist.ts`
- Test: `packages/devdash-agent/test/checklist.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ChecklistItem { label: string; token: string; hint?: string; checked: boolean; }`
  - `interface ChecklistState { items: ChecklistItem[]; cursor: number; }`
  - `function clampCursor(len: number, cursor: number): number`
  - `function moveCursor(state: ChecklistState, delta: number): ChecklistState`
  - `function toggleAt(state: ChecklistState, index?: number): ChecklistState`
  - `function toggleAll(state: ChecklistState): ChecklistState`
  - `function selectedTokens(state: ChecklistState): string[]`
  - `function renderChecklist(state: ChecklistState): string`

- [ ] **Step 1: Write the failing test**

Create `packages/devdash-agent/test/checklist.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  clampCursor, moveCursor, toggleAt, toggleAll, selectedTokens, renderChecklist,
} = require('../dist/checklist');

function mk() {
  return {
    items: [
      { label: 'Hyper', token: 'Hyper', hint: 'this terminal', checked: false },
      { label: 'iTerm', token: 'iTerm.app', checked: false },
      { label: 'VS Code', token: 'vscode', hint: 'not installed', checked: true },
    ],
    cursor: 0,
  };
}

test('clampCursor bounds to [0, len-1] and handles empty', () => {
  assert.strictEqual(clampCursor(3, -1), 0);
  assert.strictEqual(clampCursor(3, 5), 2);
  assert.strictEqual(clampCursor(3, 1), 1);
  assert.strictEqual(clampCursor(0, 2), 0);
});

test('moveCursor clamps at both ends', () => {
  const s = mk();
  assert.strictEqual(moveCursor(s, -1).cursor, 0);
  assert.strictEqual(moveCursor(s, 1).cursor, 1);
  assert.strictEqual(moveCursor({ ...s, cursor: 2 }, 1).cursor, 2);
});

test('toggleAt flips the cursor row by default', () => {
  const s = mk();
  const t = toggleAt(s);
  assert.strictEqual(t.items[0].checked, true);
  assert.strictEqual(s.items[0].checked, false, 'original state not mutated');
});

test('toggleAt flips a specific index and no-ops out of range', () => {
  const s = mk();
  assert.strictEqual(toggleAt(s, 1).items[1].checked, true);
  assert.deepStrictEqual(toggleAt(s, 9).items, s.items);
});

test('toggleAll checks all when not all checked, else unchecks all', () => {
  const s = mk(); // mixed → all checked
  assert.ok(toggleAll(s).items.every((i) => i.checked));
  const allOn = { items: mk().items.map((i) => ({ ...i, checked: true })), cursor: 0 };
  assert.ok(toggleAll(allOn).items.every((i) => !i.checked));
});

test('selectedTokens returns checked tokens in order', () => {
  const s = { items: mk().items.map((i, idx) => ({ ...i, checked: idx !== 1 })), cursor: 0 };
  assert.deepStrictEqual(selectedTokens(s), ['Hyper', 'vscode']);
});

test('renderChecklist marks cursor row and check state and hints', () => {
  const s = { ...mk(), cursor: 1 };
  const lines = renderChecklist(s).split('\n');
  assert.match(lines[0], /^\s{2}\[ \] Hyper {2}\(this terminal\)$/);
  assert.match(lines[1], /^› \[ \] iTerm$/);
  assert.match(lines[2], /^\s{2}\[x\] VS Code {2}\(not installed\)$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -A3 checklist.test`
Expected: FAIL — `Cannot find module '../dist/checklist'`.

- [ ] **Step 3: Write the module**

Create `packages/devdash-agent/src/checklist.ts`:

```ts
// Pure state + rendering for the interactive terminal-app multi-select used by
// `setup-cowork`. All functions are immutable (return new state) so the
// raw-mode driver in cli.ts stays a thin keypress→state→redraw loop.

export interface ChecklistItem {
  /** Display name, e.g. "Hyper". */
  label: string;
  /** Canonical token stored in config and matched at runtime. */
  token: string;
  /** Optional parenthetical, e.g. "not installed" / "this terminal". */
  hint?: string;
  checked: boolean;
}

export interface ChecklistState {
  items: ChecklistItem[];
  cursor: number;
}

export function clampCursor(len: number, cursor: number): number {
  if (len <= 0) return 0;
  if (cursor < 0) return 0;
  if (cursor > len - 1) return len - 1;
  return cursor;
}

export function moveCursor(state: ChecklistState, delta: number): ChecklistState {
  return { ...state, cursor: clampCursor(state.items.length, state.cursor + delta) };
}

export function toggleAt(state: ChecklistState, index?: number): ChecklistState {
  const i = index ?? state.cursor;
  if (i < 0 || i >= state.items.length) return state;
  const items = state.items.map((it, idx) => (idx === i ? { ...it, checked: !it.checked } : it));
  return { ...state, items };
}

export function toggleAll(state: ChecklistState): ChecklistState {
  const allChecked = state.items.length > 0 && state.items.every((it) => it.checked);
  const items = state.items.map((it) => ({ ...it, checked: !allChecked }));
  return { ...state, items };
}

export function selectedTokens(state: ChecklistState): string[] {
  return state.items.filter((it) => it.checked).map((it) => it.token);
}

// One line per item: '› ' marks the cursor row (two spaces otherwise), then
// '[x]'/'[ ]', the label, and an optional '(hint)'.
export function renderChecklist(state: ChecklistState): string {
  return state.items
    .map((it, i) => {
      const pointer = i === state.cursor ? '›' : ' ';
      const box = it.checked ? '[x]' : '[ ]';
      const hint = it.hint ? `  (${it.hint})` : '';
      return `${pointer} ${box} ${it.label}${hint}`;
    })
    .join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: all pass, `# fail 0`, total `33 + 7 = 40`.

- [ ] **Step 5: Commit (src + test + rebuilt dist)**

```bash
cd /Volumes/SandeepSSD/www/tools/devdash
git add packages/devdash-agent/src/checklist.ts packages/devdash-agent/test/checklist.test.js packages/devdash-agent/dist/checklist.js packages/devdash-agent/dist/checklist.d.ts packages/devdash-agent/dist/checklist.js.map packages/devdash-agent/dist/checklist.d.ts.map
git commit -m "feat(agent): checklist.ts — pure state + rendering for arrow-key multi-select"
```

---

### Task 2: Raw-mode picker driver + wire into `setup-cowork`

**Files:**
- Modify: `packages/devdash-agent/src/cli.ts` — add a `promptChecklist` raw-mode driver; replace the interactive numbered-checklist block inside the `setup-cowork` action's `else` branch with a TTY→picker / non-TTY→numbered-fallback split; stop pre-ticking the current terminal.

**Interfaces:**
- Consumes: from `./checklist` — `ChecklistItem`, `moveCursor`, `toggleAt`, `toggleAll`, `selectedTokens`, `renderChecklist`. From `./terminal-detect` — `detectTerminals`. Existing `sanitizeTokens` from `./cowork`, and `createRL`/`ask` helpers.
- Produces: no new exported symbols (`cli.ts` is not imported by tests).

Verification is manual smoke + suite staying green (40 tests). `cli.ts` runs `program.parse()` on import so it cannot be unit-tested.

- [ ] **Step 1: Add the `promptChecklist` driver**

In `packages/devdash-agent/src/cli.ts`, add this function near the other helpers (after `ask`, around line 69). It assumes a TTY caller (the action guards with `process.stdin.isTTY`):

```ts
// Interactive arrow-key multi-select. Renders checklist.ts frames in raw mode.
// Returns the selected tokens, or null if the user cancels (Esc/q).
function promptChecklist(items: import('./checklist').ChecklistItem[]): Promise<string[] | null> {
  const { moveCursor, toggleAt, toggleAll, selectedTokens, renderChecklist } =
    require('./checklist') as typeof import('./checklist');
  const rl = require('readline') as typeof import('readline');

  let state = { items, cursor: 0 };
  const legend =
    '  \x1b[2m↑/↓ move · Space toggle · a all · Enter confirm · Esc cancel\x1b[0m\n' +
    '  \x1b[2mSelected = wrapped in tmux for remote (Shift/Fn+drag to copy). Unselected = fully native.\x1b[0m\n\n';

  rl.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let prevLines = 0;
  const draw = () => {
    const frame = renderChecklist(state);
    if (prevLines > 0) process.stdout.write(`\x1b[${prevLines}A`); // up N
    process.stdout.write('\x1b[0J'); // clear to end of screen
    process.stdout.write(frame + '\n');
    prevLines = frame.split('\n').length;
  };

  process.stdout.write(legend);
  draw();

  return new Promise<string[] | null>((resolve) => {
    const onKey = (_s: string, key: import('readline').Key | undefined) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') { cleanup(); process.exit(130); }
      if (key.name === 'up') state = moveCursor(state, -1);
      else if (key.name === 'down') state = moveCursor(state, 1);
      else if (key.name === 'space') state = toggleAt(state);
      else if (key.name === 'a') state = toggleAll(state);
      else if (key.name === 'return') return finish(selectedTokens(state));
      else if (key.name === 'escape' || key.name === 'q') return finish(null);
      else return;
      draw();
    };
    const cleanup = () => {
      process.stdin.off('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const finish = (result: string[] | null) => {
      cleanup();
      process.stdout.write('\n');
      resolve(result);
    };
    process.stdin.on('keypress', onKey);
  });
}
```

- [ ] **Step 2: Replace the interactive selection block and drop the current-terminal pre-tick**

Find the `else` branch of the terminal-selection block in the `setup-cowork` action (the branch that today builds `ordered`, `preTicked`, `ticks`, prints the numbered list, and asks "Toggle by number…"). Replace that entire `else { … }` body with:

```ts
    } else {
      const detected = detectTerminals();
      // installed apps first; current terminal is NOT pre-ticked (only prior picks are).
      const ordered = [...detected].sort((a, b) => Number(b.installed) - Number(a.installed));
      const prev = new Set<string>(config.coworkTerminals ?? []);
      console.log('');
      console.log('Which terminal app(s) should be exposed to DevDash remote (auto-wrap into tmux)?');
      console.log('All other terminals stay native (full OS text selection + scrolling).');

      if (process.stdin.isTTY) {
        const items = ordered.map((t) => ({
          label: t.name,
          token: t.token,
          hint: [t.installed ? '' : 'not installed', t.current ? 'this terminal' : ''].filter(Boolean).join(', ') || undefined,
          checked: prev.has(t.token),
        }));
        console.log('');
        const picked = await promptChecklist(items);
        if (picked === null) {
          console.log('Cancelled — no changes made.');
          return;
        }
        selected = sanitizeTokens(picked);
      } else {
        // Non-TTY (piped) fallback: numbered toggle prompt.
        const ticks = ordered.map((t) => prev.has(t.token));
        ordered.forEach((t, i) => {
          const box = ticks[i] ? '[x]' : '[ ]';
          const tags = [t.installed ? '' : 'not installed', t.current ? 'this terminal' : ''].filter(Boolean).join(', ');
          console.log(`  ${i + 1}) ${box} ${t.name}${tags ? `  (${tags})` : ''}`);
        });
        const rl = createRL();
        const ans = (await ask(rl, '\nToggle by number (space/comma separated), Enter to confirm: ')).trim();
        rl.close();
        for (const tok of ans.split(/[, ]+/).filter(Boolean)) {
          const idx = parseInt(tok, 10) - 1;
          if (idx >= 0 && idx < ticks.length) ticks[idx] = !ticks[idx];
        }
        selected = sanitizeTokens(ordered.filter((_, i) => ticks[i]).map((t) => t.token));
      }
    }
```

(Note: `selected` is already declared with `let selected: string[];` before the `if (typeof opts.terminals === 'string')` branch — reuse it; do not redeclare.)

- [ ] **Step 3: Build + run the suite**

Run: `npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (tests|pass|fail)|error TS'`
Expected: build clean; `# fail 0`; total 40.

- [ ] **Step 4: Manual smoke — interactive picker (TTY)**

Run in a real terminal (this needs a TTY; if the agent's harness has no TTY, report DONE_WITH_CONCERNS and hand this step to the controller):
```bash
cd packages/devdash-agent && node dist/cli.js setup-cowork --no-adopt
```
Drive it: press ↓ a couple times, Space to tick a row, `a` to toggle all, Space again, then Esc.
Expected: the cursor `›` moves; `[ ]`↔`[x]` toggles under the cursor; the list redraws in place (no scrolling spam); Esc prints `Cancelled — no changes made.` and exits with no config/rc change. Then re-run and confirm Enter on an all-unticked list removes the block (native) and prints the no-remote message.

- [ ] **Step 5: Automated smoke — non-TTY fallback + flags still work**

Run (piped stdin → non-TTY path; and `--terminals` non-interactive):
```bash
cd packages/devdash-agent && TMP="$(mktemp -d)" && printf 'export E=1\n' > "$TMP/.zshrc" && \
printf '2\n' | HOME="$TMP" node dist/cli.js setup-cowork --no-adopt >/dev/null 2>&1; \
echo "fallback config:"; grep -A4 coworkTerminals "$TMP/.devdash-agent/config.json"; \
HOME="$TMP" node dist/cli.js setup-cowork --terminals "iTerm.app" --no-adopt >/dev/null 2>&1; \
echo "flag config:"; grep -A3 coworkTerminals "$TMP/.devdash-agent/config.json"; \
HOME="$TMP" node dist/cli.js setup-cowork --remove >/dev/null 2>&1; \
echo "after remove:"; grep -A2 coworkTerminals "$TMP/.devdash-agent/config.json"; rm -rf "$TMP"
```
Expected: the piped `2` selects row 2 via the numbered fallback (non-empty `coworkTerminals`); `--terminals "iTerm.app"` sets `["iTerm.app"]`; `--remove` sets `cowork:false`, `coworkTerminals:[]`. (Requires tmux installed; this machine has it.)

- [ ] **Step 6: Commit (src + rebuilt dist)**

```bash
cd /Volumes/SandeepSSD/www/tools/devdash
git add packages/devdash-agent/src/cli.ts packages/devdash-agent/dist/cli.js packages/devdash-agent/dist/cli.js.map
git commit -m "feat(agent): arrow-key terminal picker in setup-cowork; stop pre-ticking current terminal"
```

---

### Task 3: Version bump, publish, push

**Files:**
- The `npm run release:minor` flow bumps `package.json` `2.1.0` → `2.2.0` itself.

**Interfaces:**
- Consumes: a green suite (40 tests) + manual smoke from Task 2.
- Produces: published `dialout@2.2.0` + pushed `main`.

- [ ] **Step 1: Final verification**

Run:
```bash
cd /Volumes/SandeepSSD/www/tools/devdash && \
npm test --prefix packages/devdash-agent 2>&1 | grep -E '^# (pass|fail|tests)' && \
npx tsc --noEmit >/tmp/webtsc.log 2>&1; echo "web tsc exit=$?" && \
git status --short
```
Expected: `# fail 0` (40 tests); `web tsc exit=0`; clean tree.

- [ ] **Step 2: Release (bump → build → changelog → commit → tag → push → publish)**

The sanctioned path is `npmnic` (private registry `https://registry.npmjs.org`), which requires a prior `npmnic login`. Run:
```bash
cd packages/devdash-agent && npm run release:minor
```
Expected: `dialout@2.2.0` published; a `2.2.0` commit + `v2.2.0` tag created and pushed to `origin/main`.

- [ ] **Step 3: Verify publish + push**

Run:
```bash
cd /Volumes/SandeepSSD/www/tools/devdash && \
node -p "require('./packages/devdash-agent/package.json').version" && \
git log --oneline -1 && git tag --points-at HEAD && \
git rev-parse --short HEAD && git rev-parse --short origin/main && \
(cd packages/devdash-agent && npm pack --dry-run 2>&1 | grep -E "dist/checklist.js|dist/cli.js")
```
Expected: version `2.2.0`; HEAD == origin/main; tarball includes `dist/checklist.js` and `dist/cli.js`.

- [ ] **Step 4: Tell the user**

Print: run `devdash-agent update` then `devdash-agent setup-cowork` to try the new arrow-key picker. Since their allowlist is currently empty (fully native), leaving everything unticked keeps all terminals native; ticking an app they don't use daily exposes only that one to DevDash remote.

---

## Notes on coverage

- Arrow-key nav / Space toggle / toggle-all / Enter / Esc: Task 1 (pure logic tests) + Task 2 (driver + manual smoke).
- Stop auto-selecting current terminal: Task 2 Step 2 (`checked: prev.has(t.token)` only).
- Legend/warning about wrapped=non-native: Task 2 Step 1 legend.
- Non-TTY fallback + `--terminals`/`--remove` unchanged: Task 2 Steps 2 & 5.
- Injection defense preserved: `sanitizeTokens` on both paths (Task 2 Step 2).
- dist committed with each src change; minor version bump: Tasks 1-3.
