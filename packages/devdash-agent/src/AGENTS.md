<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# src

## Purpose

Agent implementation. Modules map 1:1 to daemon WebSocket message types. `cli.ts` is the largest file (commander). `websocket.ts` is the seam the server talks to. AI sessions are a pipeline, not a TUI scraper: detector → locator → tail → adapters → status → `ai-sessions` (the websocket seam).

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Package entry compiled to `dist/index.js`. |
| `cli.ts` | commander CLI: init/profiles/start/stop/service/cron/repair/cowork/update/config. |
| `websocket.ts` | Outbound WSS `/daemon`, message dispatch, pending requests. |
| `config.ts` | `~/.devdash-agent/config.json` load/save, profiles. |
| `single-instance.ts` | Prevents competing daemons. |
| `service-installer.ts` | launchd / systemd install + cron watchdog. |
| `checklist.ts` | `repair` / status diagnostics for stale supervisors. |
| `heartbeat.ts` | Periodic heartbeat to the server. |
| `port-scanner.ts` | Local port scan. |
| `fs-browser.ts` | Directory listing for the UI browser. |
| `project-scanner.ts` | Folder-based project discovery. |
| `command-runner.ts` | Run a command (process control, one-shots). |
| `pty-manager.ts` | node-pty sessions. `pty_open` is idempotent; `pty_detach` vs `pty_close` — see root CLAUDE.md. |
| `tmux-manager.ts` | `tmux list-sessions` snapshots, attach, `applyBrowserSessionOptions` (status bar off for `dd-*` only). Existence via `list-sessions`, **not** `has-session`. |
| `cowork.ts` | Writes the guarded `# >>> devdash cowork wrapper >>>` block. Interpolations filtered by `TOKEN_RE` / `ENV_NAME_RE`. |
| `ssh-local-network.ts` | macOS only. Writes a guarded `Host * / ConnectTimeout` block at the END of `~/.ssh/config` — macOS Local Network Privacy judges the tmux **server**, so LAN ssh dies with "Undefined error: 0" in every tmux session; ConnectTimeout picks ssh's ungated BSD-socket connect. End placement matters (ssh keeps the first value per keyword). |
| `terminal-detect.ts` / `terminal-markers.ts` | Detect terminal type / markers for naming. |
| `has-command.ts` | PATH lookups (`tmux`, vendor CLIs). |
| `update-check.ts` | Self-update check against the private registry. |
| `ai-session-detector.ts` | Which pane runs which CLI — **full argv**, never process name. |
| `ai-transcript-locator.ts` | Which file it is writing. `lsof` first, then cwd+newest since process start, claimed uniquely across panes. Grok has a tier 0 pid→session map (`~/.grok/active_sessions.json`) and a nested `chat_history.jsonl` that the generic newest-`*.jsonl` walk cannot see. Claude Code cwd escaping: **every non-alphanumeric → `-`**, not just `/`. Validate transcript against *any* cwd the head mentions (cwd can drift). |
| `ai-transcript-tail.ts` | Follow the JSONL file. |
| `ai-status.ts` | Derive working / waiting_* / idle. |
| `ai-sessions.ts` | Seam `websocket.ts` calls. |
| `ai-launch.ts` | Turn-based launch: `claude -p --resume <uuid>` one turn and exit. Trust level chosen once; no per-tool Allow/Deny (CLI 2.1.238 `--permission-mode manual` emits no permission event over stream-json). |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `ai-adapters/` | Vendor JSONL → `AiEvent`. `ADAPTERS: Record<AiKind, AiAdapter>` — missing adapter is a compile error (see `ai-adapters/AGENTS.md`) |
| `ai-capabilities/` | Slash-commands + MCP discovery per vendor, with redaction (see `ai-capabilities/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Adding a vendor: extend `AiKind`, add adapter **and** (if needed) locator walk + capabilities module. Adapter-only is a compile error if `ADAPTERS` is exhaustive; locator/capabilities are runtime holes if skipped.
- `pty_detach` on an old agent is ignored (leaks a client PTY, loses nothing). Don't "fix" that by sending `pty_close`.
- Never widen `TOKEN_RE` / `ENV_NAME_RE` in `cowork.ts`.

### Testing Requirements

Tests live in `../test/*.test.js` and import compiled output — `npm test` in the package builds first.

### Common Patterns

One module, one message type, no shared global besides config + the websocket send function.

## Dependencies

### Internal

`ai-adapters/`, `ai-capabilities/`. Server counterpart: `src/ws-server/index.ts`.

### External

`commander`, `node-pty`, `ws`, `smol-toml`; system `tmux`, `lsof`.

<!-- MANUAL: -->
