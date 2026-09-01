# DevDash Remote Daemon & Terminal Design

**Date:** 2026-05-05  
**Status:** Approved  
**Goal:** Run DevDash from a single server, connect to developer machines via a lightweight daemon, and provide browser-based terminal sessions with recording.

---

## Overview

Transform DevDash from a local-only tool to a server-hosted platform where:
1. A single DevDash server instance serves all users
2. A lightweight Node.js daemon (`dialout`) runs on each developer machine
3. The daemon handles port scanning, terminal sessions, and filesystem browsing
4. Browser gets full interactive terminals (xterm.js) with quick-launch command buttons
5. Terminal sessions are optionally recorded with configurable retention

---

## Architecture

```
┌─────────────────────────────────────┐
│  DevDash Server (VPS/cloud)         │
│  - Next.js app (:50051)             │
│  - WebSocket hub (:50052)           │
│  - Terminal relay (daemon ↔ browser) │
│  - Session recording to PostgreSQL  │
└──────────┬──────────────────┬───────┘
           │ WSS              │ HTTPS
           ▼                  ▼
┌──────────────────┐   ┌──────────────┐
│  DevDash Daemon  │   │   Browser    │
│  (dev machine)   │   │   (user)     │
│  - Port scanner  │   │  - xterm.js  │
│  - PTY manager   │   │  - UI tabs   │
│  - Heartbeat     │   │  - Commands  │
│  - FS browser    │   │  - Playback  │
└──────────────────┘   └──────────────┘
```

**Key principle:** The server is a relay. Daemon initiates outbound WSS connection (no inbound firewall rules needed on dev machines).

---

## Daemon Package: `dialout`

### Installation

```bash
npm install -g dialout --registry=https://registry.npmjs.org
devdash-agent init       # prompts for server URL + API key
devdash-agent start      # run in foreground (testing)
devdash-agent install-service   # install as OS service
```

### Package Structure

```
packages/devdash-agent/
├── bin/
│   └── devdash-agent.js          # CLI entry point
├── src/
│   ├── index.ts                  # Main daemon logic
│   ├── websocket.ts              # WSS connection to server
│   ├── pty-manager.ts            # Spawn/manage PTY sessions (node-pty)
│   ├── port-scanner.ts           # TCP port scanning
│   ├── fs-browser.ts             # Directory listing for path picker
│   ├── heartbeat.ts              # Keep-alive loop
│   ├── service-installer.ts      # Install as OS service (launchd/systemd)
│   └── config.ts                 # Read/write ~/.devdash-agent/config.json
├── scripts/
│   └── release-indianic          # Publish to https://registry.npmjs.org
├── package.json
├── tsconfig.json
└── README.md
```

### CLI Commands

```bash
devdash-agent init                 # Interactive setup (server URL + API key)
devdash-agent start                # Run in foreground
devdash-agent start --daemon       # Run in background (fork)
devdash-agent stop                 # Stop background process
devdash-agent install-service      # Install as launchd/systemd service
devdash-agent uninstall-service    # Remove OS service
devdash-agent status               # Show connection state + active sessions
devdash-agent config set key val   # Update config
devdash-agent config show          # Print current config
```

### Config File (`~/.devdash-agent/config.json`)

```json
{
  "serverUrl": "wss://devdash.yourserver.com",
  "apiKey": "mch_a1b2c3d4...",
  "scanPorts": [3000, 8080, 5173, 4200],
  "scanRange": { "from": 3000, "to": 9000 },
  "heartbeatInterval": 30000
}
```

### OS Service Installation

| Platform | Method | Path |
|----------|--------|------|
| macOS | launchd | `~/Library/LaunchAgents/com.devdash.agent.plist` |
| Linux | systemd user | `~/.config/systemd/user/devdash-agent.service` |
| Windows (future) | Windows Service | via `node-windows` |

---

## WebSocket Protocol

### Connection Lifecycle

