# DevDash — Developer's Complete Guide

**Version 3.0** | **Last updated: August 2026**

---

## The Story Behind DevDash

### The Problem

Every developer knows the chaos. You're juggling 8 projects across 2 machines. One runs on port 3000, another on 5173, a PHP project on localhost, and you can't remember which port the staging API is on. Your colleague asks "is the frontend running?" and you SSH into the server just to check. You scribble notes on sticky notes, forget credentials, and lose track of what's deployed where.

The daily routine looks something like this:

```
$ lsof -i :3000    # is anything running here?
$ lsof -i :5173    # what about here?
$ ssh build-box      # let me check the staging box
$ pm2 list         # what's running there?
$ cat .env         # what was the database password again?
```

Multiply this by every developer on the team. Now multiply by every project. The cognitive overhead is enormous — and it's entirely preventable.

### The Idea

What if there was a single dashboard that:

- **Shows every project** across every machine, with live status
- **Scans ports** to discover what's running — on any machine, from anywhere
- **Opens a terminal** to any machine directly from the browser
- **Lets you preview** any local dev server through a public URL
- **Stores notes, todos and credentials** per project, so context travels with the project
- **Reads your AI coding sessions** — Claude Code, Codex, Grok — as chat
- **Shares projects** between team members with comments and notifications

DevDash started as a simple port monitor and grew into a complete development command center. It bridges the gap between "my laptop" and "the cloud" — making local development visible, shareable, and manageable from anywhere, including from your phone.

---

## What is DevDash?

DevDash is a **self-hosted, multi-user dashboard** for managing development projects across machines. It combines project tracking, real-time port monitoring, remote terminal access, HTTP tunneling, AI session monitoring, and team collaboration into a single web interface — plus a native iOS and Android app.

Think of it as **your team's development control room** — one URL where everyone can see what's running, connect to any machine, and keep track of everything.

### Architecture at a Glance

```
                     ┌─────────────────────────────────┐
                     │  DevDash Server (VPS/Cloud)      │
                     │                                  │
                     │  Next.js App     (:50051)        │
                     │  WebSocket Hub   (:50052)        │
                     │  PostgreSQL DB                   │
                     └──────┬──────────────────┬────────┘
                            │ WSS              │ HTTPS
                            ▼                  ▼
                   ┌────────────────┐   ┌──────────────┐
                   │ DevDash Agent  │   │   Browser    │
                   │ (your machine) │   │  or Mobile   │
                   │                │   │              │
                   │ Port Scanner   │   │ Dashboard    │
                   │ tmux Terminals │   │ Terminal UI  │
                   │ AI Transcripts │   │ AI Chat      │
                   │ File Browser   │   │ Live Preview │
                   │ HTTP Tunnel    │   │ Notes/Todos  │
                   └────────────────┘   └──────────────┘
```

**Key principle:** The DevDash Agent on your machine connects *outbound* to the server. No firewall rules, no port forwarding, no VPN. If you can reach the internet, you can connect.

### The three processes

| Process | Location | Responsibility |
|---------|----------|----------------|
| **Next.js app** | `src/app/` | UI and REST API. Holds sessions, DB writes, authorization. Never talks to agents directly. |
| **ws-server** | `src/ws-server/index.ts` | The only process holding agent sockets. Exposes WS upgrade paths and a private HTTP relay consumed by Next.js. |
| **devdash-agent** | `packages/devdash-agent/` | CLI daemon on each dev machine. Published as `dialout`. |

---

## Features

### 1. Project Dashboard

The main view shows all your projects organized by status:

- **LIVE** (green) — Port is open, dev server is running
- **OFFLINE** (red) — Port is closed, nothing running
- **STATIC** (orange) — URL-based project (PHP, static sites) with webserver status check
- **ARCHIVED** — Shelved projects, dimmed and out of the way

Each project card shows a status dot, port numbers and URL, tech-stack pills, tags, description and notes preview, a start date with a "days ago" counter, and quick actions: Preview, Edit, Delete, Notes, Todos, Terminal, Share.

