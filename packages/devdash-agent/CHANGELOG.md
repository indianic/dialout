# Changelog

All notable changes to this project will be documented in this file.
## [2.7.4] - 2026-08-22

- fix(agent): git and ssh to a LAN host failed inside every tmux session on macOS 26+ with
  `ssh: connect to host <host> port 22: Undefined error: 0`, while the same command worked in a
  non-tmux window of the same terminal app. macOS Local Network Privacy judges the **tmux server**,
  and there is one tmux server per user, so a denied server takes every session on the machine with
  it no matter who opened it. `install-service` and `setup-cowork` now write a guarded
  `Host * / ConnectTimeout` block at the end of `~/.ssh/config`, which selects ssh's legacy
  BSD-socket connect — a path Local Network Privacy does not gate. `uninstall-service` and
  `setup-cowork --remove` take it back out. The real cure is allowing tmux under System Settings >
  Privacy & Security > Local Network; this makes the machine work until someone clicks it
- chore(agent): depend on `@dialout/shared@^1.0.0` from the registry instead of `*`. The
  package is now published, so `npm install -g dialout` resolves again — 2.7.3
  shipped `require("@dialout/shared")` in its `dist/` against a package that only existed
  inside this repo

## [2.7.3] - 2026-08-21

- fix(agent): Codex tool calls never resolved, so once tool events existed a Codex session could get
  stuck reporting "waiting approval" indefinitely. A call and its output carry DIFFERENT `id`s for
  the same call (`ctc_…` vs `ctco_…`) and are paired by `call_id`. Measured on a real rollout:
  pairing on `id` matched 0 of 21, pairing on `call_id` matched 21 of 21
- fix(agent): Codex `developer` messages — its own sandbox-permission and base-instruction blocks —
  rendered as things the assistant had said, because every non-user role was mapped to 'assistant'.
  7 of 19 messages in a real transcript were that role. They are no longer surfaced
- feat(agent): the Codex adapter now emits tool calls, tool results and reasoning, not just messages.
  It previously dropped 60 of a 128-record transcript, and because deriveStatus() finds
  'waiting_approval' by pairing a tool call with its result, a Codex session could never report that
  status at all. The same transcript now yields 54 events instead of 19. Reasoning is emitted only
  when a readable summary exists — Codex encrypts it (`summary` was empty on all 20 records), so a
  blank thinking bubble is never shown, and this starts working by itself if that ever changes

## [2.7.2] - 2026-08-21

- feat(agent): discover slash commands and MCP servers for an AI session, behind one seam —
  `discoverCapabilities(kind, cwd)` — answered over a new `ai_capabilities_request` message. Claude
  and Grok are two genuinely different problems behind one shape: Claude discovers commands from
  user, project and plugin directories, while Grok has no commands directory at all and its
  built-ins are parsed from the README that ships beside the binary, so the list tracks the
  installed version instead of rotting in our source
- fix(agent): plugin command layouts are enumerated, not walked. A generic "find any directory
  named commands" search picked up `<marketplace>/.claude/commands` — a marketplace repo's OWN
  project commands, which the CLI never exposes — and namespaced all of them `.claude:`. Measured
  instead: `<marketplace>/commands`, `<marketplace>/<plugin>/commands`, and
  `<marketplace>/plugins/<plugin>/commands` (25 of 32 on the development machine)
- Claude command descriptions do not assume frontmatter. `~/.claude/commands/seo.md` has none and
  opens with a bare heading, so resolution falls through frontmatter to heading to first line
- Grok MCP config layers exactly as documented: `~/.grok` < `<repo-root>/.grok` < `<cwd>/.grok`,
  and a same-named project server REPLACES the global rather than merging its fields
- MCP `env` and `headers` never leave the machine. `args` do, for the detail row, so token-shaped
  entries are redacted first

## [2.7.1] - 2026-08-21

