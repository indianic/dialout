# Phase 1 — Linux cowork support

## Context

`devdash-agent setup-cowork` installs a shell gate into `~/.bashrc` / `~/.zshrc`
that auto-wraps an interactive shell into tmux when the terminal app is on the
user's allowlist. The wrapped session is then reported to the DevDash server and
appears in DevDash → Terminals as a live session.

**The gate keys off `$TERM_PROGRAM`** (`src/cowork.ts:24-37`), which is an Apple
convention. GNOME Terminal and Konsole never set it, yet both are offered in the
`setup-cowork` checklist (`src/terminal-detect.ts:38-39`).

Reproduced by rendering the real block and running the gate under `/bin/sh` with
the env vars those terminals actually export:

```
GNOME Terminal (real)  -> tp=[] match=[]     <- never wraps
Konsole (real)         -> tp=[] match=[]     <- never wraps
macOS Terminal         -> tp=[Apple_Terminal] match=[1]
VS Code (linux)        -> tp=[vscode] match=[1]
```

So on Linux the user picks "GNOME Terminal", setup prints `Cowork enabled.`, and
the wrapper silently never fires. No tmux session is created, nothing reaches
DevDash. Silent success is why this presents as "cowork doesn't work on Linux"
rather than an error.

The same root cause breaks detection: `currentTerminalToken()`
(`src/terminal-detect.ts:79-89`) reads the same three markers, so under GNOME
Terminal / Konsole it returns `''` — nothing is tagged "this terminal", and the
always-include fallback at line 113 cannot fire either.

Working today on Linux: Ghostty, WezTerm, Kitty, Alacritty, VS Code, Hyper —
they set `TERM_PROGRAM` or one of the three markers already special-cased.

Verified NOT the bug: `hasCommand` via `execFileSync('command', …,
{shell:'/bin/sh'})` works; `pickTmuxInstall` already covers
apt/dnf/yum/pacman/zypper; appending to `.bashrc` is safe against Debian's
early-`return` guard; `$RANDOM` / `date` / `basename` in the wrap body are fine
under bash and zsh on Linux.

## Global Constraints

1. **macOS behavior must not change.** Every existing test in
   `packages/devdash-agent/test/` keeps passing, unmodified, unless a task
   explicitly says otherwise. The macOS token path (`TERM_PROGRAM`) stays the
   first thing consulted.
2. **The rc block is POSIX `sh`, not bash.** It is sourced by `.bashrc` AND
   `.zshrc`. No bashisms (`[[`, arrays, `local` outside functions). Test it by
   executing under `/bin/sh`, not by string comparison alone.
3. **The rc block runs on every interactive shell start.** Keep it fast — no
   subprocess spawns beyond the existing `command -v`, and any `/proc` walk must
   be bounded to at most 10 levels.
4. **Preserve the rc-injection defense.** `TOKEN_RE = /^[A-Za-z0-9._-]+$/` in
   `src/cowork.ts:8` gates every token that reaches the shell `case`. Any new
   value interpolated into the block passes the same filter. Never widen it.
5. **One source of truth.** The shell gate and the Node-side detection must
   resolve a terminal to the SAME token from the SAME table. The current bug
   exists because those two code paths drifted.
6. **Tests before implementation** (TDD). A task's tests must fail against the
   pre-task code for the stated reason, then pass after.
7. Run `npm test` (= `npm run build && node --test`) from
   `packages/devdash-agent/` before reporting DONE. Report the actual counts.
8. Work only inside `packages/devdash-agent/`. Do not touch the DevDash server
   (`src/app`, `src/components`, `src/lib`).

## Task 1 — Shared terminal-marker table

Create `packages/devdash-agent/src/terminal-markers.ts` as the single source of
truth for "which env var proves which terminal", replacing the three hardcoded
markers currently duplicated in `src/cowork.ts:30-32` and
`src/terminal-detect.ts:84-86`.

Export:

```ts
export interface EnvMarker {
  /** Env var whose non-empty presence identifies the terminal. */
  envVar: string;
  /** Canonical token, must satisfy /^[A-Za-z0-9._-]+$/. */
  token: string;
}

export const ENV_MARKERS: EnvMarker[];

/** Resolve a token from env: TERM_PROGRAM first, then ENV_MARKERS in order. */
export function tokenFromEnv(env: NodeJS.ProcessEnv): string;
```