`GET /api/projects` live-checks every port on every request. If the machine's agent is online the checks are batched through the daemon; otherwise it falls back to a local TCP probe with an 800 ms timeout. Port-less URL projects are checked by fetching through the tunnel. This is intentionally the expensive path — it is what makes the dashboard true rather than cached.

**Multi-machine projects.** A project can map onto additional machines with per-machine port and root-path overrides, merged over the owned row at read time.

### 2. Port Scanning & Discovery

Discover what's running on any machine without SSH:

- **Range Scanner** — Scan ports 3000–9999 (configurable) to find running services
- **Single Port Check** — Quick check if a specific port is open
- **Daemon-powered** — Scans run on YOUR machine via the agent, not the server
- **Auto-exclude** — Known project ports and registered system services are filtered out
- **Quick Add** — Found an unknown port? One click to add it as a project

**Folder-based project discovery.** Point the scanner at a directory tree and it walks it for recognisable projects — reading `package.json`, detecting the runner and framework — and offers to register what it finds.

### 3. Remote Terminals (tmux-backed)

Full interactive terminal access to any connected machine, directly in the browser or on your phone.

Terminals are **tmux-backed**, which is what makes them survive things a web shell cannot:

- **Close the browser, keep the session.** The PTY is held for a 10-minute grace period; reconnecting with the same session id reattaches exactly where you were.
- **A dropped socket detaches, it does not kill.** Past the grace period the server drops the agent's tmux *client* and leaves the session running. Only explicitly closing a terminal kills it.
- **Resumable by name.** Session names are deterministic, so reopening a tab attaches to the existing session rather than creating a duplicate. The tab's startup command is deliberately *not* replayed on that path — it would type `claude` into the Claude Code session you just rejoined.
- **Cowork.** `devdash-agent setup-cowork` writes a guarded block into your shell rc so terminals you open natively join the same tmux. Your laptop terminal and the browser are the same session.

Also: multiple tabs, quick-launch commands saved per project, resize-to-window, session recording with timeline playback at `/sessions/<id>`, and configurable retention (7/15/30 days).

The `/terminals` page splits the registry into **Local** (started natively) and **Web** (opened by the browser) tabs.

### 4. AI Sessions

Every Claude Code, Codex and Grok session running on any of your machines, rendered as chat.

**It never parses the terminal UI.** Each CLI already persists a structured JSONL transcript; the agent tails that file and normalises it into a single event type. Scraping the alternate-screen TUI would break on every upstream release.

| Vendor | Transcript location | cwd escaping |
|--------|--------------------|--------------|
| `claude` | `~/.claude/projects/<escaped-cwd>/<uuid>.jsonl` | every non-alphanumeric → `-` |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | none (date-partitioned) |
| `grok` | `~/.grok/sessions/<enc-cwd>/<uuid>/chat_history.jsonl` | `encodeURIComponent` |

- **One list across every machine** — see which agents are working, waiting, or idle
- **Launch mode** — start a new session from the phone. Each message runs one turn and exits, so an agent restart loses nothing; the transcript is the state.
- **Push when it needs you** — a notification fires only on `working → waiting`, with a two-minute cooldown, and never on a first sighting
- **Commands and MCP discovery** — see the slash commands and MCP servers a session can actually reach

Per-tool Allow/Deny is **not** offered: the CLI emits no permission event over stream-json, so the trust level is chosen once at launch.

### 5. HTTP Tunnel (Live Preview)

Access any local dev server through a public URL:

```
Your machine: http://localhost:3000
Public URL:   https://devdash.yourserver.com/ws/tunnel/1/3000/
```

- **Port-based tunneling** — any localhost port
- **URL-based tunneling** — named vhosts for PHP and static sites (`http://mysite.localhost/`)
- **Smart rewriting** — absolute `/_next/` and `/api/` paths rewritten in HTML, JS and CSS
- **Navigation interception** — an injected script patches `fetch`, `XMLHttpRequest.open`, `history.pushState/replaceState`, anchor clicks and the Navigation API, so SPA routing works
- **Redirect handling** — `Location` headers rewritten; `content-encoding` stripped because the body was decoded
- **Styled placeholders** — distinct pages for "machine offline" and "local server not running"
- **10 MB body cap**

### 6. File Browser

