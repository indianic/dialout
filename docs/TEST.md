# Test Checklist — Remote Daemon & Terminal (Phase 1-5)

## Automated Checks (Verified by CI/build)

- [x] TypeScript compilation passes (`tsc --noEmit --skipLibCheck`)
- [x] Next.js production build succeeds (`npm run build`)
- [x] Daemon package compiles (`packages/devdash-agent/npm run build`)
- [x] All new API routes included in build output (terminals, machines, commands, browse, settings)
- [x] `npm run dev` starts both Next.js (:50051) and WS server (:50052) via concurrently

---

## Server-Side API Tests (Verified via curl + browser)

### Authentication
- [x] POST `/api/auth` with `{action:"login", email, otpCode}` returns success + user data
- [x] Auth cookie set correctly, subsequent requests authenticated
- [x] Login page renders with email + 4-digit OTP inputs

### Machines API (`/api/machines`)
- [x] GET `/api/machines?userId=X` returns machine list with `isOnline`, `hasApiKey`, `apiKeyPrefix`, `apiKeyLastUsed`
- [x] 3 machines returned for test user (SKM Office Desktop, SKM Laptop, SKM Home)
- [x] Machine with API key shows `hasApiKey: true` and prefix `mch_K27F`
- [x] POST `/api/machines/:id/api-key` generates API key (verified previously)
- [x] GET `/api/machines/:id/api-key` shows prefix and metadata
- [ ] DELETE `/api/machines/:id/api-key` revokes key (not tested via browser)

### Port Scanning
- [x] GET `/api/projects` works — returns 5 projects with correct `isRunning` status (3 live, 2 offline)
- [x] Port scanning falls back to local TCP when no daemon connected
- [x] GET `/api/check/50051` returns `{"port":50051,"running":true}`
- [x] GET `/api/check/:port?machineId=X` returns offline status when daemon not connected

### Terminal Sessions API
- [x] GET `/api/terminals` returns empty array (no active sessions)
- [x] GET `/api/terminals/recordings` returns empty array (no recordings yet)
- [ ] POST `/api/terminals` creates session record (needs daemon connected)
- [ ] DELETE `/api/terminals/:sessionId` marks session ended (needs active session)

### Project Commands API
- [x] GET `/api/projects/:id/commands` returns empty array initially
- [ ] POST `/api/projects/:id/commands` creates command (not tested)
- [ ] PUT `/api/projects/:id/commands` updates command (not tested)
- [ ] DELETE `/api/projects/:id/commands` removes command (not tested)

### Settings API
- [x] GET `/api/settings` returns defaults `{recordSessions: true, retentionDays: 15, defaultCommands: "[]"}`
- [ ] PUT `/api/settings` updates preferences (not tested via curl)

### Browse API
- [x] POST `/api/browse` returns `{"error":"Machine offline"}` when daemon not connected (correct behavior)
- [ ] POST `/api/browse` returns directory listing when daemon connected (needs daemon)

---

## WebSocket Server (`src/ws-server`)

- [x] WS server starts on port 50052 alongside Next.js via `npm run dev`
- [x] GET `http://localhost:50052/health` returns `{"status":"ok","connections":0}`
- [x] GET `http://localhost:50052/status/online` returns `{"machineIds":[]}`
- [x] POST `http://localhost:50052/scan/999` returns `{"error":"Machine offline"}` (503)
- [x] Auto-kills existing port 50052 process on startup
- [x] Loads `.env` from project root via dotenv

---

## Daemon Package (`packages/devdash-agent`)

### CLI Commands
- [x] `node bin/devdash-agent.js --version` shows 1.0.0
- [x] `node bin/devdash-agent.js config show` shows config (masked key)
- [x] `node bin/devdash-agent.js status` shows status info
- [x] `node bin/devdash-agent.js init` prompts for server URL and API key
- [x] `node bin/devdash-agent.js start` connects to WS server

### Daemon Connection
- [x] Daemon connects to WS server when configured with valid API key
- [x] Daemon logs "Authenticated as machine X" on successful connection
- [x] Daemon auto-reconnects after server restart (5s delay)
- [x] Heartbeat keeps connection alive (30s interval)
- [x] `auth_ok` message handled properly (no unknown type warning)