- **Supersedes 2.7.0, which must not be used.** 2.7.0 was published from a base that predated the
  2.6.5 UTF-8 locale fix, so installing it re-introduced the "agent is ONLINE but reports zero tmux
  sessions" bug on any machine whose service runs without a locale. 2.7.1 is 2.7.0's Grok support
  rebased on top of 2.6.5 and carries both.

- feat(agent): Grok CLI sessions now appear in /ai alongside Claude Code and Codex. Grok stores a
  directory per session (`~/.grok/sessions/<encodeURIComponent(cwd)>/<uuid>/chat_history.jsonl`), so
  it gets its own locator walk — the generic "newest *.jsonl in a directory" tier cannot see a file
  nested one level deeper under a fixed name. It is also the only CLI that publishes its own
  pid → session map (`~/.grok/active_sessions.json`), which becomes a tier 0 ahead of the lsof and
  cwd+newest heuristics: two grok sessions in one folder cannot collide the way two Claude ones could
- feat(agent): the grok adapter maps user prompts, assistant messages, reasoning and tool calls or
  results onto the same `AiEvent` union, so the browser still never learns which vendor produced a
  session. Two details were measured rather than assumed: a `user` record is something the human
  typed only when it carries a numeric `prompt_index` (the other three in a real transcript are
  grok's own `<user_info>` preamble and injected system reminders), and the `<user_query>` wrapper
  must be matched unanchored because grok appends a `<system-reminder>` block after the closing tag
  inside the same record

## [2.6.5] - 2026-08-21

- fix(agent): the agent reported zero tmux sessions on every machine whose service ran without a
  locale. tmux replaces each non-printable byte in `-F` format output with a literal `_` unless it
  is running in a UTF-8 locale, and `listSessions()` joins its fields with `\x1f` — so under launchd
  and systemd, which start a service with no `LANG` at all, every `list-sessions` line arrived as one
  unsplittable field, `parseSessionLine()` returned null for all of them, and the agent sent an empty
  list forever. Connected, authenticated, ONLINE and blind, with no terminals and no AI sessions in
  the dashboard, and nothing logged to say why. Measured on tmux 3.7b: `LANG=en_US.UTF-8` returns the
  separator intact, `LANG=C` and an unset locale both return `_`. tmux is now spawned with
  `LC_ALL=C.UTF-8` unless the inherited locale is already UTF-8, and the launchd plist and systemd
  unit set it too. Picking a different separator would not have helped — tab and `\x01` are sanitized
  the same way. This was the real cause of the symptom 2.6.4 attributed to the service uid
- fix(agent): `listSessions()` warns once when tmux listed sessions but not one line could be parsed.
  A broken parse and an idle machine were the same empty list, which is what made the bug above cost
  three months
- fix(agent): the first-report log line named only the uid and asserted the agent "is running as a
  different user" — a conclusion, and the wrong one on a machine whose uid was correct and whose
  locale was not. It now reports uid and locale as facts

## [2.6.4] - 2026-08-21

- fix(agent): `install-service --system` run under sudo baked `UserName=root` into the plist.
  `os.userInfo()` reports the EFFECTIVE user, so the boot service ran as root — and tmux keys its
  socket by uid, so a root daemon looked in `/tmp/tmux-0`, found no server, and `listSessions()`
  returned `[]` through a silent catch. The agent connected, authenticated, and reported an empty
  session list forever: online and healthy-looking, but blind, with no terminals and no AI sessions
  anywhere in the dashboard. The service user now comes from `SUDO_USER` when present. An
  already-installed plist keeps its wrong `UserName` until the service is reinstalled
- feat(agent): log what the first tmux report after each connect actually contained —
  `reporting N tmux session(s)`, and when N is 0, the uid it looked under and the fact that a
  different owning user is the likely reason. Silence was indistinguishable from "nothing running"

## [2.6.3] - 2026-08-21

- fix(agent): a missing tmux made the agent silently useless for the rest of its life. `tmuxAvailable()`
  cached a negative answer permanently and `pollTmuxSessions()` returned early with nothing logged, so
  an agent that started before tmux was installed (or with tmux off its PATH) showed ONLINE while
  reporting zero terminal sessions and zero AI sessions — indistinguishable from "nothing is running",
  and unfixable without restarting the daemon. A negative answer is now re-probed after 60s so
  installing tmux self-heals, and the agent logs once, naming the PATH it searched and what breaks

## [2.6.2] - 2026-08-21

- fix(agent): `uninstall-service` could not remove a boot service and reported success anyway.
  `install-service --system` escalates through an interactive sudo, so the normal way to own a
  LaunchDaemon (or a systemd system unit) is to have never been root — but the uninstall path had
  no sudo branch at all: as non-root it printed the sudo commands, removed nothing, and still set
  its `removed` flag, so it exited 0 with no error while the daemon kept running and kept
  restarting at boot. Uninstall now escalates exactly as install does, and when it genuinely
  cannot, it says "Service NOT removed", returns the pending commands, and exits non-zero
- fix(agent): `uninstall-service` now names the leftovers that will restart the agent after the
  service is gone — a cron watchdog (`remove-cron`) or a manually started daemon (`stop`) —
  instead of leaving `status` to surprise you with "running"

## [2.6.1] - 2026-08-21

- fix(agent): double-clicking a word or triple-clicking a line in tmux never reached the system
  clipboard. tmux's own DoubleClick1Pane/TripleClick1Pane defaults call `copy-pipe-and-cancel`
  with no argument, which falls back to the `copy-command` server option — and that was unset, so
  those copies stopped at the tmux paste buffer plus an OSC 52 escape that xterm.js does not act
  on. Both the cowork rc block and the agent now set `copy-command` to the same tool the explicit
  bindings use (pbcopy / wl-copy / xclip / xsel), leaving the defaults' `if-shell` guards intact
- fix(agent): the comment documenting the selection-bypass modifier was wrong on macOS. xterm.js
  uses `isMac ? altKey && macOptionClickForcesSelection : shiftKey`, and that option defaults to
  false — so Shift-drag is Linux-only and macOS had no bypass gesture at all

## [2.6.0] - 2026-08-21

- feat(agent): launch mode — start AI sessions from DevDash, turn-based via `claude -p --resume`
- feat(agent): discover, tail and type into Claude Code and Codex sessions running in tmux
- feat(agent): normalized AiEvent schema with Claude Code and Codex adapters
- feat(agent): derive session status (working / waiting / idle) from the transcript, never the TUI
- fix(agent): project-directory escaping replaced only `/`; Claude Code replaces every
  non-alphanumeric character. Wrong for 10 of 49 real project directories, all containing a dot
- fix(agent): two agents in one folder both resolved to the newest transcript, so one showed the
  other's conversation. Candidates are now filtered by process start time and claimed uniquely
- fix(agent): a launched session's transcript path ignored `CLAUDE_CONFIG_DIR` in the agent's own
  environment, predicting a file that never appeared

## [2.5.0] - 2026-08-20

- feat(agent): resume a browser terminal by name so a session survives a closed tab
- feat(agent): `pty_detach` releases the client PTY without ending the tmux session
- feat(agent): report `active_ptys` on connect so a restarted server can reclaim orphans
- fix(agent): install the system service without prompting when running as root on Linux
- fix(agent): enable lingering so a user service survives the last SSH logout
- fix(agent): `start --daemon` verifies the child survived instead of printing a dead PID

## [2.4.1] - 2026-08-02

- fix(agent): give kind-specific advice for a stale supervisor, guard repair against throws
- feat(agent): make setup-cowork headless/SSH-aware
- fix(agent): make watchdog rewrite atomic, mode-safe, and repair failures visible
- feat(agent): repair a stale cron watchdog after a package rename
- fix(agent): address Task 2 review — cron wording, test isolation, path normalization
- feat(agent): add listSupervisors() to detect every competing supervisor
- fix(agent): extract shared hasCommand, eliminate DEP0190 warning
- docs(agent): 2.4.1 plan — supervisor hygiene

## [2.4.0] - 2026-08-02

- fix(agent): make the clipboard bindings one chain so pbcopy still wins on macOS
- fix(agent): treat the generic vte token as provisional, not final
- feat(agent): warn when a cowork terminal selection can never match
- feat(agent): add Linux clipboard bindings (wl-copy/xclip/xsel)
- fix(agent): rewire Node-side terminal detection onto the shared marker table
- fix(agent): silence /proc walk diagnostics on a failed read
- fix(agent): resolve Linux terminals in the cowork shell gate
- fix(agent): guard PROC_NAMES lookup against prototype-chain collisions
- feat(agent): add /proc process-tree fallback to terminal-markers
- docs(agent): Phase 1 plan — Linux cowork support
- feat(agent): add shared terminal-marker table (terminal-markers.ts)

## [2.3.9] - 2026-07-20

- chore(agent): bump to 2.3.8 (single-instance lock)
- feat(agent): enforce one daemon per server URL with a single-instance lock
- fix(login): use segmented OtpInput for reset-OTP and reset-2FA email code fields
- fix(terminal): make /terminal attach-page mobile detection reactive to resize
- docs(plan): revise Phase 2 plan — client-side T4 (re-audit), add T10 desktop unify, correct T1 at-bottom formula
- fix(mobile-term): flush write-queue before serializing scrollback snapshot (capture the tail)
- fix(terminal): phase-2 a11y — contrast (pill/danger/notes), escape coordination, radiogroup arrow-nav, aria-live status, touch targets, aria-pressed
- fix(terminal): keep desktop settings panel + search inside the fullscreen element; clear search on tab switch; drop dead tab.themeId
- feat(terminal): unify desktop chrome — shared ConnectionPill + settings across both surfaces
- feat(mobile-term): confirm before closing a live session
- feat(mobile-term): user-toggleable key-tap haptics
- feat(mobile-term): font-family choice with ligature option
- fix(mobile-term): gate scrollback restore per page-load (module-level) to stop Peek/Drive remount stacking
- feat(mobile-term): client-side scrollback restore on cold load (xterm serialize + localStorage)
- fix(mobile-term): reconcile background→foreground reattach with onVisible + fix CLOSING-race
- feat(mobile-term): in-buffer search (xterm SearchAddon) with mobile search bar
- fix(mobile-term): flush write-queue before status-line writes to preserve output order
- feat(mobile-term): rAF write-coalescing flow control for heavy output
- fix(mobile-term): correct at-bottom detection formula
- polish(mobile-term): 44px touch target + focus ring for Jump-to-latest pill
- feat(mobile-term): follow-tail Jump-to-latest + pause-follow while scrolled up
- docs: mobile terminal Phase 2 kickoff prompt
- docs(plan): fold Phase 1 audit re-check flags into Phase 2 plan
- fix(mobile-term): apply saved theme+cursor-blink to mobile terminal (audit #1/#2)
- fix(mobile-term): a11y — dialog focus mgmt, aria state, target sizes, theme-label contrast
- style(mobile-term): drawer, pill, lock, orientation, safe-area, reduced-motion
- feat(mobile-term): read-only lock indicator + copy last output/command/screen
- feat(mobile-term): wire drawer, connection pill, fullscreen, theme/font persistence
- feat(mobile-term): settings drawer (font, theme grid, key toggles, screen)
- feat(mobile-term): ConnectionPill with per-state treatment + tap-to-reconnect
- feat(mobile-term): useFullscreen hook with webkit fallback + supported flag
- feat(mobile-term): richer connection states (connecting/disconnected) + forceReconnect
- feat(mobile-term): setTheme on TerminalHandle for runtime theme switching
- feat(mobile-term): KeyChipBar renders only enabled keys
- feat(mobile-term): per-device prefs for theme, keys, cursor-blink, fullscreen hint
- feat(mobile-term): add Home/End/PgUp/PgDn chips + default-enabled key set
- docs(plan): mobile terminal Phase 1 + Phase 2 implementation plans
- docs(spec): phase mobile terminal work; add connection pill, read-only lock, copy/paste to Phase 1
- docs(spec): mobile/iPad terminal settings drawer + themes + fullscreen design

## [2.3.7] - 2026-07-15

- fix(cowork): mouse select/copy/paste no longer strands the shell in copy-mode. 2.3.5 switched the copy verb to tmux's -no-clear variant to keep the selection highlighted after a drag; in tmux that flag also does NOT exit copy-mode, so every drag-select left the pane in copy-mode where keystrokes are copy-mode commands and paste never reaches the shell. Measured: copy-pipe-and-cancel leaves pane_in_mode=0 (back at the shell), copy-pipe-no-clear leaves it 1 (stuck). The verb returns to -and-cancel (copy-selection-and-cancel on Linux), matching tmux's own default semantics, and is now locked by tests. history-limit 100000 and the untouched tmux wheel/double-click defaults from 2.3.5 are kept.

## [2.3.6] - 2026-07-15

- fix(terminals): report the session's LIVE working directory instead of a creation-time snapshot. listSessions now reads #{pane_current_path} from the list-sessions call it already makes, so the folder/path shown in /terminals follows the shell as the user cds — and works for native sessions that carry no DevDash metadata. The @devdash_folder_path option it used to report is written once at session creation and never updated, so it went stale immediately (verified live: it reported the home directory while the shell was in a project subfolder). folderPath also joins the poll's change key, so a bare cd propagates instead of waiting for the 60s resync. list-sessions fields are now \x1f-separated: '|' is legal in both session names and paths, which made a path field unparseable.

## [2.3.5] - 2026-07-15

- feat(cowork): the mouse selection stays highlighted after copying, like a native terminal — copy-pipe-no-clear replaces copy-pipe-and-cancel on drag-release and the keyboard copies (Enter, y). The copy verb is no longer macOS-gated: Linux/Windows now get copy-selection-no-clear carried by OSC 52, while pbcopy stays mac-only (it reaches the pasteboard of the machine the agent runs on and covers Apple Terminal, which has no OSC 52). history-limit 50000 -> 100000. tmux's own defaults for wheel-scroll (copy-mode -e) and double/triple-click word/line copy are deliberately left alone — they already do the right thing and carry if-shell guards that a hand-rolled binding would drop.

## [2.3.4] - 2026-07-15

- fix(agent): stop cowork wrap from killing a colliding tmux session (session ids now keep full entropy in the tmux name, and the failure cleanup only kills a session the agent created); kill_tmux reports the real result instead of always ok; heartbeat detects a half-open socket via pong tracking and forces a reconnect; reconnect uses exponential backoff with jitter instead of a flat 5s lockstep retry

## [2.3.3] - 2026-07-14

- feat(agent): handle `kill_tmux` message — force-kill a tmux session by name (`tmux kill-session`). Backs the Terminals page "kill" action so a live session (native or browser) can actually be terminated from DevDash, instead of only being hidden and re-appearing on the next report.

## [2.3.2] - 2026-07-13

- change(scanner): stop auto-allocating ports. Projects with no detectable port (plain PHP, symfony, static HTML, flutter) are now returned with port: null / portSource: 'none' so the user assigns a port when adding — instead of getting an arbitrary port from 8000 up. url/startCommand are left empty until a port is set.

## [2.3.1] - 2026-07-13

- fix(agent): resolve tmux and other tools under the bare boot PATH — a LaunchDaemon/systemd service starts without /usr/local/bin or Homebrew on PATH, so `tmux` hit ENOENT at boot (cowork wrapping + live-session reporting silently failed). Augment process.env.PATH at startup and emit EnvironmentVariables/PATH in the generated launchd plist.

## [2.3.0] - 2026-07-13

- feat(agent): run_command message for headless start/stop/restart of projects (detached background spawn to a log file, or foreground capture)
- fix(agent): background run_command no longer crashes the agent on a bad cwd, and closes its log fd

## [2.2.1] - 2026-07-07

- fix(agent): copy from wrapped terminals to macOS clipboard via pbcopy

## [2.2.0] - 2026-07-07

- feat(agent): arrow-key terminal picker in setup-cowork; stop pre-ticking current terminal
- feat(agent): checklist.ts — pure state + rendering for arrow-key multi-select
- docs(plan): arrow-key terminal picker for setup-cowork

## [2.1.0] - 2026-07-07

- docs(agent): record end-to-end select/copy verification for app-gated cowork
- refactor(agent): drop unused cowork imports from cli.ts
- feat(agent): rewire setup-cowork — app checklist, tmux install offer, gated block
- feat(agent): cowork.ts — app-gated wrapper block, sanitization, tmux install selection
- docs(plan): app-gated cowork wrapping implementation plan
- build(agent): compile dist for coworkTerminals field + terminal-detect module
- feat(agent): terminal-detect module — enumerate apps, identify current terminal
- feat(agent): add coworkTerminals allowlist to AgentConfig
- docs(spec): make select/copy fix explicit — goal, selection matrix, e2e acceptance
- docs(spec): app-gated cowork wrapping — native terminals by default, pick remote app(s)
- feat(terminal): native model — Cmd+C copies Shift+drag selection; document mouse-on / no-scrollbars

## [2.0.4] - 2026-07-07

- feat(terminal): OSC-52 clipboard so terminal selections reach the clipboard; status line on, RGB truecolor, 50k scrollback

## [2.0.3] - 2026-07-07

- feat(cowork): native-terminal tmux profile — hide status bar, allow-passthrough (Claude Code image paste), remove right-click menu, keep copy/paste

## [2.0.2] - 2026-07-06

- feat(cowork): enable tmux mouse globally on agent connect

## [2.0.1] - 2026-07-06

- feat(cowork): enable tmux mouse (wheel scroll, select, OS clipboard) on attach + wrapper
- fix(auth): guard PIN-hash migration against clobbering a concurrent reset
- fix(auth): hash PINs + reset codes at rest (scrypt), rate-limit reset requests
- fix(auth): secure password reset (emailed 6-digit code, verify-then-set, single-use) + login rate-limiting + light-mode emails
- docs: rewrite .env.example to document all 17 real env vars (Postgres, APP_URL, SMTP, ws, enc key)

## [2.0.0] - 2026-07-06

- docs: clarify cowork session visibility is not gated on adoption (show-all decided)
- chore(cowork): rebuild agent dist for terminal-naming changes
- fix(cowork): terminal naming settings only shows Saved on a successful PATCH
- feat(cowork): Settings → Terminal Naming panel (per-machine template + preview lines)
- feat(cowork): render per-machine terminal names + output preview in list and attach view
- feat(cowork): PATCH /api/machines for per-machine terminal template + preview lines
- feat(cowork): ws-server stores folder/git/created facts + recording-gated preview lines
- feat(cowork): agent reports folder/git/created facts + capture-pane preview per session
- feat(cowork): setup-cowork adopts pre-existing tmux sessions (interactive + --adopt-all/--no-adopt)
- feat(cowork): wrapper + browser-origin wrap stamp folder/path/created/git facts
- feat(cowork): tmux-manager reads folder/created/git options + capturePane preview
- feat(cowork): pure renderTerminalName with token collapse + fallback
- feat(cowork): additive terminal naming/preview columns + machine template columns
- docs: implementation plan for terminal binding wizard + per-machine naming
- docs: design for terminal binding wizard + per-machine naming & preview
- fix(cowork): mobile tab-close on attach page sends pty_close like the primary close
- feat(cowork): deep-linkable attach page with Peek/Drive on desktop and the mobile shell
- fix(cowork): fixedSize grid survives font changes and visibility refits; no raw-mode toggle in Peek
- feat(cowork): Terminal attach props (tmuxSession/readOnly/fixedSize) + shell Peek banner
- feat(cowork): live sessions API + Terminals page with client badges and Peek/Drive
- fix(cowork): serialize per-machine tmux registry writes — overlapping reports duplicated rows
- feat(cowork): ws-server tmux registry upsert, attach relay, no recording for attach clients
- fix(cowork): wrapper uses atomic new-session -A; removeCoworkBlock survives corrupted markers
- feat(cowork): setup-cowork command — marker-bounded tmux wrapper install with fail-open guards
- feat(cowork): agent session poller (tmux_sessions) + pty_open attach routing + cowork config flag
- fix(cowork): tmux sessions intentionally survive agent shutdown; clean up half-created sessions on wrap failure
- feat(cowork): pty-manager tmux attach, browser-origin wrap, session-preserving close semantics
- test(cowork): cover pipe-in-name and empty-name parseSessionLine branches
- feat(cowork): agent tmux-manager — enumerate sessions with client metadata (TDD)
- feat(cowork): additive terminal_sessions registry columns + LiveTerminalSession type
- docs: implementation plan for Phase 2 tmux shared sessions (spec §14)
- fix(mobile-term): PTY survives layout/breakpoint switches — pty_close only on intentional close; touch devices always use mobile shell
- docs: implementation plan for Phase 1 mobile-first terminal (spec §12)
- feat(mobile-term): PWA manifest, icons, viewport-fit=cover + interactive-widget meta
- fix(mobile-term): prune per-tab connection state when tabs close
- feat(mobile-term): TerminalPanel renders MobileTerminalShell on phones
- fix(mobile-term): defer single-tap raw-mode switch so double-tap font reset doesn't also switch modes
- feat(mobile-term): full-screen MobileTerminalShell — keyboard avoidance, pinch font scaling, wake lock, reconnect toast
- fix(mobile-term): composer send fires on pointerup; locked-Ctrl interception restores textarea DOM value
- feat(mobile-term): chat-style TerminalComposer (real textarea = OS dictation works)
- fix(mobile-term): fire chip actions from pointerup — synthesized click is unreliable after preventDefault on touch
- feat(mobile-term): KeyChipBar with sticky/lockable Ctrl and raw byte sequences
- feat(mobile-term): expose imperative TerminalHandle, connection-state callback, visibility reconnect
- docs: revise shared-terminal spec with mobile-first UX (composer + OS dictation, key chips, PWA) and phased rollout; add Phase 1 kickoff prompt
- fix(ci): resolve @indianic scope from private registry; fail deploy before pm2 restart on build failure

## [1.1.1] - 2026-07-05

- fix(agent): init Remote choice must not default to a stale localhost URL
- feat(machines): encrypt stored API keys at rest (AES-256-GCM)

## [1.1.0] - 2026-07-05

- Project folder scanner: agent-side project_scan detects stack, port, and start command for folders requested from the DevDash scanner page

## [1.0.6] - 2026-06-29

- Fix self-update package name; interactive install-service (boot vs login) with sudo prompt

## [1.0.5] - 2026-06-29

- Service-aware status, install-service --system boot mode, publishing pipeline, migration docs

## [1.0.4] - 2026-06-29

- Fix agent status detection; add boot-before-login service option
- Require session + machine ownership to manage machine API keys
- Add installer script for claude Remote Control shell wrapper

## [1.0.3] - 2026-06-10

- Initial release as dialout — full CLI help, restart, config path/reset commands

## [1.0.2] - 2026-06-10

- Initial release as dialout — full CLI help, restart, config path/reset commands

## [1.0.1] - 2026-06-10

- Initial release as dialout — full CLI help, restart, config path/reset commands

## [1.1.3] - 2026-06-10

- Enhanced CLI help with full command reference, added restart, config path, and config reset commands

## [1.0.5] - 2026-05-06

- Add auto-update check and devdash-agent update command

## [1.0.4] - 2026-05-06

- Improved CLI help with examples, modes, and config keys

## [1.0.3] - 2026-05-06

- Add URL-based tunnel for static projects

## [1.0.2] - 2026-05-05

- Add HTTP tunnel support and auto-update check on start

## [1.0.1] - 2026-05-05

- Add HTTP tunnel support and auto-update check on start
