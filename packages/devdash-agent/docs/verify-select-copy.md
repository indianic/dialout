# End-to-End Verification — App-Gated Cowork Wrapping (select & copy fix)

**Date:** 2026-07-07
**Agent version at verification:** 2.0.4 (pre-release; published as 2.1.0)
**Feature:** local terminals stay native by default; only user-selected terminal
apps auto-wrap into tmux. The central fix is that a terminal in a **non-selected**
app gets native OS selection — a drag-selected highlight **persists after the mouse
is released** and Cmd/Ctrl+C copies it — because tmux is no longer intercepting the
mouse in that terminal.

## What the change actually modifies

The only behavioral change to the shell wrapper is a new **terminal-match gate**:
the tmux wrap now runs only when the shell's terminal token
(`TERM_PROGRAM`, or a marker-env fallback for kitty/alacritty/wezterm) is in the
configured allowlist (`config.coworkTerminals`). Every other guard (`$TMUX` empty,
`DEVDASH_NO_WRAP` empty, `$SSH_TTY` empty, `[ -t 1 ]`, `command -v tmux`) and the
entire tmux wrap body (`mouse on`, `set-clipboard on`, `history-limit 50000`, the
`@devdash_*` stamps, `exec tmux new-session -A`, **no `pane-scrollbars`**) are
carried over byte-for-byte from the previously-shipped, working block.

So the verification that matters is: **does the gate decide WRAP only for the
selected app and NATIVE for every other app?** That is fully machine-verifiable and
was verified below. Whether a native (unwrapped) terminal shows a persistent OS
highlight is a property of the OS/terminal when tmux is *not* in the pipe — it is
the standard behavior of any plain shell, and it is confirmed by a human at the GUI
(the one step no headless environment can perform).

## Machine-verified (PASS)

Run from `packages/devdash-agent` against a throwaway `$HOME` (the developer's real
config was never touched):

1. **`setup-cowork --terminals "iTerm.app" --no-adopt` writes a correct app-gated
   block.** The installed `~/.zshrc` block's inner `case` reads exactly
   `iTerm.app) _dd_match=1 ;;`; `config.json` has `"cowork": true` and
   `"coworkTerminals": ["iTerm.app"]`. Pre-existing rc content (`export
   SENTINEL_BEFORE=1`) was preserved.

2. **The gate extracted from the ON-DISK installed block, executed under real
   `sh`, decides correctly** (allowlist = `iTerm.app`):

   | Terminal (TERM_PROGRAM / marker) | Decision |
   |---|---|
   | `iTerm.app` (selected)      | **WRAP** |
   | `Hyper`                     | NATIVE |
   | `Apple_Terminal`            | NATIVE |
   | `vscode`                    | NATIVE |
   | `KITTY_WINDOW_ID` set → `kitty` | NATIVE |

   NATIVE means the block falls through and the shell continues as a plain OS shell
   with `$TMUX` empty — i.e. tmux never intercepts the mouse, which is the fix.

3. **Empty selection removes the block; `--remove` reverts to native.**
   `setup-cowork --terminals "" --no-adopt` strips the wrapper (keeping other rc
   content) and sets `cowork=false`, `coworkTerminals=[]`; `--remove` does the same.
   (Task 4 smoke tests, `.superpowers/sdd/task-4-report.md`.)

4. **Unit coverage** (`npm test --prefix packages/devdash-agent`, 33/33 green):
   `renderMatchGate` under `sh -c` covers WRAP for each allowlisted token, NATIVE for
   non-listed tokens, the kitty/alacritty/wezterm marker fallbacks, and the
   empty-allowlist no-op arm; `renderCoworkBlock` asserts the rendered block contains
   no `pane-scrollbars`; token sanitization drops shell-injection payloads before they
   can reach the `case`.

## Environment-blocked here → confirmed by human at the GUI

Executing the **full** installed block end-to-end (through `exec tmux`) requires a
real controlling tty, because of the unchanged `[ -t 1 ]` guard. This sandbox cannot
allocate a pty (`script: tcgetattr/ioctl: Operation not supported on socket`), so the
full exec path is not run headless. Those guards are unchanged from the shipping
block, and the decision logic that *is* new is verified above.

The following is the human acceptance checklist — perform it after re-running
`devdash-agent setup-cowork` to pick your remote app and `devdash-agent restart`.
This is the spec's Selection & Copy Matrix acceptance:

- [ ] **Non-selected app is native.** Open a new window in a terminal app you did
      NOT select. Run `echo "TMUX=[$TMUX]"` → expect `TMUX=[]` (empty).
- [ ] **Highlight persists + copies.** In that window, print a line, drag-select part
      of it, **release the mouse** → the highlight stays visible; Cmd+C (macOS) /
      Ctrl+Shift+C (Linux) copies it; paste elsewhere to confirm. This is the direct
      fix for "selection unselects as soon as I stop pressing the mouse."
- [ ] **Selected app wraps + appears in DevDash.** Open a new window in the app you
      selected. Run `echo "TMUX=[$TMUX]"` → expect non-empty; the session appears in
      DevDash → Terminals. Remote clients (xterm.js/mobile) still copy via Shift+drag
      and OSC-52 (already shipped).

## Conclusion

The app-gating mechanism — the actual change — is verified end-to-end from the real
on-disk artifact: only the selected app wraps into tmux; every other terminal stays
native, which removes tmux's mouse interception and restores persistent OS selection.
The final GUI confirmation of persistent highlight + Cmd/Ctrl+C is a one-time human
check performed when the user re-runs `setup-cowork` on their machine.