Browse the filesystem of any connected machine — directory tree navigation, a path picker for project roots and terminal sessions. Listing only; no file content is read.

### 7. Notes, Todos & Credentials (Per Project)

Keep context attached to projects, not scattered across tools.

**Notes** — markdown editor with live preview, code blocks with syntax highlighting, auto-title from the first line, tags, archiving.

**Todos** — Low/Medium/High priority, done/undone, archiving, per-project scoping.

**Credentials vault** — per-project secrets encrypted at rest with AES-256-GCM. Never returned by list endpoints; only by an explicit reveal route, and gated behind Face ID / biometrics in the mobile app.

### 8. Process Control

Start, stop and restart a project's dev server from the browser or the phone, using commands you saved against the project. A restart with no stored restart command composes the stop and start commands instead.

Quick-launch commands are shell strings the owner later executes on their own machine, so writes to them are authorized as strictly as anything in the system.

### 9. Project Sharing & Collaboration

Work together without sharing SSH keys:

- **Share projects** with team members by email
- **Invite unregistered users** — they get access when they sign up
- **Read-only access** — shared users can view but not modify
- **Optional terminal grant** — share terminal access explicitly, per share
- **Comments** — threaded discussion on shared projects
- **Notifications** — in-app bell plus web push
- **Copy projects** — copy a shared project to your own machine

### 10. System Services Registry

Register system-level services per machine — PostgreSQL, Redis, Nginx — with their ports. Registered services are excluded from port scanning so they don't show up as unknown findings.

### 11. Multi-Machine Management

- **Register machines** — laptop, desktop, server, VM
- **Switch machines** — dropdown in the header; switching re-mints the session
- **Online/offline status** — real-time per machine
- **API keys** — per-machine `mch_…` keys, SHA-256 compared server-side, shown once

### 12. Mobile App (iOS & Android)

A native app built with Expo, covering sessions, projects, terminals, AI chat, machines and settings.

- Real tmux terminals on the phone, with a key-chip bar for keys a soft keyboard lacks
- AI sessions as chat, with a composer shared with the web app
- Biometric gate on credential reveal
- Web push notifications
- **Configurable server URL** — the app asks for your server on first launch and can be repointed from Settings, so anyone can run it against their own DevDash

### 13. Themes & PWA

Full dark mode (default) and light mode, with system detection. Every text token is contrast-measured against its own background. The web app is also an installable PWA.

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- A server/VPS for hosting (or run locally)

### Server Setup

```bash
# 1. Clone the repository
git clone <repo-url> && cd devdash

# 2. Create database
createdb devdash

# 3. Configure environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/devdash
#   JWT_SECRET=your-secret-key
#   SMTP credentials (optional, for email)
#   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (optional, for web push)

# 4. Install dependencies
npm install

# 5. Push database schema
npm run db:push

# 6. Start development server
npm run dev
# Opens at http://localhost:50051

# 7. For production
npm run build && npm run pm2:start
```

### Agent Setup (on each developer machine)

```bash
# 1. Add the private registry

# 2. Install globally
npm install -g dialout

# 3. Configure
devdash-agent init
# Enter server URL: wss://devdash.yourserver.com
# Enter API key: mch_xxxxxxxxxxxxxxxx
# (Get your API key from Settings → Machines → Add Machine)

# 4. Install as a service so it survives reboots
devdash-agent install-service

# 5. Verify
devdash-agent status

# 6. Optional — join your native terminals to the same tmux
devdash-agent setup-cowork
```

### First Login

1. Open `https://devdash.yourserver.com`
2. Choose **Register** and enter your name, email, machine name, and a 4-digit PIN
3. **Enrol in two-factor authentication.** This is mandatory and enforced at the API layer, not just in the UI — scan the QR code with an authenticator app and confirm a code.
4. Log in with your email, PIN, and a TOTP code
5. Click **+ ADD PROJECT**, or **SCAN** to discover what's already running

---

## Agent CLI Reference

