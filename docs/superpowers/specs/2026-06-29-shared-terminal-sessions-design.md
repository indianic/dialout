# Shared Terminal Sessions (CLI ↔ Browser, cross-machine, mobile-first) — Design

**Status:** Updated draft — mobile-first UX added, ready for planning
**Date:** 2026-06-29, revised 2026-07-05
**Owner:** Sandeep Mundra

## 1. Goal

Let a developer's **real terminal sessions** be used from both the native
terminal **and** the DevDash browser UI, across machines — **including from a
phone or tablet**. This is the USP of DevDash. The motivating cases:

> A long task is running in a shell on the **home** machine (or laptop). From the
> **office** computer's browser, the user opens that same live session, watches
> output, types commands — and vice-versa. Input/output is shared in real time;
> either side can drive the shell; disconnecting one side never kills the work.

> The user is away from any computer. From their **phone**, they open
> www.dialout.dev, tap a machine, see its live sessions **full-screen,
> easily readable**, type from the mobile keyboard or **dictate commands using
> the OS speech-to-text (the keyboard mic, exactly like WhatsApp)**, and drive
> the same shell.

Secondary goal: **track which terminal client** each session originates from
(Apple Terminal, iTerm2, Hyper, VS Code, WezTerm, …) for a per-session badge and
a "most-used terminal" analytics panel.

## 2. Background — what already exists (updated 2026-07-05)

- `packages/devdash-agent/src/pty-manager.ts` spawns a **fresh** shell via
  `node-pty` on browser request and streams it over WebSocket. The agent *owns*
  that PTY; it is not connected to any native terminal.
  **PTY sessions survive daemon reconnects** — output re-routes through the new
  active socket (`setActiveSocket`), and sessions are only killed by explicit
  `pty_close` or agent shutdown.
- `src/ws-server/index.ts` exposes `/daemon` (agent), `/terminal`, `/dashboard`,
  `/multiplex` (browser) upgrade paths and a connection registry keyed by
  `machineId` / `userId`. Shipped since the first draft:
  - Dual-layer WebSocket keepalive (client 25s JSON ping + server 30s protocol
    ping) and browser auto-reconnect with backoff.
  - **Detach-on-disconnect with a 10-minute grace period**: a dropped browser
    does not kill the PTY; reattach within the window resumes the session.
  - Clean vs abnormal exit handling; session recording into `terminalChunks`.
- Frontend `Terminal.tsx` / `TerminalPanel.tsx` / `TerminalDockBar.tsx`:
  full-screen open, xterm.js with `macOptionIsMeta`, web-links addon, 50k
  scrollback, terminal themes, **sessionStorage tab persistence per project**
  (tabs reattach after reload).
- `terminalSessions` + `terminalChunks` tables model sessions and recorded I/O
  chunks (base64), with a flush/record path in the ws-server; a session
  recordings panel exists.
- Multi-machine model (`machines`, per-machine agent, machine API keys with
  encrypted-at-rest copy support) and browser↔agent relay are in place.
- **Agent** (`dialout`, currently **1.1.1** on registry.npmjs.org):
  named connection profiles (local/remote/custom, `use`, `start --profile`,
  `DEVDASH_AGENT_PROFILE`), self-update checker, service installer
  (launchd/systemd), and the folder project-scanner (`project_scan`).

### Operational context (how this ships — verified working 2026-07-05)

- **Web app deploy:** push to `main` → GitLab CI (`.gitlab-ci.yml`) SSHes to the
  server, `git pull && npm install && npm run build`, then restarts
  `pm2` (`devdash-indianic-dev` + `-ws`). The repo has a root `.npmrc` mapping
  the `@indianic` scope to `https://registry.npmjs.org` (required — the app depends
  on `dialout`). A failed install/build aborts the deploy
  *before* pm2 restarts.
- **Agent release:** `cd packages/devdash-agent && npm run release` (patch) /
  `npm version minor` then `npm run build` and `npm publish` — bump, build, tag,
  pushes and publishes. Remote machines self-update.
- **Local testing:** `npm run dev` (Next :50051 + ws-server :50052);
  agent from source: `node dist/cli.js start --profile local`.
- **DB:** one shared PostgreSQL for local dev and production (schema changes are
  immediately live for both — additive `ALTER`s only, or `npm run db:push`).

So more than half the plumbing exists. The new work is: a shared-session engine
(tmux), an on-ramp (shell auto-wrap), enumeration/attach in the agent, browser
UI to list+join live sessions, client tracking, an interactive installer — and
the **mobile-first terminal experience (§12)**, which is the flagship of this
phase.

## 3. The one hard constraint (why tmux)

