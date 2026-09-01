# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is DevDash

DevDash is a self-hosted, multi-user **development control room**. It tracks projects (ports, tech stack, notes, todos, credentials) across multiple machines, live-checks whether each port is open, and — via an agent installed on each developer machine — provides remote terminals (tmux-backed), filesystem browsing, folder-based project discovery, process start/stop/restart, and an HTTP tunnel that exposes any local dev server through a public URL.

The narrative product spec lives in `docs/DEVDASH-GUIDE.md`. Design docs and executed plans are in `docs/superpowers/specs/` and `docs/superpowers/plans/` (dated filenames; read the matching spec before touching a feature it covers).

**Core principle:** the agent connects *outbound* to the server. No inbound ports, no VPN, no port forwarding on developer machines.

## Commands

```bash
npm run dev             # kills :50051, then runs `next dev` + ws-server concurrently
npm run build           # next build
npm run start           # kills :50051, then `next start` + ws-server concurrently
npm run ws:start        # ws-server alone (tsx src/ws-server/index.ts)

npm test                # vitest run  — only matches src/**/*.test.ts
npm run test:watch

npm run pm2:start       # bash scripts/start.sh start  (build first)
npm run pm2:stop | pm2:restart | pm2:logs

npm run db:push         # push schema — LOCAL/DEV ONLY, never against prod
npm run db:generate     # generate migration files
npm run db:migrate
npm run db:studio
```