```
Daemon                          Server
  │── WSS connect ──────────────►│
  │   (header: X-API-Key: mch_…) │
  │◄── auth_ok {machineId: 5} ──│
  │                               │
  │── heartbeat ────────────────►│  (every 30s)
  │◄── pong ────────────────────│
  │                               │
  │◄── port_scan_request ───────│  (user clicked "scan")
  │── port_scan_result {…} ────►│
  │                               │
  │◄── pty_open {id, cmd, cwd} ─│  (user launched terminal)
  │── pty_data {id, data} ─────►│  (stdout stream)
  │◄── pty_data {id, data} ─────│  (stdin from browser)
  │── pty_exit {id, code} ─────►│  (process ended)
  │                               │
  │◄── fs_browse {path} ────────│  (user browsing dirs)
  │── fs_list {dirs, files} ───►│
```

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `heartbeat` | daemon → server | Keep-alive, machine online |
| `port_scan_request` | server → daemon | On-demand port check |
| `port_scan_result` | daemon → server | Scan results |
| `pty_open` | server → daemon | Spawn PTY at path with command |
| `pty_data` | bidirectional | Terminal I/O stream |
| `pty_resize` | server → daemon | Browser resized terminal |
| `pty_close` | either direction | Kill session |
| `pty_exit` | daemon → server | Process exited with code |
| `fs_browse` | server → daemon | List directory contents |
| `fs_list` | daemon → server | Directory listing response |

### Security

- API key validated on connect; invalid key = immediate disconnect
- Daemon only accepts commands from server (never exposes a listening port)
- `fs_browse` restricted to listing directories only (no file content read)
- PTY commands are user-initiated from authenticated browser session
- All communication over WSS (TLS encrypted)

---

## Server-Side Changes

### New API Routes

```
src/app/api/
├── machines/
│   ├── route.ts                   # GET (list machines + online status)
│   └── [id]/
│       ├── route.ts               # PUT (rename), DELETE
│       └── api-key/route.ts       # POST (generate/regenerate API key)
├── terminals/
│   ├── route.ts                   # GET (active sessions for machine)
│   ├── [sessionId]/route.ts       # DELETE (kill session)
│   └── recordings/
│       ├── route.ts               # GET (list past recordings)
│       └── [id]/route.ts          # GET (playback data)
├── daemon/
│   └── ws/route.ts                # WebSocket upgrade endpoint for daemons
└── settings/
    └── route.ts                   # GET/PUT user preferences
```

### New Database Tables

```sql
-- Machine API keys (one per machine)
machine_api_keys (
  id            serial PRIMARY KEY,
  machine_id    integer NOT NULL,
  key_hash      text NOT NULL,
  key_prefix    text NOT NULL,        -- "mch_xxxx" for display
  created_at    text DEFAULT now(),
  last_used_at  text
)

-- Terminal session metadata
terminal_sessions (
  id            serial PRIMARY KEY,
  machine_id    integer NOT NULL,
  user_id       integer NOT NULL,
  project_id    integer,              -- nullable (ad-hoc terminals)
  command       text NOT NULL,
  cwd           text NOT NULL,
  started_at    text DEFAULT now(),
  ended_at      text,
  exit_code     integer
)

-- Session I/O chunks (the actual recording data)
terminal_chunks (
  id            serial PRIMARY KEY,
  session_id    integer NOT NULL,
  timestamp     bigint NOT NULL,      -- ms since session start
  type          text NOT NULL,        -- 'input' | 'output'
  data          text NOT NULL         -- base64 encoded
)

-- User preferences
user_settings (
  id              serial PRIMARY KEY,
  user_id         integer NOT NULL UNIQUE,
  record_sessions boolean DEFAULT true,
  retention_days  integer DEFAULT 15,
  default_commands jsonb DEFAULT '[]'
)

-- Per-project quick-launch commands
project_commands (
  id            serial PRIMARY KEY,
  project_id    integer NOT NULL,
  label         text NOT NULL,        -- "Claude Code", "Dev Server"
  command       text NOT NULL,        -- "claude", "npm run dev"
  sort_order    integer DEFAULT 0
)
```

### WebSocket Server

Next.js App Router doesn't natively support long-lived WebSockets. Solution:

- **Separate WebSocket server** (Node.js + `ws` library) on port 50052
- PM2 manages both processes: `devdash-web` (:50051) + `devdash-ws` (:50052)
- In production: nginx proxies `/ws/` to :50052
- The WS server shares the same database and JWT validation logic