`ENV_MARKERS`, in this exact order:

| envVar | token |
|---|---|
| `KITTY_WINDOW_ID` | `kitty` |
| `ALACRITTY_WINDOW_ID` | `alacritty` |
| `WEZTERM_PANE` | `WezTerm` |
| `KONSOLE_VERSION` | `konsole` |
| `TILIX_ID` | `tilix` |
| `TERMINATOR_UUID` | `terminator` |
| `GNOME_TERMINAL_SCREEN` | `gnome-terminal` |
| `GNOME_TERMINAL_SERVICE` | `gnome-terminal` |
| `VTE_VERSION` | `vte` |

`VTE_VERSION` is deliberately LAST and maps to the generic token `vte`: every
VTE-based terminal sets it (gnome-terminal, tilix, terminator, xfce4-terminal,
guake), so it is the catch-all only reached when no more specific marker matched.

`tokenFromEnv` semantics — must match the existing `currentTerminalToken`
contract:
- If `env.TMUX` is set or `env.TERM_PROGRAM === 'tmux'` → return `''` (inside
  tmux the outer app is unknowable).
- Else if `env.TERM_PROGRAM` is non-empty → return it.
- Else return the token of the first `ENV_MARKERS` entry whose `envVar` is
  non-empty in `env`.
- Else return `''`.

Tests in `test/terminal-markers.test.js`:
- every token in `ENV_MARKERS` satisfies `/^[A-Za-z0-9._-]+$/` (Constraint 4)
- real GNOME Terminal env (`VTE_VERSION=7002`,
  `GNOME_TERMINAL_SCREEN=/org/gnome/Terminal/screen/x`) → `gnome-terminal`, not
  `vte` (ordering test)
- real Konsole env (`KONSOLE_VERSION=221201`) → `konsole`
- `VTE_VERSION=7002` alone → `vte`
- `TERM_PROGRAM=Apple_Terminal` → `Apple_Terminal` even when `VTE_VERSION` is
  also set (TERM_PROGRAM wins)
- `TMUX=/tmp/x` → `''`; `TERM_PROGRAM=tmux` → `''`
- empty env → `''`

## Task 2 — `/proc` process-tree fallback

Terminals with no distinguishing env var (xfce4-terminal, foot, urxvt, xterm,
st) can still be identified on Linux by walking up the process tree and matching
a known emulator process name.

Add to `packages/devdash-agent/src/terminal-markers.ts`:

```ts
/** Linux emulator process names (from /proc/<pid>/comm) → canonical token. */
export const PROC_NAMES: Record<string, string>;

export interface ProcDeps {
  readComm?: (pid: number) => string;   // /proc/<pid>/comm, trimmed
  readPPid?: (pid: number) => number;   // ppid from /proc/<pid>/stat
}

/** Walk up from startPid, max 10 levels, return the first matching token or ''. */
export function tokenFromProcTree(startPid: number, deps?: ProcDeps): string;
```

`PROC_NAMES` maps at minimum: `xfce4-terminal` → `xfce4-terminal`, `foot` →
`foot`, `urxvt` and `rxvt-unicode` → `urxvt`, `xterm` → `xterm`, `st` → `st`,
`konsole` → `konsole`, `gnome-terminal-` → `gnome-terminal` (note: the kernel
truncates `comm` to 15 chars, so gnome-terminal-server appears as
`gnome-terminal-`), `tilix` → `tilix`, `terminator` → `terminator`,
`alacritty` → `alacritty`, `kitty` → `kitty`, `wezterm-gui` → `WezTerm`.

Rules:
- Bounded to 10 levels (Constraint 3).
- Stop at pid <= 1.
- Any read failure ends the walk and returns `''` — never throws. Reading
  `/proc` on macOS fails, which is the correct no-op.
- Default `readComm`/`readPPid` read `/proc/<pid>/comm` and field 4 of
  `/proc/<pid>/stat`. Parse `stat` from the LAST `)` forward — a process name
  can itself contain spaces and parentheses.