### PTY / Terminal
- [x] node-pty 1.2.0-beta.12 works with Node.js v22
- [x] PTY spawn errors caught (no daemon crash)
- [x] Shell uses `/bin/zsh` with command written after spawn
- [x] `~` resolved to actual home directory
- [ ] Terminal prompt position issue (shows at bottom — cosmetic, deferred)
- [ ] Interactive apps (vim, htop) not tested yet

---

## Frontend UI (Verified via browser MCP)

### Dashboard
- [x] Login page renders correctly
- [x] Login with email + OTP works
- [x] Dashboard loads with projects (3 live, 2 offline)
- [x] Project cards show with status dots, ports, tech stack, tags
- [x] Filter tabs visible: ALL, LIVE, OFFLINE, ARCHIVED, SERVICES, SHARED, MACHINES

### Machine Management (MACHINES tab)
- [x] Machine list renders with 3 machines
- [x] Online/offline status shown (green/gray dot + text)
- [x] CURRENT badge on active machine
- [x] API key info displayed (prefix + last used date)
- [x] GENERATE KEY / REGENERATE / REVOKE buttons visible
- [x] SETUP button shows daemon install instructions

### Terminal Settings (MACHINES tab)
- [x] Record Terminal Sessions toggle visible (shows ON)
- [x] Retention Period dropdown visible (7/15/30 days)
- [x] SAVE SETTINGS button visible

### Terminal Recordings (MACHINES tab)
- [x] Empty state message shown when no recordings

### Terminal Button on ProjectCard
- [x] ▶ terminal button visible on project cards
- [ ] Terminal panel opens on click (tested — works but prompt position issue)

### Project Modal
- [x] rootPath field added ("PROJECT ROOT PATH")
- [x] DevDash project has rootPath set to `/Volumes/SandeepSSD/www/tools/devdash`
- [ ] BROWSE button for filesystem browser (needs daemon connected)

### Filesystem Browser Modal
- [ ] Opens when BROWSE clicked (needs daemon connected)
- [ ] Navigates directories via daemon relay (needs daemon connected)
- [ ] SELECT button sets path in form (needs daemon connected)

---

## PM2 / Production

- [x] `ecosystem.config.cjs` includes both `devdash-local` and `devdash-local-ws` apps
- [ ] `npm run pm2:start` launches both processes (not tested)
- [ ] `pm2 list` shows both running (not tested)

---

## Concurrently Integration

- [x] `npm run dev` starts both web (:50051) and ws (:50052) servers
- [x] `npm run start` configured to start both servers
- [x] Labeled output: `[web]` for Next.js, `[ws]` for WS server
- [x] Color-coded: blue for web, green for ws

---

## Summary

| Category | Passed | Pending | Total |
|----------|--------|---------|-------|
| Automated Checks | 5 | 0 | 5 |
| API Tests | 14 | 6 | 20 |
| WebSocket Server | 6 | 0 | 6 |
| Daemon Package | 10 | 2 | 12 |
| Frontend UI | 16 | 3 | 19 |
| PM2 / Production | 1 | 2 | 3 |
| **Total** | **52** | **13** | **65** |

### Pending Items (require daemon connected or manual testing)

1. Terminal prompt position — cosmetic issue, prompt appears at bottom of terminal area
2. Filesystem browser — needs daemon connected to browse remote directories
3. Project commands CRUD — API exists, not exercised via UI test
4. PM2 dual-process start — not tested in production mode
5. Interactive terminal apps (vim, htop) — not tested
6. Session recording playback — needs recorded sessions to test

### Notes / Issues Found

- **Terminal prompt position**: The xterm.js terminal shows the prompt at the bottom instead of the top. This is a sizing/fit issue between the PTY rows and the visible container. Fixed dimensions (20 rows) are set but the shell still positions the prompt at the last row. Deferred for further investigation.
- **node-pty compatibility**: Required upgrade to `node-pty@1.2.0-beta.12` for Node.js v22 support. The stable `1.1.0` version fails with `posix_spawnp` errors.
- **React OTP inputs**: Browser automation had difficulty setting OTP values via standard input events due to React controlled components. Workaround: direct fetch API call to login endpoint.