```
ecosystem.config.cjs:
  apps: [
    { name: 'devdash-web', script: 'next start -p 50051' },
    { name: 'devdash-ws',  script: 'src/ws-server/index.ts', port: 50052 }
  ]
```

---

## Browser Terminal UI

### Layout

```
┌─────────────────────────────────────────────────────┐
│ [Project A: claude] [Project B: npm dev] [+ New]    │  ← session tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│  $ claude                                           │
│  ╭─────────────────────────────────────────╮        │
│  │ Claude Code v1.2.3                      │        │  ← full xterm.js
│  │ What would you like to do?              │        │     (colors, resize,
│  │ >                                       │        │      interactive TUI)
│  ╰─────────────────────────────────────────╯        │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [▶ Claude Code] [▶ Codex] [▶ npm dev] [▶ Custom…]  │  ← quick-launch buttons
└─────────────────────────────────────────────────────┘
```

### Features

- **Tabs:** Multiple concurrent sessions, each showing project name + command
- **Quick-launch buttons:** Configurable per project, one-click to open new tab with command
- **Resize:** Drag handle to make terminal taller/shorter; `pty_resize` sent to daemon
- **Kill:** Close button per tab sends `pty_close`
- **xterm.js + AttachAddon:** Full PTY support (colors, cursor movement, vim, htop, etc.)

### Quick-Launch Commands (configurable per project)

Default set:
- `claude` — Open Claude Code
- `codex` — Open Codex CLI
- `npm run dev` — Start dev server
- `npm run build` — Build project
- Custom — User adds any command

---

## Session Recording & Playback

### Recording Flow

1. User opens terminal → server creates `terminal_sessions` row
2. As `pty_data` flows through server (daemon → browser), server also writes to `terminal_chunks`
3. When session ends → `ended_at` and `exit_code` set
4. Chunks stored with millisecond timestamps relative to session start

### Playback UI

- List of past sessions: date, duration, command, machine name
- Click to open player:
  - Timeline scrubber
  - Play / Pause / Speed (1x, 2x, 4x)
  - Shows terminal output frame-by-frame at recorded timing
- Bulk delete option

### Retention & Flush

- User configures in Settings: `Record sessions` toggle + `Retention: 7/15/30 days`
- Scheduled flush (daily cron or PM2 cron):
  ```sql
  DELETE FROM terminal_chunks WHERE session_id IN (
    SELECT id FROM terminal_sessions
    WHERE started_at < NOW() - INTERVAL '{retention_days} days'
  );
  DELETE FROM terminal_sessions
  WHERE started_at < NOW() - INTERVAL '{retention_days} days';
  ```
- Storage estimate: ~50KB–200KB per hour of typical terminal use

---

## Frontend UI Changes

### 1. Machine Management (Settings)

- List machines with online/offline dot (green/gray)
- "Add Machine" → generates API key → shows install instructions
- Regenerate / revoke API key
- Last seen timestamp

### 2. Project Settings — Commands Tab

- CRUD for quick-launch commands (label + command)
- Project root path with filesystem browser (via daemon `fs_browse`)
- Path browser modal: directory tree, click to expand, select to confirm

### 3. Terminal Panel

- Accessible from project card or top navigation
- Tab bar + quick-launch buttons bar
- Full xterm.js rendering per tab
- Close/kill per tab

### 4. Recordings Section

- Under project detail or global "Recordings" page
- List with: date, duration, command, machine
- Replay with timeline scrubber
- Auto-flush indicator ("Flushing in X days")

### 5. User Settings — New Fields

- Record terminal sessions: toggle
- Retention period: 7 / 15 / 30 days dropdown
- Default commands: list applied to every new project

---

## Authentication & Security

### Daemon ↔ Server

- API key generated per machine (format: `mch_` + 32 random chars)
- Key hash stored in DB; raw key shown only once at generation
- Validated on WebSocket connect via `X-API-Key` header
- Invalid key → immediate disconnect, logged

### Browser ↔ Server

- Existing OTP/JWT auth (unchanged)
- Terminal WebSocket requires valid JWT cookie
- User can only access terminals for their own machines

