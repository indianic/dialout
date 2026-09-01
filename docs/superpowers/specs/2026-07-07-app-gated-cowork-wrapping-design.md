# App-Gated Cowork Wrapping — Design

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Component:** `packages/devdash-agent` (`setup-cowork`, shell wrapper, config, terminal detection)

## Problem

DevDash's cowork feature auto-wraps **every** interactive shell into tmux (opt-out
via `DEVDASH_NO_WRAP=1`). Wrapping a terminal in tmux with `mouse on` forces tmux's
own selection model on the user: a plain drag is captured by tmux (yellow
highlight) and copy-and-cancels on mouse release, so the highlight never stays.
There is no way to get native OS selection (highlight persists after release →
Cmd/Ctrl+C copies) while a terminal is inside tmux with mouse on; turning tmux mouse
off instead breaks native wheel scrolling. The two behaviors are coupled through
tmux's single `mouse` switch, so no tmux-only tuning satisfies both.

The fix is architectural: **stop forcing tmux on every terminal.** Only the terminal
app(s) the user explicitly designates for remote access get wrapped in tmux; all
other terminals run as plain native shells with full OS selection and scrolling.

## Goals

- **Fix select & copy** in the terminals the user works in — the central pain. This
  is a direct consequence of app-gating: an unwrapped terminal gets native OS
  selection (drag → highlight **persists after release** → Cmd/Ctrl+C copies)
  because tmux is no longer intercepting the mouse. No terminal-emulator-specific
  hacks are needed; not-wrapping is the fix.
- Local terminals are native by default: OS text selection and native scrolling, no
  tmux in the way.
- The user chooses which terminal **app(s)** are exposed to DevDash remote
  (mobile/web); those — and only those — auto-wrap into tmux.
- `setup-cowork` auto-detects installed terminal apps and offers a checklist.
- If tmux is not installed, the CLI offers to install it (show command → confirm →
  run), then continues setup.

## Selection & Copy Matrix

The select/copy behavior is fully determined by whether a terminal is wrapped, and
this is the primary acceptance surface for the change:

| Context | Wrapped? | Selection behavior | Copy |
|---|---|---|---|
| Native local terminal (non-remote app) | No | **Native OS selection — highlight persists after mouse release** | Cmd/Ctrl+C (OS) |
| Remote/wrapped terminal, used locally | Yes (tmux) | Plain drag = tmux select (auto-copies, clears). **Shift+drag = native OS selection that persists** (terminal bypasses tmux mouse) | Shift+drag → Cmd/Ctrl+C; plain drag auto-copies |
| Remote terminal on mobile/web (xterm.js) | Yes (tmux) | Plain drag = tmux select → OSC-52 to browser clipboard. Shift+drag = native xterm selection | Cmd/Ctrl+C handler (already shipped) + OSC-52 |

**Acceptance:** after `setup-cowork` selects a remote app and the agent restarts,
opening a terminal in any **non-selected** app must give native selection — drag a
range, release the mouse, the highlight stays, Cmd/Ctrl+C copies it. This is the
explicit fix for "selection unselects as soon as I stop pressing the mouse."
The plan must include a task that verifies this end-to-end, not only unit tests.

## Non-Goals

- Changing browser-originated "New Terminal" sessions: those are created from the
  web specifically to be shared, and continue to wrap in tmux (`openSession` with
  `coworkWrap`). Unchanged.
- Native OS selection *inside* a terminal the user designated as remote. A wrapped
  terminal shows tmux selection locally by design; the user runs native work in a
  non-remote app. (Remote clients — xterm.js/mobile — still copy via OSC-52 and
  Shift+drag.)
- Per-window or per-session on-demand sharing (`dd`-style command). Rejected in
  favor of the per-app model. May be revisited later.
- First-class Linux terminal detection. Linux is best-effort (see Detection);
  primary target is macOS.

## Decisions (from brainstorming)

1. **Share model:** by terminal app. Pick app(s) to auto-wrap; the rest stay native.
2. **Detection:** auto-detect installed terminal apps + interactive checklist, with
   the terminal running setup pre-ticked.
3. **tmux install:** detect the package manager, print the exact command, prompt
   `y/N`, run only on confirm; if a prerequisite is missing (e.g. no Homebrew),
   print manual steps instead of guessing.

## Architecture

### 1. Terminal detection — `terminal-detect.ts` (new module)

Exports:

```ts
export interface KnownTerminal {
  /** Display name for the checklist, e.g. "iTerm". */
  name: string;
  /** Canonical token stored in config and matched at runtime. */
  token: string;
  /** macOS .app bundle basenames that indicate it is installed. */
  appBundles: string[];
  /** true when the app bundle is present on disk. */
  installed: boolean;
  /** true when this is the terminal setup is currently running in. */
  current: boolean;
}

export function detectTerminals(): KnownTerminal[];
/** Canonical token for the terminal setup is running in, or "" if unknown. */
export function currentTerminalToken(): string;
```

Known terminal table (token = `TERM_PROGRAM` value unless noted; runtime fallback
marker used when `TERM_PROGRAM` is unset):

| Display name    | token            | macOS bundle(s)                         | runtime fallback env |
|-----------------|------------------|-----------------------------------------|----------------------|
| Hyper           | `Hyper`          | `Hyper.app`                             | —                    |
| iTerm           | `iTerm.app`      | `iTerm.app`                             | —                    |
| Apple Terminal  | `Apple_Terminal` | `Terminal.app`                          | —                    |
| VS Code         | `vscode`         | `Visual Studio Code.app`, `Code.app`    | —                    |
| Ghostty         | `ghostty`        | `Ghostty.app`                           | —                    |
| WezTerm         | `WezTerm`        | `WezTerm.app`                           | `$WEZTERM_PANE`      |
| Kitty           | `kitty`          | `kitty.app`                             | `$KITTY_WINDOW_ID`   |
| Alacritty       | `alacritty`      | `Alacritty.app`                         | `$ALACRITTY_WINDOW_ID` |

- **Installed detection (macOS):** a bundle is present in any of `/Applications`,
  `~/Applications`, `/System/Applications`, `/System/Applications/Utilities`.
- **Current terminal:** `currentTerminalToken()` reads `process.env.TERM_PROGRAM`
  first; if empty/unknown, checks the fallback env markers in the table. If the
  process is inside tmux (`TERM_PROGRAM=tmux` or `$TMUX` set), the real outer app is
  unknown → `current` is left unset on all rows (checklist shows nothing
  pre-ticked). The summary advises running setup from a native terminal in that case.
- **Always-include rule:** if the current terminal resolves to a token not in the
  known table, append a synthetic row (`name = token`, `installed = true`,
  `current = true`) so the user can always pick "this terminal."
- **Linux:** `installed` is derived best-effort from `command -v` on launcher
  binaries (`hyper`, `wezterm`, `kitty`, `alacritty`, `gnome-terminal`, `konsole`);
  `TERM_PROGRAM` is frequently unset, so the current-terminal + fallback-marker path
  is the primary signal.

### 2. Config — `config.ts`

Add to `AgentConfig`:

```ts
/** Terminal-app tokens whose shells auto-wrap into tmux for remote access. */
coworkTerminals?: string[];
```

`cowork?: boolean` remains the master on/off switch. An empty or absent
`coworkTerminals` means no local shell wraps.

### 3. Shell wrapper — app-gated `COWORK_BLOCK`

The block is **regenerated from the allowlist** at install time by a pure function:

```ts
function renderCoworkBlock(tokens: string[]): string;
```

The generated block keeps all existing guards (`$TMUX` empty, `DEVDASH_NO_WRAP`
empty, `$SSH_TTY` empty, `[ -t 1 ]`, `command -v tmux`) and adds a terminal-match
gate. Shape (tokens injected into the `case` arms; example allowlist
`Hyper`, `iTerm.app`):

```sh
# >>> devdash cowork wrapper >>>
# Managed by "devdash-agent setup-cowork" — do not edit inside the markers.
case $- in
  *i*)
    if [ -z "$TMUX" ] && [ -z "$DEVDASH_NO_WRAP" ] && [ -z "$SSH_TTY" ] && [ -t 1 ] \
       && command -v tmux >/dev/null 2>&1; then
      _dd_tp="${TERM_PROGRAM:-}"
      [ -n "$KITTY_WINDOW_ID" ] && _dd_tp="kitty"
      [ -n "$ALACRITTY_WINDOW_ID" ] && _dd_tp="alacritty"
      [ -n "$WEZTERM_PANE" ] && _dd_tp="WezTerm"
      _dd_match=""
      case "$_dd_tp" in
        Hyper|iTerm.app) _dd_match=1 ;;
      esac
      if [ -n "$_dd_match" ]; then
        # ... unchanged wrap: new-session, stamp @devdash_* facts, exec tmux ...
      fi
      unset _dd_tp _dd_match
    fi
  ;;
esac
# <<< devdash cowork wrapper <<<
```

- The wrap body (session naming, `@devdash_*` / `@term_program` stamps, native tmux
  options, `exec tmux new-session -A`) is carried over verbatim from the current
  block.
