# Project Process Control (Start / Stop / Restart) — Design

**Date:** 2026-07-13
**Status:** Draft for review
**Sibling spec:** `2026-07-13-project-credentials-vault-design.md` (independent sub-feature)

## Goal

Let a user start, stop, and restart a project's process on its server directly from DevDash, using **user-defined commands** stored as structured fields on the project (pulled out of the free-text `notes`). No runner auto-detection — the user types whatever fits the project (pm2, `npm run`, pnpm, a startup script, `docker compose up`, etc.).

## Scope & non-goals

- **In scope:** structured Start/Stop/Restart command fields + a "run start in background" flag; a headless `run_command` capability in the DevDash agent; a web API + relay to trigger it; process-control buttons on the card, table, and detail views; an "ask for the command, optionally save it" modal when a needed command is missing.
- **Out of scope:** process supervision / auto-restart-on-crash; log streaming UI (logs are written to a file on the server, not surfaced yet); health checks for static/Apache/PHP/server-managed projects (they are up iff the server is up — no controls shown); PID/CPU/memory monitoring.

## Current state

- The project add/edit form has a single `notes` textarea labeled *"NOTES / START COMMAND (credentials, commands, URLs)"* — commands, credentials, and URLs are all free text. This design moves commands into dedicated fields; `notes` becomes plain notes.
- The agent (`dialout`, currently 2.2.1) speaks a websocket message protocol (`packages/devdash-agent/src/websocket.ts`) with types: `auth_ok`, `pong`, `port_scan_request`, `fs_browse`, `project_scan`, `pty_open`, `pty_data`, `pty_resize`, `pty_close`, `http_request`. There is **no** generic "run a command" type — the only way to run arbitrary shell today is an interactive PTY (web terminal).
- The web server relays requests to the agent via helpers in `src/lib/daemon-status.ts` (`requestPortCheck`, `requestUrlCheck`, `requestFsBrowse`, `requestProjectScan`, `isMachineOnline`).
- `dist/` is git-tracked in the agent package and is what npm ships — every agent `src` change must rebuild and commit `dist`, then publish a new version.

**Security note:** because the agent already exposes arbitrary shell via the PTY terminal, adding a headless `run_command` grants **no new capability or trust boundary** — it is the same shell access, non-interactive. Authorization stays at the web API layer (same as terminals).

## Data model

Additive columns on `projects` (`src/lib/schema.ts`), all defaulted so the migration is backward-compatible via `db:push`:

```ts
startCommand: text('start_command').default(''),
stopCommand: text('stop_command').default(''),
restartCommand: text('restart_command').default(''),
runInBackground: boolean('run_in_background').default(true),
```

- `notes` is unchanged in the DB; only its form label/placeholder change (it stops advertising "start command / credentials").
- No automatic migration of existing `notes` content into these fields — users move their commands over manually. (Noted in the release message.)

`Project` type (`src/types/index.ts`) gains the four fields. The `PUT`/`POST` project routes persist them.

## Agent: `run_command`

New module `packages/devdash-agent/src/command-runner.ts` and a `run_command` case in `websocket.ts`.

**Request (web → agent):**
```
{ type: 'run_command', requestId: string, command: string, cwd: string, background: boolean }
```

**Behavior:**
- `background: true` — `child_process.spawn(command, { shell: true, cwd, detached: true, stdio: ['ignore', fd, fd] })` where `fd` is an append file handle to `~/.devdash-agent/logs/project-<sanitized>.log`; then `child.unref()`. Respond immediately with `{ ok: true, pid }`.
- `background: false` (stop/restart-style quick commands) — spawn with captured stdout/stderr and a timeout (e.g. 20s); respond with `{ ok, exitCode, output }` (output truncated to a sane cap).
- `cwd` defaults to the user's home if empty or nonexistent (never fail hard on a bad path — report `{ ok:false, error }`).
- Errors are returned in the response, never thrown across the socket.

**Response (agent → web):** `{ type: 'run_command_result', requestId, ok, pid?, exitCode?, output?, error? }`.

Rebuild + commit `dist`; publish as agent **2.3.0**.

## Web relay

Add to `src/lib/daemon-status.ts`, mirroring `requestPortCheck`:

```ts
export async function requestRunCommand(
  machineId: number,
  args: { command: string; cwd: string; background: boolean }
): Promise<{ ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string } | null>
```

Returns `null` if the machine is offline / no response within timeout.

## Web API

New route `src/app/api/projects/[id]/process/route.ts`:

`POST` body: `{ action: 'start' | 'stop' | 'restart', command?: string, background?: boolean, save?: boolean }`

Logic:
1. `getSession()`; 401 if unauthenticated.
2. Load the project; authorize (owner of the project's machine; shared-with users only if a later decision allows — for now: owner-triggered, consistent with edit rights).
3. Resolve the command for the action:
   - Use `command` from the body if provided (the ask-modal path); else the project's stored `startCommand`/`stopCommand`/`restartCommand`.
   - **restart** with no `restartCommand`: if both start and stop commands exist, run stop then start; otherwise treat as "missing command".
   - If no command resolves → `409 { error: 'no-command', action }` so the client opens the ask-modal.
4. If `save` is true, persist the provided command into the matching project column (and `background` into `runInBackground` for start).
5. Relay via `requestRunCommand(machineId, { command, cwd: project.rootPath, background: action==='start' ? (background ?? project.runInBackground) : false })`. For the stop-then-start restart fallback, issue two relays.
6. Return `{ ok, pid?, output?, error? }` (or 502 if the machine is offline / relay returned null).

## Frontend

**Form (`ProjectModal.tsx`):** new "Process control" section with:
- `START COMMAND` (text) — placeholder `npm run dev` / `pm2 start ecosystem.config.js`
- `STOP COMMAND` (text, optional)
- `RESTART COMMAND` (text, optional)
- `Run start in background` checkbox (default checked)
- The `notes` field label becomes just `NOTES` (drop the "start command / credentials" hint).

**Action buttons (card, table row, detail):** a small `ProcessControls` piece, gated on **agent online** AND the project is **port-based** (has a `port`; not a static/url-only project):
- Project **offline** → **Start** (Play).
- Project **running** → **Stop** (Square) + **Restart** (RotateCw).
- Clicking an action whose command is missing → open the ask-modal (below). Clicking with a command present → call the process API directly.
- After a successful call: toast (`Starting…` / `Stopping…` / `Restarting…`), then re-check the project's port after ~1.5s and refresh its status (reuse the existing status refresh path).

**Ask-&-save modal (`RunCommandModal.tsx`):** shown when an action is triggered with no stored command. Fields: the command (textarea, prefilled with a sensible placeholder for the action), a `Run in background` checkbox (start only), and a `Save to this project` checkbox (default checked). Submit → `POST …/process` with `command`, `background`, `save`; on success, run feedback as above. Same modal serves start/stop/restart, parameterized by action label.

## Error handling

- Agent offline / relay null → toast "Agent offline — can't control this project"; buttons already hidden when offline, this covers races.
- `run_command` returns `ok:false` → toast the error/output snippet.
- Missing command → ask-modal (not an error).
- Bad `rootPath` → agent reports error; surfaced in toast.

## Testing

- Agent: `node:test` unit tests for `command-runner` (background spawn detaches + writes log; foreground captures output + exit code; bad cwd returns error not throw). Follow the package's existing test style.
- Web: `npx tsc --noEmit` + `npm run build`; manual verification checklist (start/stop/restart a real port-based project; ask-modal appears + saves; background survives; static project shows no controls; offline agent hides controls).

## Files touched

- `src/lib/schema.ts` (+4 columns), `src/types/index.ts` (+4 fields)
- `src/app/api/projects/route.ts` + `src/app/api/projects/[id]/route.ts` (persist fields)
- `src/app/api/projects/[id]/process/route.ts` (new)
- `src/lib/daemon-status.ts` (+`requestRunCommand`)
- `packages/devdash-agent/src/command-runner.ts` (new) + `websocket.ts` (+case) + dist rebuild + publish 2.3.0
- `src/components/ProjectModal.tsx` (fields), `src/components/RunCommandModal.tsx` (new)
- `src/components/ProjectCard.tsx`, `src/components/ProjectTable.tsx`, project detail view (control buttons)