Tests in `test/terminal-markers.test.js` using injected `ProcDeps` (no real
`/proc` dependency, so the suite passes on macOS):
- shell → bash → `gnome-terminal-` resolves to `gnome-terminal`
- unknown chain (`bash` → `sshd` → `systemd`) returns `''`
- a chain longer than 10 levels returns `''` (bound is enforced)
- a throwing `readComm` returns `''` rather than propagating
- a `stat` line whose process name contains `) (` parses the correct ppid

## Task 3 — Rewire the shell gate

Rewrite `renderMatchGate` in `packages/devdash-agent/src/cowork.ts` to generate
its marker probes from `ENV_MARKERS` (Task 1) instead of the three hardcoded
lines at `src/cowork.ts:30-32`, and add the `/proc` fallback as shell.

Requirements:
- Probe order in the emitted shell must equal `ENV_MARKERS` order, and
  `TERM_PROGRAM` must still take precedence, matching `tokenFromEnv` exactly
  (Constraint 5).
- Emit each probe as `[ -n "$VAR" ] && _dd_tp="token"` only when `token` passes
  `TOKEN_RE`; the env var name must additionally match `/^[A-Za-z_][A-Za-z0-9_]*$/`
  before interpolation (Constraint 4).
- After the env probes, if `_dd_tp` is still empty, walk `/proc` in POSIX sh:
  read `/proc/$pid/comm`, map through the same `PROC_NAMES` pairs, follow ppid
  via `/proc/$pid/stat`, bounded to 10 iterations, all reads guarded so the
  block is a silent no-op on macOS where `/proc` does not exist.
- The `case "$_dd_tp" in … esac` allowlist arm is unchanged in shape.
- `renderCoworkBlock`'s indentation and the `COWORK_BEGIN`/`COWORK_END` markers
  are unchanged, so `removeCoworkBlock` keeps working on blocks written by older
  agent versions.

Tests in `test/cowork.test.js` — execute the rendered gate under `/bin/sh` with
`execFileSync`, appending `printf 'tp=[%s] match=[%s]\n' "$_dd_tp" "$_dd_match"`,
and assert on the output (string-matching the generated source is not
sufficient — Constraint 2):
- GNOME Terminal env (`VTE_VERSION` + `GNOME_TERMINAL_SCREEN`) with
  `gnome-terminal` allow-listed → `match=1`. **This test fails before the fix**
  and is the regression lock for the reported bug.
- Konsole env (`KONSOLE_VERSION`) with `konsole` allow-listed → `match=1`
- tilix (`TILIX_ID`) and terminator (`TERMINATOR_UUID`) → `match=1`
- `TERM_PROGRAM=Apple_Terminal` with `Apple_Terminal` allow-listed → `match=1`
  (macOS regression lock)
- GNOME Terminal env with only `Apple_Terminal` allow-listed → `match=` (empty):
  a terminal that is detected but NOT selected must not wrap
- empty allowlist → `match=` for every env above
- a token containing `;` or `$(` is stripped by `sanitizeTokens` and cannot
  reach the shell (existing injection test still passes)

## Task 4 — Rewire Node-side detection and extend the terminal list

Point `packages/devdash-agent/src/terminal-detect.ts` at the shared table and
add the newly-detectable Linux emulators to the `setup-cowork` checklist.

- `currentTerminalToken(env)` delegates to `tokenFromEnv` (Task 1), then falls
  back to `tokenFromProcTree(process.ppid)` (Task 2) when the env yields `''`
  and `process.platform === 'linux'`. Keep the exported signature
  `(env?: NodeJS.ProcessEnv) => string` so existing callers
  (`src/cli.ts:955`) are unaffected; add the ppid and platform as optional
  injectable deps for testing.
- Extend `KNOWN_TERMINALS` with: Tilix (`tilix`), Terminator (`terminator`),
  XFCE Terminal (`xfce4-terminal`), Foot (`foot`), urxvt (`urxvt`), xterm
  (`xterm`), each with the matching `linuxBins` and empty `appBundles`.
- Existing entries keep their current tokens and order. New entries append after
  Konsole so the macOS checklist ordering is untouched.