- **Empty allowlist:** `renderCoworkBlock([])` produces a block whose `case` has no
  matching arm (a single `*)` no-op), so nothing ever wraps. `setup-cowork` with an
  empty selection removes the block instead (equivalent, cleaner).
- Token injection is sanitized: tokens are restricted to `[A-Za-z0-9._-]` before
  being placed in the shell `case` (defense against rc-file injection); anything
  else is dropped.

### 4. `setup-cowork` command flow (rewritten)

1. Load config.
2. **`--remove`:** strip the block from rc files, `coworkTerminals = []`,
   `cowork = false`, print reverted-to-native message. (Unchanged behavior.)
3. **tmux check:** if `tmuxAvailable()` is false:
   - Detect package manager: macOS → `brew` (if `brew` present) else manual;
     Linux → first present of `apt-get`/`dnf`/`yum`/`pacman`/`zypper`.
   - Print the exact command (`brew install tmux`, `sudo apt-get install -y tmux`,
     …). If `--yes`, run without asking; else prompt `y/N` and run on `y`.
   - Re-check `tmuxAvailable()`; on success continue, on failure print manual steps
     and exit non-zero.
   - If no package manager / prerequisite: print manual instructions, exit non-zero.
4. **Terminal selection:**
   - `--terminals "A,B"` → parse tokens non-interactively.
   - else interactive checklist from `detectTerminals()`: numbered list showing
     `[x]`/`[ ]`, installed apps first, current pre-ticked (and any previously
     selected tokens pre-ticked). User toggles by entering numbers (space/comma
     separated), Enter confirms. Empty selection is allowed (⇒ remove block).
5. Save `config.coworkTerminals`.
6. **Adopt existing sessions** wizard — unchanged (`--adopt-all` / `--no-adopt`).
7. If selection non-empty: regenerate + install the app-gated block into existing
   rc files (create default shell's rc if none exist, as today). If empty: remove
   the block.
8. `config.cowork = true` (or `false` if empty selection), save.
9. Print summary: which apps are remote, that all other terminals are native, and
   `devdash-agent restart`. If the current terminal couldn't be identified (inside
   tmux), note to re-run from a native terminal for the pre-tick to work.

New flags: `--terminals <csv>` (non-interactive selection), `--yes` (auto-confirm
tmux install). Existing flags unchanged: `--remove`, `--adopt-all`, `--no-adopt`.

### 5. Migration

Existing installs carry the old wrap-everything block. Nothing changes for them
until they re-run `setup-cowork`; the command's summary and release notes instruct
them to re-run (to pick their remote app) or `--remove` (to go fully native). The
marker-delimited block is replaced atomically by `removeCoworkBlock` +
`installCoworkBlock`, so re-running cleanly upgrades old → new.

## Error Handling

- tmux install declined or failed → clear manual instructions, non-zero exit, no rc
  changes.
- Package manager absent → manual instructions, non-zero exit.
- rc file unreadable/unwritable → report the path and error, continue with other rc
  files; never partially corrupt a block (write is whole-file).
- Detection failure (FS errors) → treat app as not installed; the current terminal
  is still offered via the always-include rule.
- Token sanitization drops non-matching tokens so a malformed `--terminals` value
  can never inject shell into the rc file.

## Testing

- **`detectTerminals()`:** mock env + a fake app directory listing; assert
  `installed`/`current` flags and the always-include synthetic row for an unknown
  current terminal.
- **`currentTerminalToken()`:** `TERM_PROGRAM` set; unset with each fallback marker;
  inside-tmux returns "".
- **`renderCoworkBlock(tokens)`:** correct `case` arms for a multi-token list;
  empty list ⇒ no matching arm; tokens with illegal characters are dropped.
- **Runtime match decision:** execute the generated `case` snippet under `sh -c`
  with `TERM_PROGRAM` / marker permutations and a stubbed `tmux`, asserting a
  sentinel (`WRAP` vs `NATIVE`) — verifies matching without spawning tmux or execing.
- **Package-manager selection:** given a mocked platform + `command -v` results,
  assert the constructed install command string (no real install runs).
- Existing `setup-cowork` tests updated for the new flow; the suite stays green
  (`npm test --prefix packages/devdash-agent`).
- **End-to-end select/copy verification** (the central fix): after configuring a
  remote app and restarting the agent, open a terminal in a **non-selected** app,
  confirm no tmux (`$TMUX` empty), drag-select text, release, and confirm the
  highlight persists and Cmd/Ctrl+C copies it. Also confirm a terminal in the
  selected app wraps into tmux and appears in DevDash → Terminals.

## Rollout

Ship as a new agent minor version. Release notes: local terminals are now native by
default; run `devdash-agent setup-cowork` to pick which terminal app is your remote
one, or `--remove` to go fully native.