A process cannot attach to a PTY **master** owned by another app. So the agent
**cannot** transparently mirror a shell already running in Terminal.app/iTerm/
Hyper. The supported way to have one shell with *multiple live clients* is a
**terminal multiplexer**. We use **tmux**: the shell runs inside tmux, the native
terminal is one tmux client, and the agent attaches as a second client and bridges
it to the browser. tmux is mature, ubiquitous on macOS/Linux, and gives
multi-client, detach/reattach, and per-client sizing for free.

## 4. Chosen approach

- **On-ramp — auto-wrap (chosen):** a shell wrapper (sibling of the existing
  `claude()` wrapper) re-execs each *interactive* shell inside tmux and stamps
  metadata. Guards: skip if already inside tmux (`$TMUX`), non-interactive shells,
  and remote SSH sessions (`$SSH_TTY`). Opt-out via `DEVDASH_NO_WRAP=1`.
- **Bridge — attach-in-PTY (chosen, "Approach A"):** to serve a session to the
  browser, the agent runs `tmux attach -t <name>` inside a `node-pty` and pipes it
  through the existing browser↔agent channel. Minimal new code; reuses the
  recording path. (tmux control mode `-CC` is a possible later upgrade for richer
  pane metadata, but is out of scope here.)
- **Engine — tmux**, required on the machine; the installer sets it up (§9).

### Approaches considered and rejected
- *Retroactively mirror open native windows* — infeasible (no PTY-master attach);
  best case is read-only AppleScript scraping. Rejected.
- *tmux control mode parser (`-CC`)* — more protocol surface than needed for v1.
- *Record/replay only (`script`/asciinema)* — view-only, not live control.

## 5. Architecture & data flow

```
Office browser ─WSS─►  DevDash server  ─WSS─►  Home agent ─► tmux attach -t <name> ─► shared shell
Phone (PWA)    ─WSS─►  /multiplex relay        node-pty bridge        (same session the home terminal is in)
   xterm.js
```

1. Home terminal launches → wrapper re-execs into `tmux new-session -A -s <name>`.
2. Agent enumerates tmux sessions and reports them to the server (live registry).
3. Office browser / phone lists the user's machines → their live sessions → taps one.
4. Server routes an "attach" request to the owning machine's agent.
5. Agent `tmux attach -t <name>` inside a PTY; bytes stream browser ↔ agent ↔ tmux.
6. Both clients are live; tmux merges input and broadcasts output to all clients.

## 6. Components & changes

| Area | File(s) | Change |
|---|---|---|
| Shell wrapper | new `shell/devdash-shell.sh` (installed into `~/.zshrc`/`~/.bashrc`) | Re-exec interactive shells into `tmux new-session -A -s <name>`; stamp `@term_program`, `@devdash_origin`; guards + `DEVDASH_NO_WRAP` opt-out |
| tmux manager | new `packages/devdash-agent/src/tmux-manager.ts` | `listSessions()` (`tmux list-sessions -F …`), `attach(name, ws)` (spawn `tmux attach` in `node-pty`, reuse pipe), `tmuxAvailable()`, read `@term_program` via `show-options`; `pipe-pane` for recording |
| Agent wiring | `src/index.ts`, `src/websocket.ts` | Poll/diff tmux sessions on an interval + on tmux hooks; report `session_list` to server; handle `attach_session` / `detach_session` / `resize` messages |
| ws-server | `src/ws-server/index.ts` | New message types: `list_sessions`, `attach_session(name)`, `session_list` relay; keep existing `/multiplex`. Reuse recording into `terminalChunks` |
| Schema | `src/lib/schema.ts` | `terminalSessions`: add `tmuxName`, `termProgram`, `origin` ('native'\|'browser'), `isLive`, `lastActiveAt` |
| Frontend (desktop) | sessions page / `ProjectDrawer` terminal tab | "Live sessions" list per machine with **terminal-client badge** + Attach; xterm.js view (exists) |
| **Frontend (mobile)** | new `MobileTerminalShell.tsx`, `TerminalComposer.tsx`, `KeyChipBar.tsx`; changes to `Terminal.tsx`, `app/layout.tsx` (viewport/PWA), new `manifest.webmanifest` | Full-screen mobile terminal, chat-style composer with OS dictation, key-chip toolbar, keyboard avoidance, font scaling — see §12 |
| Analytics | `src/app/api/stats/route.ts` + Header/dashboard | Aggregate `termProgram` → "most-used terminal client" panel |
| Installer | agent `setup`/`update` flow | Interactive enable + per-OS package install (§9) |

## 7. Terminal-client tracking