```bash
devdash-agent init                  # Interactive setup
devdash-agent profiles              # List configured server profiles
devdash-agent use <profile>         # Switch active profile
devdash-agent start                 # Run in foreground
devdash-agent start --daemon        # Run in background
devdash-agent stop                  # Stop background process
devdash-agent restart               # Stop and start
devdash-agent status                # Show connection state
devdash-agent install-service       # Install as OS service (launchd/systemd)
devdash-agent uninstall-service     # Remove OS service
devdash-agent setup-cron            # Install the watchdog cron entry
devdash-agent remove-cron           # Remove the watchdog
devdash-agent repair                # Diagnose stale supervisors and fix them
devdash-agent setup-cowork          # Join native terminals to DevDash tmux
devdash-agent update                # Self-update from the registry
devdash-agent config show           # Print configuration
devdash-agent config path           # Print the config file location
devdash-agent config reset          # Reset to defaults
devdash-agent config set <k> <v>    # Update a config value
devdash-agent --version
```

Supported platforms: **macOS and Linux**. Node 18+.

### Configuration File

Location: `~/.devdash-agent/config.json`

```json
{
  "serverUrl": "wss://devdash.yourserver.com",
  "apiKey": "mch_xxxxxxxxxxxxxxxx",
  "scanPorts": [3000, 3001, 4200, 5173, 8080, 9000],
  "scanRange": { "from": 3000, "to": 9000 },
  "heartbeatInterval": 30000
}
```

A single-instance lock prevents two daemons competing for the same profile.

### Auto-Update

The agent checks for updates on start. When a newer version exists:

```
╔══════════════════════════════════════════════════════════╗
║  Update available!                                       ║
║  Current: 2.7.3        Latest: 2.7.4                     ║
║  Run:  devdash-agent update                              ║
╚══════════════════════════════════════════════════════════╝
```

### macOS note — LAN git/ssh inside tmux

macOS Local Network Privacy judges the **tmux server** as the responsible process. One tmux server serves every session, so a denied server breaks `ssh` and `git` to LAN hosts in *all* of them. The agent writes a guarded `ConnectTimeout` block at the end of `~/.ssh/config`, which switches ssh off the gated network path. The real cure is granting tmux access under System Settings → Privacy & Security → Local Network.

---

## API Reference

38 routes. **Every route authenticates, and every client-supplied id is authorized** — a session proves *some* user, so any route taking a `machineId`, `projectId` or row id also runs an ownership check. Data routes additionally enforce 2FA enrolment at the API layer.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth` | Action dispatch (see below) |
| GET | `/api/auth` | Get current session |
| GET | `/api/me` | Current user, machines, active machine |
| POST | `/api/profile` | Update profile |

New machines are registered through `POST /api/auth` with the `add-machine` action, not through `/api/machines`.

`POST /api/auth` actions: `login`, `verify-2fa`, `enroll-request-code`, `enroll-verify-email`, `enroll-activate`, `register`, `request-reset`, `confirm-reset`, `reset-2fa-request`, `reset-2fa-confirm`, `switch-machine`, `add-machine`, `logout`.

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/DELETE | `/api/projects` | List (with live status) / create / bulk delete |
| GET/PUT/DELETE | `/api/projects/[id]` | Single project |
| GET/POST/PUT/DELETE | `/api/projects/[id]/commands` | Quick-launch commands |
| GET/POST/PUT/DELETE | `/api/projects/[id]/credentials` | Credentials vault |
| POST | `/api/projects/[id]/credentials/[credId]/reveal` | Decrypt one secret |
| POST | `/api/projects/[id]/process` | Start / stop / restart |

### Scanning & Discovery
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan` | Scan port range via daemon |
| POST | `/api/scan/projects` | Walk a folder tree for projects |
| GET | `/api/check/[port]` | Check a single port |
| POST | `/api/browse` | Browse a machine's filesystem |

### AI Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/ai-sessions` | Every AI session across machines / launch a new one |
| POST/DELETE | `/api/ai-sessions/[machineId]/[tmuxName]` | Send a message / end the session |
| GET | `/api/ai-sessions/[machineId]/[tmuxName]/capabilities` | Commands + MCP servers |

### Terminals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/terminals` | List / create session |
| GET/PUT/DELETE | `/api/terminals/[sessionId]` | Inspect / update / kill |
| GET | `/api/terminals/[sessionId]/chunks` | Recorded I/O |
| GET | `/api/terminals/recordings` | List recordings |
| GET | `/api/live-sessions` | Live tmux registry |

