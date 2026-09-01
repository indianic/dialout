# dialout

Remote daemon for [DevDash](https://devdash.indianic.com) — connects developer machines to the DevDash server for port scanning, browser-based terminal sessions, and filesystem browsing.

> **Package rename:** this agent is published as **`dialout`**. Earlier builds used the name `dialout` — if you have that installed, see [Migrating from the old package](#migrating-from-the-old-package-indianicdevdash) below.

## What it does

- **Port scanning** — scans local ports on demand, reports results to the server
- **Terminal sessions** — spawns PTY shells, streams I/O to the browser via WebSocket
- **Filesystem browsing** — lists directories for the path picker in the DevDash UI
- **Heartbeat** — maintains persistent connection with 30s keep-alive

## Requirements

- Node.js >= 18
- macOS or Linux
- A running DevDash server with WebSocket endpoint

## Installation

### First-time setup

Configure npm to use the IndiaNIC registry for `@indianic` packages only (other dependencies resolve from public npm):

```bash
npm config set @indianic:registry https://registry.npmjs.org/
```

### Install

```bash
npm install -g dialout
```

### Update

```bash
npm update -g dialout
```

## Quick Start

### 1. Generate an API key

In the DevDash web UI, go to the **MACHINES** tab and click **GENERATE KEY** on your machine. Copy the key — it's shown only once.

### 2. Configure the agent

```bash
devdash-agent init
```

You'll be prompted for:
- **Server URL** — the WebSocket URL of your DevDash server (e.g., `wss://www.dialout.dev/ws`)
- **API Key** — the key generated in step 1 (e.g., `mch_K27F...`)

Configuration is saved to `~/.devdash-agent/config.json`.

### 3. Start the agent

```bash
# Foreground (for testing)
devdash-agent start

# Background (daemon mode)
devdash-agent start --daemon
```

### 4. Install as OS service

Two modes — pick based on whether you need the agent running **before** anyone logs in:

```bash
# Per-user — starts at LOGIN (no sudo)
devdash-agent install-service

# System-wide — starts at BOOT, before login (requires sudo, see below)
devdash-agent install-service --system
```

| Mode | macOS | Linux | Starts |
|------|-------|-------|--------|
| default | LaunchAgent `~/Library/LaunchAgents/com.devdash.agent.plist` | systemd user unit `~/.config/systemd/user/devdash-agent.service` | at login |
| `--system` | LaunchDaemon `/Library/LaunchDaemons/com.devdash.agent.plist` | systemd system unit `/etc/systemd/system/devdash-agent.service` | at boot |

Both modes auto-restart the agent if it crashes or is killed.

#### Running `--system` with sudo

A boot service must be owned by root, so the CLI can't install it directly. When you run `devdash-agent install-service --system` as a normal user, it **stages the unit file** and prints the exact `sudo` commands. Run them to finish:

**macOS:**

```bash
sudo bash -c 'cp ~/.devdash-agent/com.devdash.agent.plist /Library/LaunchDaemons/com.devdash.agent.plist \
  && chown root:wheel /Library/LaunchDaemons/com.devdash.agent.plist \
  && chmod 644 /Library/LaunchDaemons/com.devdash.agent.plist \
  && launchctl bootstrap system /Library/LaunchDaemons/com.devdash.agent.plist'
```

> Replace `~` with the absolute path printed by the command (e.g. `/Users/you/.devdash-agent/...`) if you run the line under `sudo` where `~` resolves to root's home.

**Linux:**

```bash
sudo cp ~/.devdash-agent/devdash-agent.service /etc/systemd/system/devdash-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now devdash-agent
```

If you run the command itself with `sudo` (i.e. `sudo devdash-agent install-service --system`), it performs all of the above automatically.

### 5. Verify

```bash
devdash-agent status
```

You should see (`--system` shown; per-user shows `at login`):

```
DevDash Agent Status
────────────────────────────────────────────
  Server:    wss://www.dialout.dev/ws
  API Key:   ****K27F
  Config:    /Users/you/.devdash-agent/config.json
  Service:   installed (launchd, at boot)
  Cron:      not installed
  Process:   running (PID: 12345, managed by launchd)
────────────────────────────────────────────
```

In the DevDash web UI, your machine should show a green dot (CONNECTED).

> **Note:** `status` reports the **service-managed** process (launchd/systemd), not just a background `--daemon` PID file. A service-installed agent that is up will always show `running` with the live PID.

## CLI Reference

| Command | Description |
|---------|-------------|
| `devdash-agent init` | Configure server URL and API key |
| `devdash-agent start` | Start in foreground (Ctrl+C to stop) |
| `devdash-agent start --daemon` | Start in background |
| `devdash-agent stop` | Stop background agent |
| `devdash-agent status` | Show connection state, service state, and live PID |
| `devdash-agent install-service` | Install as OS service — starts at **login** |
| `devdash-agent install-service --system` | Install as OS service — starts at **boot** (needs sudo) |
| `devdash-agent uninstall-service` | Remove OS service (login or boot) |
| `devdash-agent setup-cron` | Install a cron watchdog that restarts the agent if it dies |
| `devdash-agent config show` | Print current configuration |
| `devdash-agent config set <key> <value>` | Update a config value |
| `devdash-agent --version` | Show version |
| `devdash-agent --help` | Show help |

## Configuration

Config file: `~/.devdash-agent/config.json`

```json
{
  "serverUrl": "wss://www.dialout.dev/ws",
  "apiKey": "mch_xxxxxxxxxxxx",
  "scanPorts": [3000, 3001, 4200, 5173, 8000, 8080, 9000],
  "scanRange": { "from": 3000, "to": 9000 },
  "heartbeatInterval": 30000
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `serverUrl` | — | WebSocket URL of the DevDash server (the agent appends `/daemon`) |
| `apiKey` | — | Machine API key (generated in DevDash UI) |
| `scanPorts` | common dev ports | Specific ports to check |
| `scanRange` | 3000–9000 | Port range for full scans |
| `heartbeatInterval` | 30000 | Keep-alive interval in ms |

## How it works

```
┌──────────────────┐     WSS      ┌─────────────────┐     HTTPS     ┌──────────┐
│  DevDash Agent   │◄────────────►│  DevDash Server  │◄────────────►│ Browser  │
│  (your machine)  │              │  (WebSocket hub)  │              │ (user)   │
│                  │              │                   │              │          │
│  - Port scanner  │              │  - Relay          │              │ - xterm  │
│  - PTY manager   │              │  - Auth           │              │ - UI     │
│  - FS browser    │              │  - Recording      │              │          │
│  - Heartbeat     │              │                   │              │          │
└──────────────────┘              └───────────────────┘              └──────────┘
```

1. Agent connects outbound to `<serverUrl>/daemon` via WebSocket (no inbound ports needed)
2. Server authenticates via the `X-API-Key` header (hashed and matched against `machine_api_keys`)
3. Browser requests (port scan, terminal, browse) are relayed through the server
4. Terminal I/O streams: Browser ↔ Server ↔ Agent ↔ local PTY

## OS Service Details

Logs (both modes) are written to `~/.devdash-agent/logs/`.

### macOS (launchd)

```bash
# Install (login)            # Install (boot, then run printed sudo steps)
devdash-agent install-service
devdash-agent install-service --system

# Check status
devdash-agent status
launchctl print gui/$(id -u)/com.devdash.agent   # login agent
sudo launchctl print system/com.devdash.agent    # boot daemon

# View logs
tail -f ~/.devdash-agent/logs/stdout.log
tail -f ~/.devdash-agent/logs/stderr.log

# Uninstall (handles both login and boot)
devdash-agent uninstall-service
# boot daemon also needs:  sudo launchctl bootout system /Library/LaunchDaemons/com.devdash.agent.plist && sudo rm /Library/LaunchDaemons/com.devdash.agent.plist
```

### Linux (systemd)

```bash
# Install
devdash-agent install-service            # user (login)
devdash-agent install-service --system   # system (boot) — then run printed sudo steps

# Check status
systemctl --user status devdash-agent    # login
systemctl status devdash-agent           # boot

# View logs
journalctl --user -u devdash-agent -f    # login
journalctl -u devdash-agent -f           # boot

# Uninstall
devdash-agent uninstall-service
```

## Migrating from the old package (`dialout`)

The agent was renamed from `dialout` to `dialout`. If a
machine still has the old package, remove it before installing the new one (both
provide the `devdash-agent` command, so they conflict).

```bash
# 1. Stop and remove any service installed by the old package
devdash-agent uninstall-service

# 2. Remove the old global package
npm uninstall -g dialout

# 3. Install the new package
npm install -g dialout

# 4. Reinstall the service (config in ~/.devdash-agent is preserved)
devdash-agent install-service            # login
# or
devdash-agent install-service --system   # boot (run the printed sudo steps)

# 5. Verify
devdash-agent status
```

Your `~/.devdash-agent/config.json` (server URL + API key) is **not** touched by
the uninstall, so no re-init is needed.

## Releasing New Versions

Publishing uses the **`npmnic`** CLI — IndiaNIC's registry client. Auth is via
`npmnic login` (browser/device flow); **no `NPM_INDIANIC_TOKEN` is required**.

```bash
# One-time, per machine
npmnic login
npmnic whoami        # confirm: Publish: Yes

# Release (bump → build → changelog → commit → tag → push → publish, all in one)
npm run release            # patch  (1.0.0 → 1.0.1)
npm run release:minor      # minor  (1.0.0 → 1.1.0)
npm run release:major      # major  (1.0.0 → 2.0.0)

# With a changelog message
./scripts/release-indianic -m "Fixed reconnect logic"

# Or call npmnic directly
npmnic publish --minor -m "Added new feature"
```

`scripts/release-indianic` is a thin wrapper around `npmnic publish`.

## Troubleshooting

### Agent won't connect

- Check `devdash-agent status` for config and service state
- A **`401`** on connect means the **API key is not registered** for any machine — regenerate the key in the DevDash UI and `devdash-agent config set apiKey mch_...` (it is *not* a wrong-URL problem)
- The agent connects to `<serverUrl>/daemon` — make sure `serverUrl` is the WS base (e.g. `wss://www.dialout.dev/ws`), not including `/daemon`
- Check firewall: the agent connects outbound over TLS (443) to the server

### "not running" right after reboot

- With a **login** service, the agent only starts after you log into the desktop session. For headless / before-login start, use `install-service --system`.
- At boot, DNS may not be ready yet — you may see `getaddrinfo ENOTFOUND` in `stderr.log` briefly; the agent retries every 5s and connects once the network is up.

### Terminal not working

- Ensure the agent shows "Connected and ready" in logs
- Verify `node-pty` installed correctly: `node -e "require('node-pty')"`
- If `node-pty` fails, rebuild: `npm rebuild node-pty`

### Service not starting

- macOS: check `~/.devdash-agent/logs/stderr.log`
- Linux: check `journalctl --user -u devdash-agent` (or without `--user` for `--system`)
- Ensure `devdash-agent init` was run before installing the service

## License

UNLICENSED — IndiaNIC proprietary