`$TERM_PROGRAM` distinguishes `Apple_Terminal`, `iTerm.app`, `Hyper`, `vscode`,
`WezTerm`; fall back to `$TERM`/`$TERMINAL_EMULATOR` and `unknown`. The wrapper
captures it at session creation and stamps it on the tmux session
(`tmux set -t <name> @term_program "$TERM_PROGRAM"`); the agent reads it back and
includes it in `session_list`. Stored on `terminalSessions.termProgram`.
Surfaces as: (a) a small badge/icon on each session card, (b) a roll-up stat.
Adding a new client later is just a new string value — no code change.

## 8. Cross-platform support

| Platform | v1 support | Engine / notes |
|---|---|---|
| macOS Apple Silicon (arm64) | ✅ Full | tmux via Homebrew `/opt/homebrew`; `node-pty` arm64 prebuilds |
| macOS Intel (x64) | ✅ Full | tmux via Homebrew `/usr/local`; same code |
| Linux (x64/arm64) | ✅ Full | tmux from apt/dnf/yum/pacman/zypper |
| Windows via WSL | ✅ Full | tmux + agent run inside WSL (a Linux env) |
| Windows native (PowerShell/cmd) | ⛔ Not in v1 | **No native tmux exists.** Future track |
| **iOS Safari / Chrome (viewer)** | ✅ Full | Mobile web client, §12; iOS 16+ target |
| **Android Chrome (viewer)** | ✅ Full | Mobile web client, §12; Chrome 108+ target |

**Decision (proposed):** v1 targets macOS (both CPUs) + Linux + Windows/WSL as
session *hosts*; any modern desktop or mobile browser as a *client*. Native
Windows shells are a documented limitation with a future, separate design.

## 9. Interactive enable + auto-install

`devdash-agent update` (and a new `devdash-agent setup-cowork`) gains an
interactive step:

```
Enable shared / co-work terminal sessions on this machine? [y/N]
```

If **yes**, the agent ensures prerequisites for the detected OS, prompting for
sudo only where required (reusing the `canPromptSudo()` pattern from the service
installer):

- **macOS:** detect Homebrew (arch-aware: `/opt/homebrew` vs `/usr/local`); if
  present `brew install tmux`; else point to Homebrew install. `node-pty` already
  ships with the agent.
- **Linux:** detect package manager → `sudo apt-get install -y tmux` /
  `dnf` / `yum` / `pacman -S` / `zypper`.
- **Windows:** detect WSL; if present, run the Linux path inside the default
  distro; else explain WSL is required for v1.

Then it installs the shell wrapper into the user's rc file (idempotent, marker-
bounded — same technique as `scripts/install-claude-remote.sh`) and verifies with
`tmux -V`. If **no**, nothing is installed and behavior is unchanged.

Non-interactive flags: `--enable-cowork` / `--no-cowork` for scripted installs.

## 10. Session lifecycle

- **Create:** wrapper runs `tmux new-session -A -s <name>` (`-A` = attach if it
  already exists, else create). Name = `<dirbase>-<shortid>` (human-readable,
  collision-safe); avoid leaking full paths.
- **Register:** agent's next enumeration reports it; server upserts a
  `terminalSessions` row with `isLive=true`, `origin='native'`.
- **Attach (browser):** agent spawns a tmux client PTY; recording continues into
  `terminalChunks`.
- **End:** shell exits → tmux session ends → agent enumeration no longer sees it →
  server marks `isLive=false`, sets `endedAt`. Browser clients get `pty_exit`.

## 11. Resize handling

Multiple clients of different sizes is the known wrinkle. Use tmux per-client
sizing: `set -g window-size latest` and `aggressive-resize on` (tmux ≥ 2.9) so the
most-recently-active client drives the window; the smaller client may see padding.
Browser sends `resize` on xterm.js `onResize`; agent applies it to its tmux client.

**Mobile interplay:** a phone attaching read-write with `window-size latest`
would shrink the session for the desktop client. Mobile therefore attaches with
an explicit choice (defaulting to **"peek"**): 

- **Peek (default on ≤ md screens):** attach via `tmux attach -r` (read-only
  client — does not drive window size), render at the session's existing
  cols×rows, scale the font to fit width, allow pinch-zoom + horizontal pan.
  One tap on the composer switches to Drive.
- **Drive:** full read-write attach; the mobile client's size wins
  (`window-size latest`), desktop sees padding until it types again.

Documented as an accepted v1 model; "follow active client" remains the default
for same-size desktop↔desktop sharing.

## 12. Mobile-first terminal UX (flagship requirement)

