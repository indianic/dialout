<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# ws-server

## Purpose

The **only** process that holds agent sockets. Long-lived Node process (`tsx src/ws-server/index.ts`) on :50052. Exposes WS upgrade paths and a private HTTP relay API that Next.js consumes via `src/lib/daemon-status.ts`. Also implements the HTTP tunnel that rewrites a local dev server under a public path prefix.

Currently a single ~1700-line file. Keep it that way unless you have a concrete split plan — message-type switches, `pendingRequests`, and in-memory maps (`browserConnections`, detach timers, `tmuxUpsertChains`) are tightly coupled.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Entire process: WS upgrades (`/daemon`, `/terminal`, `/dashboard`, `/multiplex`), `handleDaemonMessage`, HTTP relay (`/scan/ /check/ /browse/ /project-scan/ /run-command/ /kill-tmux/`), HTTP tunnel, tmux session upserts, PTY attach/detach/close, AI event fan-out. Kills its own port inline on boot. **Refuses to start** if neither `WS_INTERNAL_TOKEN` nor `JWT_SECRET` is set (a token derived from `''` would be guessable). Binds `127.0.0.1` by default. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Gate new HTTP relay routes behind the same constant-time `X-Internal-Token` compare. These endpoints are unauthenticated remote command execution if exposed to a LAN. Only set `WS_HOST=0.0.0.0` when the ws-server runs on a different host, and firewall it.
- `tmux_sessions` reports per machine are serialized through `tmuxUpsertChains` — overlapping upserts double-insert (no unique constraint) and a stale snapshot's vanish-pass can kill a just-revived session.
- A dropped browser socket **detaches**, it does not kill. `DETACH_GRACE_MS` is 10 minutes. After that, `pty_detach` drops the agent's tmux *client* and leaves the session running. Only `pty_close` kills a cowork-wrapped shell. A session with no tmux behind it has nothing to resume into, so `pty_detach` kills that one. `pty_open` is idempotent — an existing sessionId reattaches.
- `browserConnections` and detach timers are in-memory. On restart the agent reports `active_ptys` and the server answers `pty_detach` for ids it no longer tracks — reclaims node-pty, never ends a tmux session. Version skew is safe both ways.
- Attach connections (`tmuxSession` set) skip recording; the registry row already tracks the session and multiple viewers would duplicate chunks.
- Tunnel: rewrite absolute `/_next/` and `/api/` paths in HTML/JS/CSS; inject a `<head>` script that patches `fetch`, XHR, history, clicks, Navigation API. Rewrite `Location` headers. Strip `content-encoding` (body was decoded). Body cap 10 MB. Styled placeholders for machine-offline / local-server-down.

### Testing Requirements

No vitest coverage of this file. Verify with `npm run ws:start` plus an agent, or by hitting the localhost HTTP relay with `X-Internal-Token`. Don't expose it.

### Common Patterns

New daemon capability path:

agent handler → `packages/dialout/src/websocket.ts` message type → `handleDaemonMessage` case (resolve `pendingRequests` by `requestId`) → exported `request*()` → HTTP route in `server.on('request')` → wrapper in `src/lib/daemon-status.ts` → Next.js API route.

## Dependencies

### Internal

PostgreSQL (`terminalSessions` upserts, etc.), `src/lib/schema.ts` shape, `src/lib/ai-notify.ts` (status transitions).

### External

`ws`, Node `http`, PostgreSQL.

<!-- MANUAL: -->