### Machines, Sharing, Misc
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/machines` | List machines with online status |
| PATCH | `/api/machines` | Update terminal naming / preview preferences |
| PATCH | `/api/machines/[id]` | Show or hide a machine |
| GET/POST/DELETE | `/api/machines/[id]/api-key` | List, generate, revoke API keys |
| GET/POST | `/api/notes`, `/api/todos` | List / create |
| PUT/DELETE | `/api/notes/[id]`, `/api/todos/[id]` | Update / delete |
| GET/POST/DELETE | `/api/comments` | Project comments |
| GET/POST/DELETE | `/api/shares` | Project shares |
| GET/POST | `/api/notifications` | List / mark read |
| GET/POST/DELETE | `/api/push/subscribe` | Manage web-push subscriptions |
| POST | `/api/copy` | Copy a shared project |
| GET/POST | `/api/services` | List / register a system service |
| DELETE | `/api/services/[id]` | Remove a service |
| GET/PUT | `/api/settings` | User preferences |
| GET | `/api/stats` | Dashboard counters |
| ANY | `/api/tunnel/[machineId]/[port]/[[...path]]` | Tunnel passthrough |

The HTTP contract for native clients is `docs/api/openapi.yaml`. It is **hand-maintained**, so a route change must update it in the same commit — a shipped mobile app is pinned to it in a way the web UI never was.

---

## WebSocket Protocol

### Connection Endpoints

| Path | Purpose | Auth |
|------|---------|------|
| `/daemon` | Agent connection | `X-API-Key` header |
| `/terminal` | Browser terminal | cookie or `?token=` |
| `/dashboard` | Real-time updates | cookie or `?token=` |
| `/multiplex` | Combined terminal + dashboard | cookie or `?token=` |

Browsers open **one** socket and multiplex every PTY plus dashboard events over it.

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `heartbeat` / `pong` | agent ↔ server | Keep-alive |
| `port_scan_request` / `port_scan_result` | ↔ | Scan ports |
| `project_scan_request` / `project_scan_result` | ↔ | Walk folders for projects |
| `fs_browse` / `fs_list` | ↔ | Directory listing |
| `pty_open` / `pty_data` / `pty_resize` / `pty_close` | ↔ | Terminal I/O |
| `pty_exit` / `pty_error` | agent → server | Process ended or failed |
| `pty_detach` | server → agent | Drop the tmux client, keep the session |
| `active_ptys` | agent → server | Reported on connect so the server can reclaim orphans |
| `tmux_sessions` | agent → server | Live session registry snapshot |
| `kill_tmux_result` | agent → server | Session terminated |
| `run_command_result` | agent → server | Process control result |
| `ai_session_list` / `ai_session_events` | agent → server | AI transcripts |
| `ai_session_created` / `ai_session_deleted` | agent → server | Launch-mode lifecycle |
| `ai_capabilities` | agent → server | Slash commands + MCP servers |
| `http_request` / `http_response` | ↔ | Tunnel |
| `machine_online` / `machine_offline` | server → browser | Agent presence |
| `port_status` / `notification` | server → browser | Live dashboard updates |
| `session_start` / `session_end` | server → browser | Terminal lifecycle |

**Two ordering rules the code depends on.** `tmux_sessions` reports are serialized per machine — overlapping upserts double-insert, and a stale snapshot's vanish-pass can kill a just-revived session. And version skew is safe both ways: an old agent ignores `pty_detach`, an old server ignores `active_ptys`.

---

## Database Schema

PostgreSQL with Drizzle ORM. 19 tables.

| Table | Purpose |
|-------|---------|
| `users` | Accounts, PIN, TOTP secret, auth counters |
| `machines` | Registered machines per user |
| `machine_api_keys` | Agent authentication keys (encrypted) |
| `projects` | Project definitions with port, URL, tech stack |
| `project_machines` | Extra machines per project, with port/path overrides |
| `project_notes` | Markdown notes |
| `project_todos` | Todos with priority |
| `project_commands` | Quick-launch commands |
| `project_credentials` | Encrypted per-project secrets |
| `project_shares` | Sharing relationships |
| `share_comments` | Comments on shared projects |
| `pending_invites` | Invitations for unregistered users |
| `notifications` | Share/comment/AI notifications |
| `push_subscriptions` | Web-push endpoints |
| `system_services` | System service port registry |
| `terminal_sessions` | Session metadata + live tmux registry |
| `terminal_chunks` | Recorded terminal I/O |
| `user_settings` | Recording preferences, retention |
| `scan_history` | Port scan results log |

Notes on the shape:

- Timestamps are `text` columns defaulted to `now()`, not `timestamp`.
- The 2FA lockout counters are deliberately **separate** from the PIN ones. Login clears the PIN counters on every correct PIN, so sharing them would let a PIN-holder reset the TOTP lockout and brute-force it.
- `terminal_sessions.lastActiveAt` is tmux activity and goes stale on idle-but-alive shells; `lastSeenAt` is server receipt time and is the field to use for staleness.
- Secrets (`twoFactorSecretEnc`, `projectCredentials.secretEnc`, `machineApiKeys.keyEnc`) are AES-256-GCM.

### Migrations in production

Production schema changes go through `scripts/apply-*.mjs`, not Drizzle — each idempotent, all run from `scripts/apply-migrations.mjs` (`npm run db:apply`) before every build. That entry point **refuses to run if any `apply-*.mjs` on disk is missing from its ordered list**, which is what stops the CI chain silently drifting. A new column means: edit `src/lib/schema.ts`, write a new `apply-*.mjs`, and add it to `ORDER`.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15.3, React 19.1, Tailwind CSS 3.4 |
| Backend | Next.js App Router (API routes) |
| Database | PostgreSQL + Drizzle ORM 0.44 |
| Real-time | WebSocket (`ws` 8.20) |
| Terminal | node-pty 1.2 + xterm.js, tmux-backed |
| Auth | JWT (`jose` 6), TOTP (`otplib` 12 — pinned, v13 breaks) |
| Encryption | AES-256-GCM (`src/lib/secret-crypto.ts`) |
| Push | `web-push` 3.6 (VAPID) |
| Email | Nodemailer 8 + SMTP |
| Mobile | Expo SDK 57, React Native 0.86, expo-router, zustand, TanStack Query |
| Agent CLI | Commander 12, `smol-toml` |
| Shared code | `@dialout/shared` (types + pure functions) |
| Tests | vitest (web + shared), `node:test` (agent) |
| Process Manager | PM2 |

---

## Production Deployment

### PM2

```bash
npm run build
npm run pm2:start    # Starts Next.js (:50051) and the WS server (:50052)
npm run pm2:logs
npm run pm2:restart
```

`wait_ready` must stay off — `next start` never emits PM2's ready IPC and PM2 would crash-loop it.

### Reverse Proxy (Apache/Nginx)

- `/` → `localhost:50051` (Next.js app)
- `/ws/` → `localhost:50052` (WebSocket server, with upgrade support)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL |
| `NEXT_PUBLIC_WS_URL` | No | Public WebSocket URL |
| `PORT` / `WS_PORT` | No | Defaults 50051 / 50052 |
| `WS_HOST` | No | Interface the ws-server binds to (default `127.0.0.1`) |
| `WS_PATH_PREFIX` | No | Tunnel path prefix (default `/ws`) |
| `WS_INTERNAL_TOKEN` | No | Gates privileged ws-server relay endpoints (default: derived from `JWT_SECRET`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | No | Email |
| `FROM_EMAIL` / `FROM_NAME` | No | Email identity |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | No | Web push. Use the same pair in dev and prod or existing subscriptions stop working. |

---

## Security

- **PIN + mandatory TOTP.** Two-factor is enforced at the API layer, not just gated in the UI. Separate lockout counters for PIN and TOTP.
- **Two credentials, one JWT.** Browsers use an HttpOnly `devdash-session` cookie; native clients send `Authorization: Bearer`. A caller receives the raw token only when it sends `X-DevDash-Client: native`, so page scripts can never read or exfiltrate a session.
- **Every route authenticates and every client-supplied id is authorized.** Ownership checks live in `machine-access.ts` (anything reaching a developer machine) and `project-access.ts` (projects and their child rows). A child row is resolved to its project and *that* is authorized. Denials by id return `404` so ids aren't enumerable.
- **Secrets encrypted at rest** with AES-256-GCM, returned only by explicit reveal routes.
- **API keys** SHA-256 hashed, shown once at generation.
- **Outbound-only agent** — no inbound ports on developer machines.
- **ws-server binds `127.0.0.1`** and gates its relay endpoints behind a constant-time token compare. It refuses to start if neither `WS_INTERNAL_TOKEN` nor `JWT_SECRET` is set. These endpoints are unauthenticated remote command execution if exposed to a LAN.
- **rc-file injection defence** — everything interpolated into the cowork shell block is filtered through strict patterns.
- **WSS encryption** for all agent-server communication.
- **Read-only sharing** — shared users cannot modify projects; terminal access is a separate explicit grant.

---

## FAQ

**Q: Does the agent need to run as root?**
A: No. It runs as your user, and so does the launchd/systemd service.

**Q: What if my machine goes offline?**
A: The agent auto-reconnects. Projects show as offline in the dashboard, and running tmux sessions are still there when it returns.

**Q: Can I use DevDash without the agent?**
A: Yes, but port scanning, terminals, file browsing, AI sessions and live preview won't work. You can still manage projects manually.

**Q: Does closing the browser kill my build?**
A: No. Terminals are tmux-backed. The PTY is held for 10 minutes for a fast reattach, and past that the session keeps running with no client.

**Q: Does the AI feature send my code anywhere?**
A: No. It reads the transcript files the CLIs already write on your own machine and relays them to your own server.

**Q: How much storage does terminal recording use?**
A: Roughly 50–200 KB per hour of typical use. Five developers at 4 hours/day with 30-day retention is about 30–120 MB/month.

**Q: Can multiple people share the same machine?**
A: Each user registers their own machine. To share access, use project sharing — read-only, with comments, and an optional terminal grant.

**Q: Can I point the mobile app at my own server?**
A: Yes. It asks for a server URL on first launch and can be repointed from Settings. Changing servers signs you out, because the session belongs to the old one.

---

## Contributing

### Development Setup

```bash
git clone <repo-url> && cd devdash
npm install
cp .env.example .env      # set DATABASE_URL + JWT_SECRET
npm run db:push
npm run dev
```

### Tests

Two runners that do not overlap:

```bash
npm test                              # vitest — src/**/*.test.ts + devdash-shared
cd packages/devdash-agent && npm test  # node:test over test/*.test.js
cd packages/devdash-mobile && npm test # vitest — mobile pure modules
```

Root `npm test` does **not** run agent tests.

### Project Structure

```
devdash/
├── src/
│   ├── app/
│   │   ├── (dash)/             # The app: projects, terminals, ai, machines…
│   │   ├── api/                # 38 API routes
│   │   ├── terminal/           # Full-screen tmux attach
│   │   ├── sessions/           # Recording playback
│   │   ├── globals.css         # Theme tokens (contrast-measured)
│   │   └── page.tsx            # 5-line redirect
│   ├── components/             # ~42 flat + nested
│   ├── hooks/                  # useDevDashSocket, useDashboardSocket
│   ├── lib/                    # DB, auth, access control, crypto, email
│   ├── types/                  # Hand-maintained client interfaces
│   └── ws-server/              # The WebSocket process (single file)
├── packages/
│   ├── devdash-agent/          # CLI agent
│   ├── devdash-shared/         # Types + pure functions
│   └── devdash-mobile/         # Expo iOS/Android app
├── docs/
│   ├── api/openapi.yaml        # Hand-maintained native-client contract
│   ├── brand/                  # Naming, identity, marketing source
│   └── superpowers/            # Dated specs and executed plans
├── scripts/                    # apply-*.mjs migrations, build/deploy
├── ecosystem.config.cjs        # PM2
└── CLAUDE.md                   # AI assistant instructions
```

---

*DevDash is built and maintained by [IndiaNIC](https://indianic.com). For support, open an issue in the repository.*