Tests in `test/terminal-detect.test.js`:
- `platform: 'linux'` + GNOME Terminal env → the `gnome-terminal` row has
  `current: true` (fails before the fix)
- `platform: 'linux'` + Konsole env → `konsole` row `current: true`
- `platform: 'linux'` + no env markers + a proc chain resolving `xfce4-terminal`
  → that row is `current: true`
- `platform: 'darwin'` + `TERM_PROGRAM=Apple_Terminal` → unchanged behavior, and
  the proc fallback is NOT consulted
- the always-include rule still appends an unknown current token

## Task 5 — Linux clipboard bindings

On Linux the tmux copy bindings in `WRAP_BODY` (`src/cowork.ts:59-64`) are gated
on `command -v pbcopy`, so they are skipped entirely and copy never reaches the
system clipboard. `copyVerb()` (`src/pty-manager.ts:235-239`) has the same
macOS-only branch.

- In `WRAP_BODY`, after the existing `pbcopy` branch, add an `elif`-style chain
  selecting the first available of `wl-copy` (Wayland), `xclip -selection
  clipboard`, `xsel --clipboard --input`, and bind the same four copy bindings
  through it. The `pbcopy` branch stays first and unchanged so macOS is
  untouched (Constraint 1).
- Refactor `copyVerb()` in `src/pty-manager.ts` to take the platform and a
  `hasCommand` probe as injectable deps (defaulting to `process.platform` and a
  real `command -v`), returning the pbcopy pipe on darwin, the first available
  Linux clipboard pipe on linux, and the existing
  `['copy-selection-and-cancel']` when nothing is available.
- Update the comment block at `src/pty-manager.ts:229-234` — it currently states
  "Linux relies on OSC 52 alone — there is no portable equivalent of pbcopy",
  which this task makes false.

Tests:
- `test/pty-manager.test.js`: darwin → `['copy-pipe-and-cancel','pbcopy']`
  (existing assertion must still pass); linux with `wl-copy` present → wl-copy
  pipe; linux with only `xclip` → xclip pipe; linux with only `xsel` → xsel
  pipe; linux with none → `['copy-selection-and-cancel']`; wl-copy wins when
  both wl-copy and xclip are present.
- `test/cowork.test.js`: the rendered `WRAP_BODY` contains the Linux clipboard
  chain and still contains the untouched `pbcopy` branch.

## Task 6 — Guard rail against silent no-op

The reported bug was invisible because `setup-cowork` printed
`Cowork enabled.` for a selection that could never match. Make an impossible
selection loud.

- Add to `packages/devdash-agent/src/cowork.ts`:
  ```ts
  /** Tokens that cannot be produced by tokenFromEnv/proc detection here. */
  export function unmatchableTokens(
    tokens: string[],
    platform: NodeJS.Platform
  ): string[];
  ```
  A token is unmatchable when the platform cannot produce it: on `linux`, the
  macOS-only tokens `Apple_Terminal` and `iTerm.app`; on `darwin`, the
  Linux-only tokens (those reachable only via `ENV_MARKERS` beyond the first
  three, or only via `PROC_NAMES`). Tokens that are reachable on both — `vscode`,
  `Hyper`, `ghostty`, `WezTerm`, `kitty`, `alacritty` — are never unmatchable.
- In `src/cli.ts`, after `selected` is resolved and before the success message
  at `src/cli.ts:952`, warn in yellow for each unmatchable token, naming the
  platform and the reason, e.g.
  `Warning: "Apple_Terminal" cannot match on linux — that terminal does not run here.`
  If EVERY selected token is unmatchable, additionally print that cowork will
  never activate and set `process.exitCode = 1`. The rc block is still written
  (the user may sync dotfiles across machines) — this is a warning, not a
  refusal.

Tests in `test/cowork.test.js`:
- `unmatchableTokens(['Apple_Terminal','gnome-terminal'], 'linux')` →
  `['Apple_Terminal']`
- `unmatchableTokens(['gnome-terminal'], 'darwin')` → `['gnome-terminal']`
- `unmatchableTokens(['vscode','kitty'], 'linux')` → `[]`
- `unmatchableTokens(['vscode','kitty'], 'darwin')` → `[]`
- `unmatchableTokens([], 'linux')` → `[]`