**Schema changes in production go through `scripts/apply-*.mjs`, not Drizzle.** Each is a standalone idempotent script (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`) run on every deploy against a DB shared with local. `drizzle-kit push` would diff and drop.

**All of them run via one entry point:** `scripts/apply-migrations.mjs` (`npm run db:apply`), which `.gitlab-ci.yml` calls before `npm run build`. It holds the ordered list and **refuses to run — failing the deploy — if any `scripts/apply-*.mjs` on disk is missing from that list**. This replaced a hand-written chain in the CI yaml that had silently drifted: three scripts were never added to it, so their columns existed in production only because someone had run them by hand.

A new column therefore means: edit `src/lib/schema.ts`, write a new `apply-*.mjs`, **and add it to `ORDER` in `scripts/apply-migrations.mjs`**. Forgetting the third step now breaks the deploy loudly at the migration step rather than producing a running app with a missing column. Never add a non-idempotent script there — they run on every single deploy. One-shot scripts (`hash-existing-pins.mjs`) are deliberately not named `apply-*`.

Agent package (`packages/devdash-agent/`) has its own build/test:

```bash
cd packages/devdash-agent
npm run build           # tsc → dist/
npm test                # build + `node --test` over test/*.test.js
```

Two test runners exist and do not overlap: **vitest** covers `src/**/*.test.ts` (web app), **node:test** covers `packages/devdash-agent/test/*.test.js` (agent). Root `npm test` does NOT run agent tests. `vitest.config.ts` mirrors the tsconfig `@/*` → `./src/*` alias, so tests can import app code.

Ports: Next.js on **50051**, ws-server on **50052** — same in dev and prod. Both are force-cleared on start (`scripts/kill-port.js` for the app via `lsof`; the ws-server kills its own port inline at the bottom of `src/ws-server/index.ts`).

## Architecture

Next.js 15 App Router + React 19, PostgreSQL via Drizzle ORM, Tailwind CSS 3, plus a **separate long-lived WebSocket process** and a **CLI agent** distributed as a private npm package.

```
Browser ──HTTP──> Next.js :50051 ──HTTP (localhost, X-Internal-Token)──┐
   │                                                                   │
   └──WS /ws/* (reverse-proxied)──> ws-server :50052 <──WSS /daemon────┴── devdash-agent
                                          │                                (developer machine)
                                     PostgreSQL
```

### The three processes

1. **Next.js app** (`src/app/`) — UI + REST API. Holds sessions, DB writes, authorization. Never talks to agents directly.
2. **ws-server** (`src/ws-server/index.ts`, ~1300 lines, single file) — the only process that holds agent sockets. Exposes WS upgrade paths (`/daemon`, `/terminal`, `/dashboard`, `/multiplex`) and a private HTTP relay API consumed by Next.js.
3. **devdash-agent** (`packages/devdash-agent/`) — CLI daemon on each dev machine. Published to `https://registry.npmjs.org` as `dialout`.

### Next.js ↔ ws-server bridge

`src/lib/daemon-status.ts` is the **only** module allowed to call the ws-server. It posts to `http://localhost:${WS_PORT}` with an `X-Internal-Token` header.

The token is `WS_INTERNAL_TOKEN` or, by default, `sha256(JWT_SECRET)` — derived identically on both sides. The ws-server **refuses to start** if neither secret is set (a token derived from `''` would be guessable), and gates `/scan/ /check/ /browse/ /project-scan/ /run-command/ /kill-tmux/` behind a constant-time compare. It binds `127.0.0.1` by default — these endpoints are unauthenticated remote command execution if exposed to a LAN. Only set `WS_HOST=0.0.0.0` when the ws-server runs on a different host, and firewall it.

When adding a daemon capability the full path is: agent handler → `websocket.ts` message type → ws-server `handleDaemonMessage` case (usually resolving a `pendingRequests` entry by `requestId`) → exported `request*()` in ws-server → HTTP route in ws-server's `server.on('request')` → wrapper in `daemon-status.ts` → Next.js API route.

### Backend — `src/app/api/`

Projects/scan/check, machines + API keys, auth (OTP PIN + TOTP 2FA), notes, todos, comments, shares, copy, notifications, services, settings, profile, browse, live-sessions, terminals (+ recordings, chunks), per-project commands / credentials / process control, AI sessions (`ai-sessions/`, `ai-sessions/[machineId]/[tmuxName]`), web push (`push/subscribe`), and a tunnel passthrough at `tunnel/[machineId]/[port]/[[...path]]`.

`GET /api/projects` live-checks every port on each request: if the machine's agent is online it relays a batched port check through the daemon; otherwise it falls back to a local TCP probe (`src/lib/port-check.ts`, 800 ms). Port-less URL projects are checked by fetching through the tunnel. It also writes `isRunning`/`lastChecked` back to the DB per project. This is intentionally expensive — treat it as the known hot path.

**Every route authenticates, and every client-supplied id is authorized.** Routes call `getSession()`, and the data routes also call `isEnrolled()` to enforce mandatory 2FA at the API layer (not just the Shell UI gate).

A session check alone is not enough: it only proves *some* user. Any route that takes a `machineId`, `projectId`, or row id from the client (path, query, or body) must also run an ownership check. Two modules, split by what is being guarded:

`src/lib/machine-access.ts` — anything that reaches a developer machine through the daemon (port scan, port check, fs browse, tunnel, run-command, terminal and AI session rows):
- `userOwnsMachine(userId, machineId)` — the machine guard. Use this, not a hand-rolled query.
- `listOwnedMachines(userId)` — for `machineId=all` fan-out (see `parseMachineScope` in `machine-scope.ts`).

`src/lib/project-access.ts` — projects and everything hanging off them:
- `isProjectOwner(userId, projectId)` — writes. Creating/updating/deleting a project or its notes, todos, credentials, and quick-launch commands. Falls back to machine ownership for legacy rows with a null `user_id`, which are otherwise reachable from the dashboard but editable by nobody.
- `canReadProject(userId, projectId)` — reads. Owner **or** shared-with, matching the read-only-share rule the UI already applies via its `isOwner` flag. `canAccessProjectCredentials` is an alias.

For a child row (a note, todo, or command id), resolve it to its project first and authorize *that* — the row id says nothing about who may touch it. Scope the final `UPDATE`/`DELETE` to both the row id and the parent id so an id from another project can't be reached through one the caller does own. Prefer `404` over `403` when denying by id, so ids aren't enumerable. `src/lib/__tests__/project-access.test.ts` pins these rules.

Quick-launch commands (`projects/[id]/commands`) deserve extra care: those rows are shell strings the owner later executes on their own machine, so an unauthorized write there is code execution with the owner's click as the trigger.

### Database — `src/lib/schema.ts`

Single Drizzle schema file, camelCase properties → snake_case columns. Tables: `users`, `machines`, `machineApiKeys`, `projects`, `projectMachines`, `projectNotes`, `projectTodos`, `projectCommands`, `projectCredentials`, `projectShares`, `shareComments`, `pendingInvites`, `notifications`, `systemServices`, `terminalSessions`, `terminalChunks`, `userSettings`, `scanHistory`, `pushSubscriptions`.

Notes on the shape:
- Timestamps are `text` columns defaulted to `now()`, not `timestamp`. Keep that convention.
- `users` carries every auth counter inline. The 2FA lockout columns (`twoFactorAttempts`, `twoFactorLockoutUntil`) are deliberately **separate** from the PIN-login ones — login clears the PIN counters on every correct PIN, so sharing them would let a PIN-holder reset the TOTP lockout and brute-force it. Same reasoning splits the 2FA reset codes from the PIN reset codes.
- `projectMachines` maps one project onto additional machines with per-machine port/rootPath overrides; `GET /api/projects` merges these over the owned rows.
- `terminalSessions` doubles as the live tmux registry (`tmuxName`, `isLive`, `origin`, `lastActiveAt`, `lastSeenAt`, folder/branch/preview facts). `lastActiveAt` is tmux activity (stale for idle-but-alive shells); `lastSeenAt` is server receipt time and is the field to use for staleness.
- Secrets (`twoFactorSecretEnc`, `projectCredentials.secretEnc`, `machineApiKeys.keyEnc`) are AES-256-GCM via `src/lib/secret-crypto.ts` and are never returned by list endpoints — only by explicit reveal routes.

### Frontend — `src/app/(dash)/` + `src/components/`

The `(dash)` route group is the app: `/projects`, `/projects/[id]`, `/shared`, `/scanner`, `/terminals`, `/ai`, `/ai/[machineId]/[tmuxName]`, `/services`, `/machines`, `/settings`, `/profile`, `/help`. `src/app/page.tsx` is a 5-line redirect. Outside the group: `/terminal/[machineId]/[name]` (full-screen tmux attach, peek/drive) and `/sessions/[id]` (recording playback) — these need their own `<Suspense>` boundary since they don't inherit the group layout's.

`src/components/dashboard/DashboardContext.tsx` is the single client-side orchestrator: session, projects, shared projects, services, online machine IDs, stats, filters, project CRUD, process actions, terminal dock state, and overlay navigation. Pages consume `useDashboard()` and stay presentational.

Two conventions worth preserving:
- **Overlays are query-param driven** — `?new=1`, `?edit=<id>`, `?delete=<id>`, `?share=<id>`, `?tab=notes`. `GlobalOverlays` renders from the URL, so overlays are linkable and Escape-closable. Don't add local modal booleans.
- **Terminal dock state persists in `sessionStorage`** (`devdash-open-terminals`, `devdash-active-terminal`, `devdash-docked-height`); the projects list view preference persists in `localStorage`.

`Shell.tsx` gates rendering: unauthenticated → `LoginPage`; `requires2faEnrollment` → `TwoFactorWizard` (the API enforces the same rule independently).

48 components live flat in `src/components/`. The app is also a PWA (`public/manifest.webmanifest` + icons, regenerated by `scripts/generate-pwa-icons.js`); `MobileTerminalShell`, `KeyChipBar`, and `mobile-term-prefs.ts` exist for the phone terminal case.

### WebSocket clients — `src/hooks/`

`useDevDashSocket.ts` creates **one** socket per browser and multiplexes every PTY session plus dashboard events over it (`subscribe(sessionId)` / `subscribeDashboard`), with a pending-send queue and auto-reconnect. It targets the ws-server's `/multiplex` path. `useDashboardSocket.ts` is the narrower dashboard-events-only hook (`machine_online`, `machine_offline`, `machine_status_sync`, `port_status`, `notification`, `session_start`, `session_end`). Don't open raw `WebSocket`s in components — go through these.

### Terminals (cowork)

Terminals are tmux-backed so a session survives browser reloads and can be shared between the user's native terminal and the browser. The agent enumerates `tmux list-sessions` and reports `tmux_sessions` snapshots; the ws-server upserts them into `terminalSessions`.

Two ordering/lifetime rules the code depends on:
- `tmux_sessions` reports per machine are serialized through `tmuxUpsertChains` — overlapping upserts double-insert (no unique constraint) and a stale snapshot's vanish-pass can kill a just-revived session.
- A dropped browser socket **detaches**, it does not kill: the PTY is kept for `DETACH_GRACE_MS` (10 min) so the client can reattach with the same `sessionId`. Past the grace period the ws-server sends `pty_detach`, which drops the agent's tmux *client* and leaves the session running — only an explicit `pty_close` (the user closing the terminal) kills a cowork-wrapped shell. A session with no tmux behind it has nothing to resume into, so `pty_detach` kills that one. `pty_open` is idempotent — an existing sessionId reattaches.
- **Browser sessions are resumable by name.** `tmuxSessionName()` is deterministic, so `openSession` checks `tmuxSessionExists(dd-<sessionId>)` first and attaches instead of creating; the tab's startup command is deliberately **not** replayed on that path (it would type `claude` into the running Claude Code session it just rejoined). `TerminalPanel` keeps its tab list in **localStorage**, not sessionStorage, because the ids have to outlive the browser tab that made them. Existence is checked against `list-sessions` and not `tmux has-session`, whose target matching falls back to prefix/fnmatch and would attach `dd-abc` to `dd-abcdef`.
- The ws-server's `browserConnections` and detach timers are in-memory, so a ws-server restart forgets who was watching what. The agent reports `active_ptys` on every connect and the server answers `pty_detach` for ids it no longer tracks — reclaims node-pty processes, never ends a tmux session. Version skew is safe both ways: an old agent ignores `pty_detach` (leaks a client PTY, loses nothing), an old ws-server ignores `active_ptys`.
- `/terminals` splits the registry into **Local** (`origin !== 'browser'`) and **Web** (`origin === 'browser'`) tabs. tmux's status bar is turned off per-session for `dd-*` only (`applyBrowserSessionOptions`) — native sessions keep theirs, since in a real terminal app it's the only indicator there is.

Attach connections (`tmuxSession` set) skip recording; the registry row already tracks the session and multiple viewers would duplicate chunks. Recording chunks are buffered and flushed every 2 s, base64-encoded, and purged by a daily cron against each user's `retentionDays`.

`setup-cowork` writes a guarded block (`# >>> devdash cowork wrapper >>>` … `<<<`) into the user's shell rc so native terminals auto-join tmux. Everything interpolated into that shell script is filtered through `TOKEN_RE` / `ENV_NAME_RE` in `cowork.ts` — rc-file injection defense. Never widen those patterns or interpolate an unsanitized value.

### AI Sessions

`/ai` shows every Claude Code / Codex / Grok session running on a machine as a chat. The trick is
that it **never parses the TUI**: each CLI already persists a structured JSONL transcript, so the
agent tails that and normalises it into one `AiEvent` union. Scraping the alternate-screen TUI
would break on every upstream release.

Three layouts, three different cwd-escaping schemes — none of them guessable, all measured:

| kind | transcript | cwd escaping |
|---|---|---|
| `claude` | `~/.claude/projects/<escaped-cwd>/<uuid>.jsonl` | every non-alphanumeric → `-` |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | none (date-partitioned) |
| `grok` | `~/.grok/sessions/<enc-cwd>/<uuid>/chat_history.jsonl` | `encodeURIComponent` |

`AiKind` is a union and `ADAPTERS` is a `Record<AiKind, AiAdapter>`, so adding a vendor without
writing its adapter is a **compile error**, not a runtime hole.

Grok is the only one that publishes its own pid→session map (`~/.grok/active_sessions.json`), so
its locator has a tier 0 that skips the lsof / cwd+newest heuristics entirely — two grok sessions
in one folder cannot collide the way two Claude ones could. Its transcript is also nested one level
deeper than the others under a fixed filename, so the generic "newest `*.jsonl` in a directory"
tier cannot see it at all and it gets its own walk.

Agent modules: `ai-session-detector` (which pane runs which CLI) → `ai-transcript-locator` (which
file it is writing) → `ai-transcript-tail` (follow it) → `ai-adapters/*` (vendor → `AiEvent`) →
`ai-status` (derive working/waiting/idle) → `ai-sessions` (the seam websocket.ts calls).

Facts the code depends on, all measured rather than assumed:

- **Claude Code's project-directory escaping replaces every non-alphanumeric character**, not just
  `/`. `saava.indianic.in` → `-saava-indianic-in`. Verified against 49 real directories; a
  slash-only rule was wrong for 10 of them.
- **A session's cwd can drift mid-session** (repo ↔ worktree), so a transcript is validated
  against *any* cwd its head mentions, not just the first.
- **Classification is by full argv, never process name.** Claude Code's binary is
  `~/.local/share/claude/versions/<version>` and other agent CLIs rename themselves outright.
- **Claude Code opens/appends/closes its transcript**, so `lsof` finds no holder; other CLIs (grok)
  hold it open, which gives an exact mapping. The locator tries `lsof` first, then falls back to
  cwd + newest, filtered to files written since the process started and **claimed uniquely across
  panes** — two agents in one folder otherwise both resolve to the newest file.

**Launch mode** (`ai-launch.ts`) is turn-based: each message spawns `claude -p --resume <uuid>`
which runs one turn and exits. No long-lived child, an agent restart loses nothing, and the
transcript is the state. Launched sessions render through the same adapters with no special
casing. **Per-tool Allow/Deny is impossible here** — measured against CLI 2.1.238,
`--permission-mode manual` emits no permission event over stream-json and there is no
`--permission-prompt-tool`; `canUseTool` is Agent SDK only. The trust level is chosen once at
launch and `bypassPermissions` is offered by none of the three layers that validate it.

`src/lib/ai-notify.ts` decides when to push. Only `working → waiting_*` fires, with a 2-minute
cooldown, and a first sighting never fires — otherwise every agent reconnect would produce a burst.

### HTTP tunnel

`/{WS_PATH_PREFIX}/tunnel/{machineId}/{port}/...` (port-based) or `.../{machineId}/site/{base64url}/...` (URL-based, for PHP/static vhosts). The ws-server rewrites the response so the tunneled app keeps working under a path prefix: absolute `/_next/` and `/api/` paths are rewritten in HTML/JS/CSS, and an inline script injected after `<head>` patches `fetch`, `XMLHttpRequest.open`, `history.pushState/replaceState`, anchor clicks, and the Navigation API. `Location` headers on redirects are rewritten; `content-encoding` is stripped because the body was decoded. Body cap is 10 MB. A styled placeholder page is returned for "machine offline" and "local server not running".

### Agent — `packages/devdash-agent/src/`

`cli.ts` (commander) is the largest file; `service-installer.ts` handles launchd/systemd install plus the cron watchdog. Commands: `init`, `profiles`, `use <profile>`, `start`, `stop`, `restart`, `status`, `install-service`, `uninstall-service`, `setup-cron`, `remove-cron`, `repair`, `setup-cowork`, `update`, `config show|path|reset|set`.

Modules map 1:1 to daemon message types: `port-scanner`, `fs-browser`, `project-scanner`, `pty-manager`, `tmux-manager`, `command-runner`, `heartbeat`, `websocket`. Config lives at `~/.devdash-agent/config.json`; `single-instance.ts` prevents competing daemons and `checklist.ts`/`repair` diagnose stale supervisors.

The agent is `os: ["darwin", "linux"]` and ships `dist/` — **build before publishing**, and keep `dist/` in sync when reviewing behavior (`src/` is the source of truth).

### Types — `src/types/index.ts`

Shared interfaces for the client: `User`, `Machine`, `SessionInfo`, `Project`, `ProjectFormData`, `ProjectNote`, `ProjectTodo`, `ProjectCredential`, `ShareComment`, `ProjectShare`, `Notification`, `SystemService`, `Stats`, `ScanResult`, `ScannedProject`, `LiveTerminalSession`. These are hand-maintained, not inferred from Drizzle — update both when changing a table the UI reads.

## Auth flow

**Two equivalent credentials, one JWT.** Browsers use the HttpOnly
`devdash-session` cookie; native clients (a Flutter app, a script) send
`Authorization: Bearer <jwt>`. `getSession()` accepts either, Bearer winning
when both are present. A caller receives the raw token in the response body
**only** when it sends `X-DevDash-Client: native` — browsers deliberately never
do, so page scripts still cannot read or exfiltrate a session. The same two
credentials authenticate the WebSocket upgrade (cookie, or `?token=`).

The HTTP contract for native clients is `docs/api/openapi.yaml`. It is
hand-maintained and not generated, so it drifts unless a route change updates
it in the same commit — a shipped mobile app is pinned to it in a way the web
UI never was.

PIN + mandatory TOTP. `POST /api/auth` is a single action-dispatch route: `login`, `verify-2fa`, `enroll-request-code`, `enroll-verify-email`, `enroll-activate`, `register`, `request-reset`, `confirm-reset`, `reset-2fa-request`, `reset-2fa-confirm`, `switch-machine`, `add-machine`, `logout`. Session is a `jose` JWT (30 d) in the HTTP-only `devdash-session` cookie carrying `userId`, `machineId`, `email`, `name`.

Everything is scoped to **user + machine** — switching machines re-mints the JWT. Sharing grants read-only access (comments allowed, optional `allowTerminal`); non-owners must not get edit paths.

Agent auth is separate: `X-API-Key` (`mch_…`) on the `/daemon` upgrade, SHA-256 compared against `machineApiKeys.keyHash`. A 401 there means the key isn't registered, not that the agent is misconfigured.

## Deployment

PM2 runs two apps from `ecosystem.config.cjs`: `$APP_NAME` (`next start -p 50051`, fork mode) and `$APP_NAME-ws` (`tsx src/ws-server/index.ts`). `wait_ready` must stay off — `next start` never emits PM2's ready IPC and PM2 would crash-loop it. GitLab CI overrides `APP_NAME`.

`scripts/start.sh` (behind `npm run pm2:*`) builds if `.next/BUILD_ID` is missing, `pm2 delete`s the old process, force-frees the port with `lsof`, then starts `ecosystem.config.cjs` and `pm2 save`s.

**Pushing to `main` deploys production.** `.gitlab-ci.yml` has a single `deploy_production` job gated on `$CI_COMMIT_BRANCH == "main"`: it SSHes to the server, `git checkout -- . && git clean -fd` (preserving `.env`, `.env.local`, `node_modules`, `.next`, `data`, `venv`), pulls, `npm install`, runs the `apply-*.mjs` migrations, `npm run build`, then `pm2 delete` + restart of both apps. Any commit on `main` — docs included — triggers a full rebuild and process restart. The job is `interruptible` (a newer push cancels an in-flight deploy) and deliberately has no `resource_group`.

Reverse proxy: `/` → 50051, `/ws/` → 50052 with WebSocket upgrade support.

Env (`.env`, see `.env.example`): `DATABASE_URL` and `JWT_SECRET` required; `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WS_URL`, `PORT`, `WS_PORT`, `WS_HOST`, `WS_SERVER_URL`, `WS_PATH_PREFIX`, `WS_INTERNAL_TOKEN`, SMTP (`SMTP_HOST/PORT/USER/PASS`, `FROM_EMAIL`, `FROM_NAME`), and web push (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) optional. Push is disabled, not broken, when the VAPID pair is unset; the same pair must be used in dev and prod or existing subscriptions stop working.

## Setup

```bash
createdb devdash
cp .env.example .env      # set DATABASE_URL + JWT_SECRET
npm install
npm run db:push
npm run dev               # http://localhost:50051
```

Agent, on each dev machine:

```bash
npm install -g dialout
devdash-agent init        # server URL + mch_… API key from Settings → Machines
devdash-agent install-service
devdash-agent status
```

## Conventions

- Frontend uses relative API URLs (`/api/...`) — never hardcode a host.
- Comments in this codebase explain *why* a non-obvious choice was made (ordering guarantees, lockout separation, fork mode, 127.0.0.1 binding). Preserve them when refactoring; they encode bugs already paid for.
- New agent capability = new message type on both ends + a `daemon-status.ts` wrapper. Don't let a Next.js route open a socket to an agent.
- Secrets never leave the server unencrypted except through an explicit reveal route.