---

## Release & Distribution

### Private NPM Registry

Package published to `https://registry.npmjs.org` as `dialout`.

### Release Script

Adapted from `/Users/indianic/www/tools/echobase_resolver/scripts/release-indianic`:
- Auto commits pending changes
- Bumps version (patch/minor/major)
- Builds TypeScript
- Updates CHANGELOG.md
- Commits, tags, pushes
- Publishes to `https://registry.npmjs.org`
- Verifies install
- Optionally updates local global install

```bash
./scripts/release-indianic                  # patch bump
./scripts/release-indianic --minor          # minor bump
./scripts/release-indianic "Fixed reconnect bug"  # with changelog
./scripts/release-indianic -y               # non-interactive (CI)
```

### Install Instructions (shown in UI after "Add Machine")

```bash
# Install
npm install -g dialout --registry=https://registry.npmjs.org

# Setup
devdash-agent init
# → Enter server URL: https://devdash.yourserver.com
# → Enter API key: mch_xxxxxxxxxxxxxxxx

# Run as service
devdash-agent install-service

# Verify
devdash-agent status
```

---

## Implementation Phases

### Phase 1 — Foundation (Daemon + WebSocket)

- Create `packages/devdash-agent/` with CLI, config, WebSocket client, heartbeat
- Add WebSocket server alongside Next.js (port 50052)
- Machine API key generation/storage in DB
- Daemon connects, authenticates, shows online/offline in UI
- Adapt release script for `dialout`
- Install as OS service (launchd/systemd)

### Phase 2 — Port Scanning via Daemon

- Move port scanning from server-side TCP to daemon-relayed
- Server sends `port_scan_request`, daemon responds with results
- UI works as before but data comes from the remote machine
- Fallback: if daemon offline, show "machine offline" state

### Phase 3 — Terminal Sessions

- `node-pty` integration in daemon (`pty-manager.ts`)
- `pty_open` / `pty_data` / `pty_resize` / `pty_close` protocol
- Server-side WebSocket bridge (browser ↔ server ↔ daemon)
- xterm.js in browser with `AttachAddon`
- Tab management UI
- Quick-launch commands per project

### Phase 4 — Path Browser & Project Config

- `fs_browse` message handler in daemon
- Path browser modal in UI (directory tree)
- Project root path saved per machine
- Quick-launch command CRUD per project

### Phase 5 — Session Recording & Playback

- Server stores terminal chunks as they stream through
- `terminal_sessions` + `terminal_chunks` tables
- Playback UI with timeline scrubber (play/pause/speed)
- User settings for recording toggle + retention days
- Daily flush cron for expired recordings

### Phase 6 (Future) — Go Binary

- Reimplement daemon in Go with same WebSocket protocol
- Single compiled binary for macOS/Linux/Windows
- No Node.js dependency required
- Distributed as GitHub release download + brew tap

---

## Dependencies

### Daemon (`dialout`)

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket client |
| `node-pty` | PTY spawning |
| `commander` | CLI argument parsing |
| `conf` or custom | Config file management |

### Server (new additions)

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket server |
| `xterm` + `xterm-addon-attach` | Browser terminal (frontend) |
| `uuid` | Session IDs |
| `node-cron` | Scheduled recording flush |

---

## Storage Estimates

| Data | Size | Retention |
|------|------|-----------|
| Terminal chunks | ~50–200 KB/hour | 7/15/30 days (configurable) |
| Session metadata | ~500 bytes/session | Same as chunks |
| Port scan results | Existing (minimal) | Permanent |

For a team of 5 devs, each using ~4 hours/day of terminal: ~1–4 MB/day → 30–120 MB/month at 30-day retention. Well within PostgreSQL comfort zone.

---

## Open Questions (for future phases)

1. **Multi-user terminal sharing** — Allow team members to watch each other's terminals live? (pair programming)
2. **File editing** — Should daemon support opening files in browser-based editor? (scope creep risk)
3. **Notifications** — Alert when a long-running command finishes? (e.g., build complete)
4. **Go binary distribution** — Brew tap, curl installer, or just GitHub releases?