The terminal must be a first-class experience on a phone (≈360–430 px wide) and
tablet — full-screen, readable, typeable, dictatable. Design principles:
**the terminal is the screen; input is a composer; keys are chips.**

### 12.1 Layout (portrait phone)

```
┌──────────────────────────────┐
│ ⋯ session-name  ⬤ live   ✕  │  ← slim top bar (auto-hides on scroll/idle,
├──────────────────────────────┤     tap terminal to toggle)
│                              │
│        xterm.js canvas       │  ← full-bleed, 100dvh-aware, WebGL renderer,
│      (fills all space)       │     safe-area insets respected
│                              │
├──────────────────────────────┤
│ Esc Tab Ctrl ↑ ↓ ← → | ~ ^C │  ← KeyChipBar: horizontally scrollable chips
├──────────────────────────────┤
│ ▸ [ composer input      ] ➤ │  ← TerminalComposer (chat-style input bar)
└──────────────────────────────┘
```

- **Full screen:** the session page uses `100dvh`, `viewport-fit=cover` and
  `env(safe-area-inset-*)` padding; no sidebar, no page chrome. Landscape gets
  more columns automatically. Opened via route `/sessions/[id]` (already exists)
  so it deep-links and back-swipes naturally.
- **Readability:** FitAddon sizes cols/rows to the viewport; font size is
  user-adjustable via **pinch-to-zoom on the terminal area** (adjusts xterm
  `fontSize` between 10–22 px, persisted per device in `localStorage`) with a
  double-tap reset. Minimum default 13 px on phones. WebGL addon for smooth
  scrolling of 50k scrollback.

### 12.2 Input model — composer first (this is how dictation works)

xterm.js's hidden textarea fights mobile IMEs: autocorrect garbles raw
keystrokes and **the OS keyboard mic (dictation) is unreliable against it**.
WhatsApp-style dictation is an OS keyboard feature that works on any *real*
text field — so mobile input goes through a real text field:

- **TerminalComposer (default on touch devices):** a chat-style bar with a
  standard `<textarea rows=1>` (auto-grows). The OS keyboard supplies
  autocomplete, swipe-typing and the **mic/dictation button — zero custom
  speech code, identical UX to WhatsApp on both iOS and Android**. Send (➤ or
  keyboard "go") writes the text + `\n` to the PTY. Up/down chips recall shell
  history (they just send arrow keys). The composer lets users compose/edit a
  long command *before* it hits the shell — essential when dictating
  (`git status` arrives as one clean send, not char-by-char).
- **Raw mode:** tapping inside the terminal focuses xterm's own input for
  full-screen TUIs (vim, htop, the arrow-key menus of installers). The
  KeyChipBar stays available. A small toggle in the top bar switches modes;
  the composer auto-collapses in raw mode to one row of chips.
- **KeyChipBar:** horizontally scrollable chips: `Esc` `Tab` `Ctrl` (sticky —
  tap arms it for the next key/char, long-press locks) `↑` `↓` `←` `→` `|`
  `~` `/` `-` `Ctrl+C` `Ctrl+D` `Ctrl+Z` `Ctrl+R` `Ctrl+L` `Paste`. Chips send
  the raw byte sequences to the PTY. `navigator.vibrate(10)` haptic on tap
  where supported.
- **Optional in-app mic (v2, not v1):** a Web Speech API button inside the
  composer for hands-free use in browsers that support it. v1 relies entirely
  on the OS keyboard mic — it is strictly more reliable and needs no code.

### 12.3 Virtual keyboard handling

- Use the **`visualViewport` API**: on keyboard show/hide, resize the terminal
  container so the composer sits directly above the keyboard and the last
  output line stays visible (scroll-to-bottom on resize).
- `<meta name="viewport" content="width=device-width, initial-scale=1,
  viewport-fit=cover, interactive-widget=resizes-content">` for Android Chrome
  108+; iOS handled by the visualViewport listener.
- Keep focus in the composer after send (keyboard stays up, WhatsApp-style);
  a "hide keyboard" chevron collapses it to view output full-screen.

### 12.4 Mobile session list

`/sessions` (and machine cards) on small screens becomes a tappable list:
machine → live sessions with status dot, session name, terminal-client badge,
"last active" time. One tap opens the session full-screen. Pull-to-refresh
re-requests `session_list`.

### 12.5 Lifecycle on mobile networks

Mobile browsers aggressively kill background tabs and WebSockets — the existing
infrastructure already absorbs this:

- On `visibilitychange`/`pageshow` → immediate reconnect + reattach (the 10-min
  PTY detach grace and sessionStorage persistence already exist; tmux makes
  even longer gaps safe since the session lives on the host machine).
