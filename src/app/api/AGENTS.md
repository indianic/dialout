<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# api

## Purpose

Next.js REST route handlers. Next.js holds sessions, DB writes, and authorization; it never talks to agents directly — relays go through `src/lib/daemon-status.ts`. Nested folders are typical App Router leaves (`route.ts` only) and are catalogued here instead of each getting an AGENTS.md.

## Key Files

Route map (each path is `…/route.ts`):

| Path | Role |
|------|------|
| `auth/` | Single action-dispatch: `login`, `verify-2fa`, `enroll-*`, `register`, PIN reset, 2FA reset, `switch-machine`, `add-machine`, `logout`. JWT 30d in HttpOnly `devdash-session`. |
| `projects/` | **Hot path.** `GET` live-checks every port: agent batch if online, else local TCP (`port-check.ts`, 800 ms). Port-less URL projects go through the tunnel. Writes `isRunning`/`lastChecked` back. Merges `projectMachines` overrides. |
| `projects/[id]/` | Project CRUD. |
| `projects/[id]/commands/` | Per-project commands. |
| `projects/[id]/credentials/` | Encrypted credentials (list never returns plaintext). |
| `projects/[id]/credentials/[credId]/reveal/` | Explicit decrypt. |
| `projects/[id]/process/` | Start/stop/restart via agent. |
| `scan/` + `scan/projects/` | Port scan / folder project discovery via agent. |
| `check/[port]/` | Port check. **No session check** today. |
| `browse/` | FS browse; uses `userOwnsMachine`. |
| `machines/` + `machines/[id]/` + `…/api-key/` | Machines and `mch_…` keys (`keyEnc`/`keyHash`). |
| `notes/` + `notes/[id]/` | Notes. **No session check** today. |
| `todos/` + `todos/[id]/` | Todos. **No session check** today. |
| `comments/` | Share comments. |
| `shares/` | Project shares (read-only for non-owners; optional `allowTerminal`). |
| `copy/` | Copy project/resources. |
| `notifications/` | In-app notifications. |
| `services/` + `services/[id]/` | System services. `[id]` **no session check** today. |
| `settings/` | User settings. |
| `profile/` | Profile. |
| `stats/` | Dashboard stats. **No session check** today. |
| `live-sessions/` | Live terminal session list. |
| `terminals/` + `[sessionId]/` + `chunks/` + `recordings/` | Terminals + recordings. Scope by `userId`; accept `machineId` unguarded — do **not** copy this pattern. |
| `ai-sessions/` + `[machineId]/[tmuxName]/` + `capabilities/` | AI transcript/chat + command/MCP discovery. Uses `userOwnsMachine`. |
| `push/subscribe/` | Web-push subscription. |
| `tunnel/[machineId]/[port]/[[...path]]/` | Tunnel passthrough into the ws-server. |

## Subdirectories

All children are route leaves listed above. No nested AGENTS.md.

## For AI Agents

### Working In This Directory

Auth is **not uniform**. Routes that currently have **no session check** and trust the caller: `check/[port]`, `notes/`, `notes/[id]`, `todos/`, `todos/[id]`, `stats/`, `projects/[id]`, `services/[id]`. Adding a check to an existing one is a behavior change — call it out.

A route that *does* check the session can still trust a caller-supplied `machineId`. `src/lib/machine-access.ts` (`userOwnsMachine`) is the guard. Use it on new routes.

Native clients: update `docs/api/openapi.yaml` in the same commit.

`GET /api/projects` is intentionally expensive. Don't add more per-row remote work without measuring.

### Testing Requirements

Most routes are untested at the HTTP layer. Lib helpers they call often are. Don't add a session check "while you're here" without saying so.

### Common Patterns

```ts
const session = await getSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
if (!(await isEnrolled(session.userId))) { /* 2FA required */ }
```

Relay: `import { requestCheck, requestBrowse, … } from '@/lib/daemon-status'`.

## Dependencies

### Internal

`src/lib/*`, especially `auth.ts`, `schema.ts`, `daemon-status.ts`, `machine-access.ts`, `secret-crypto.ts`

### External

`next/server`

<!-- MANUAL: -->
