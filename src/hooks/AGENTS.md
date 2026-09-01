<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# hooks

## Purpose

Browser-side hooks. The two socket hooks are the **only** supported way for the UI to talk to the ws-server. Do not construct `WebSocket` in a component.

## Key Files

| File | Description |
|------|-------------|
| `useDevDashSocket.ts` | **One socket per browser.** Multiplexes every PTY session plus dashboard events over `/multiplex`. `subscribe(sessionId)` / `subscribeDashboard`, pending-send queue, auto-reconnect. Cookie or `?token=` on upgrade. |
| `useDashboardSocket.ts` | Narrower dashboard-events-only hook: `machine_online`, `machine_offline`, `machine_status_sync`, `port_status`, `notification`, `session_start`, `session_end`. |
| `usePushNotifications.ts` | Web-push subscribe/unsubscribe against `/api/push/subscribe`. Disabled (not broken) when VAPID keys are unset. |
| `useViewportHeight.ts` | Visual viewport height for mobile terminal chrome. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Prefer `useDevDashSocket` when a surface needs both PTY and dashboard events (the multiplex path). Use `useDashboardSocket` only for dashboard-events-only pages.
- The ws-server's `browserConnections` and detach timers are in-memory. A dropped browser socket **detaches**, it does not kill: PTY is kept for `DETACH_GRACE_MS` (10 min). Don't "fix" reconnect by sending `pty_close`.

### Testing Requirements

No dedicated tests here. Changes usually need a running ws-server + agent to verify.

### Common Patterns

Pending-send queue + auto-reconnect. Target the ws-server path prefix (`WS_PATH_PREFIX`, typically `/ws`).

## Dependencies

### Internal

`src/ws-server/` upgrade paths `/multiplex`, `/dashboard`, `/terminal`.

### External

Browser `WebSocket`.

<!-- MANUAL: -->