- Auto-reconnect with backoff (exists) + a thin "reconnecting…" toast overlay
  on the terminal rather than tearing down the view.
- Optional **wake lock** toggle (`navigator.wakeLock`) in the top bar for
  watching long-running output with the screen on.

### 12.6 PWA packaging

- `manifest.webmanifest` (name, icons, `display: standalone`, dark
  `background_color`) + apple-touch-icon → "Add to Home Screen" gives an
  app-like, chromeless launch straight to `/sessions`.
- No offline support beyond the app shell (a terminal is inherently online);
  no push notifications in v1.

### 12.7 Acceptance criteria (mobile)

On an iPhone (Safari) and an Android phone (Chrome):
1. Open a live session from the sessions list → terminal fills the screen,
   text legible without zooming (≥13 px), safe areas respected.
2. Type `ls -la` in the composer with the OS keyboard and send → output streams.
3. **Dictate** "git status" via the keyboard mic → text lands in the composer →
   send → runs.
4. Run `top` → switch to raw mode → arrow keys/`q` from the KeyChipBar work.
5. `Ctrl+C` chip interrupts a running `ping`.
6. Keyboard up/down never hides the composer or the latest output line.
7. Lock the phone 30 s, unlock → session reattaches automatically, scrollback
   intact.
8. Pinch-zoom changes font size; survives reload.
9. Same session simultaneously open on desktop: both sides see each other's
   keystrokes live (tmux). Peek/Drive behaves per §11.

## 13. Security & permissions

- Reuse existing auth: browser connections are scoped to the authenticated user's
  owned machines (machine API key model). A user never sees another user's
  sessions.
- New per-machine config flag `coworkEnabled` (default the value chosen at install)
  and a runtime toggle `allowBrowserControl` (view-only vs read-write) so a machine
  can expose sessions read-only. Mobile "Peek" mode maps to read-only attach.
- Full session I/O is already recorded (`terminalChunks`) → audit trail.
- The wrapper must never break login shells: all guards fail **open** (on any
  doubt, run a normal shell), and `DEVDASH_NO_WRAP=1` always bypasses.

## 14. Phasing

- **Phase 1 — Mobile terminal on existing PTY sessions (fastest USP win):**
  §12 in full against the *current* fresh-shell PTY terminals (no tmux needed):
  MobileTerminalShell + composer + KeyChipBar + keyboard avoidance + font
  scaling + reconnect UX + PWA manifest. Everything here also benefits desktop.
  Ships value even before tmux lands.
- **Phase 2 — tmux shared sessions (single machine):** wrapper + tmux-manager
  (enumerate + attach) + ws-server attach path + live-sessions list + attach
  from browser/mobile on the same machine. Client-tracking badge. Peek/Drive.
- **Phase 3 — cross-machine:** all machines' live sessions in one place; route
  attach to the owning agent (relay already supports per-machine addressing).
- **Phase 4 — polish:** analytics panel, read-only enforcement UI, resize-follow
  options, recording playback for shared sessions, optional Web Speech mic.

## 15. Out of scope (YAGNI for v1)

- Native Windows (non-WSL) shells.
- tmux control-mode (`-CC`) / multi-pane fidelity in the browser.
- Mirroring pre-existing, un-wrapped native terminal windows.
- Multi-user collaboration on a *shared* (cross-user) session.
- Custom in-app speech recognition (OS keyboard dictation covers v1).
- Push notifications / offline PWA behavior.

## 16. Risks

- **tmux dependency** — if install fails, feature is unavailable; degrade cleanly
  (the existing fresh-shell terminal still works, including on mobile — Phase 1
  does not depend on tmux at all).
- **Auto-wrap blast radius** — every interactive shell becomes a tracked session;
  mitigated by guards, opt-out, and tidy lifecycle.
- **iOS Safari keyboard quirks** — visualViewport timing differs across iOS
  versions; mitigate with the composer-first model (far less sensitive than raw
  xterm focus) and test on real devices early in Phase 1.
- **Resize UX** — unequal client sizes; mitigated by `window-size latest` +
  mobile Peek/Drive (§11).
- **node-pty native build** — already a dependency; ensure prebuilds for arm64 and
  rebuild guidance on failure.

## 17. Open decisions (for reviewer)

1. **Windows scope:** confirm v1 = macOS + Linux + WSL hosts, native Windows deferred.
2. **Default control mode:** read-write by default, or read-only until toggled?
   (Proposed: read-write on desktop, Peek→Drive on mobile.)
3. **Session naming:** `<dirbase>-<shortid>` vs let the user name sessions.
4. **Phase 1 scope check:** agree mobile UX ships first against existing PTY
   terminals, tmux sharing second.
