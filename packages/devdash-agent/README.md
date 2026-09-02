<div align="center">

<img src="https://raw.githubusercontent.com/indianic/dialout/main/docs/assets/logo.svg" width="88" height="88" alt="Dialout">

# @indianic/dialout

**Your machines, one room. The agent dials out, so nothing has to dial in.**

<sub>The package is scoped; the command it installs is plain `dialout`.</sub>

[![npm](https://img.shields.io/npm/v/%40indianic%2Fdialout?style=flat-square&color=1a56db)](https://www.npmjs.com/package/@indianic/dialout)
[![License](https://img.shields.io/badge/license-MIT-1a56db?style=flat-square)](https://github.com/indianic/dialout/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-1a56db?style=flat-square)](https://nodejs.org)
[![Platforms](https://img.shields.io/badge/macOS%20%C2%B7%20Linux-0c0e13?style=flat-square)](#requirements)

**[dialout.dev](https://www.dialout.dev)** · [GitHub](https://github.com/indianic/dialout) · [Get started](#getting-started) · [CLI reference](#cli-reference) · [Troubleshooting](#troubleshooting)

</div>

---

**This is the agent for [Dialout](https://www.dialout.dev), a free, open-source,
self-hosted remote development dashboard.** Install it on any computer you code
on — your office desktop, your home machine, a build box — and that machine
appears in your Dialout dashboard, reachable from any browser or your phone.

The agent connects **outbound** to your server and holds the socket open. There
is no inbound port to open, no VPN to join, and no port forwarding to configure.
If the machine can reach the internet, you can reach the machine.

```bash
npm install -g @indianic/dialout
dialout init
dialout install-service
```

---

## The problem it solves

You are away from your desk and you need to know what your machine is doing.
Today that means being at the machine, or reassembling the answer by hand:

```console
$ lsof -i :3000                 # which project is this, again?
node  41287  you  26u  IPv6  TCP *:3000 (LISTEN)

$ ssh build-box                 # the other four ports are on a different box
you@build-box:~$ pm2 list
you@build-box:~$ cat apps/checkout/.env | grep STRIPE_

$ tmux ls                       # and the migration I started on Friday?
0: 1 windows  1: 1 windows      # no idea which one
```

Four terminals, three machines, and the only index is your memory. Run six
projects for a year and *"which port was the admin panel on?"* becomes a
genuinely hard question that nothing in your toolchain is keeping the answer to.
Meanwhile an AI coding agent is running a 40-minute task on that machine and
will sit and wait for an answer the moment you walk away.

With the agent installed, all of that is one URL — from a phone if that is what
you have on you:

- **Search a port, keep the answer.** Scan a range, find what is listening, save
  it as a project. `:3000` becomes *Checkout, on the office Mac, running.*
- **Open a real terminal, from anywhere** — straight into the project folder.
- **Answer your AI agent from your phone.** Claude Code, Codex and Grok sessions
  rendered as chat, with a push when one is waiting on you.
- **Share a project with a teammate**, with notes and todos attached to the
  project instead of a chat thread.
- **Put `localhost` on a public URL** for a demo, a webhook, or a test device.

<img src="https://raw.githubusercontent.com/indianic/dialout/main/docs/assets/screenshots/hero.png" alt="The Dialout dashboard: projects across every machine, with live port status">

## What the agent does

- **Port scanning** — scans local ports on demand and reports what is listening
- **Terminal sessions** — tmux-backed PTYs streamed to the browser over WebSocket
- **AI session tailing** — follows the JSONL transcript each AI CLI already
  writes, so sessions render as chat without ever scraping the terminal UI
- **Filesystem browsing** — lists directories for the path picker
- **Process control** — runs the quick-launch commands you saved per project
- **HTTP tunnel origin** — serves your local dev server through the public URL
- **Heartbeat** — a persistent connection with a 30 s keep-alive

## Requirements

- Node.js 18 or newer
- macOS or Linux
- A running [Dialout server](https://github.com/indianic/dialout) — it is
  self-hosted, so this is your server, on your infrastructure

## Getting started

Six steps, about ten minutes. You need a Dialout **server** — one, shared by all
your machines — and this agent on each machine you want to reach.

### 1 · Get a server

Pick one:

- **Self-host it.** Clone [github.com/indianic/dialout](https://github.com/indianic/dialout)
  and follow the README. One PostgreSQL database and two Node processes; your
  data stays on your infrastructure. This is the intended path.
- **Use [dialout.dev](https://www.dialout.dev).** A public instance running the
  same code, if you want to look around before committing to hosting it. You can
  repoint the agent at your own server later with one command.

### 2 · Create your account

Open your server and sign up with your email, then complete **two-factor
enrolment** — scan the QR code with any TOTP app. It is not skippable, and the
API enforces it independently of the interface, because this is a tool that
opens terminals on your machines.

### 3 · Add the machine and generate its key

In the dashboard, **Settings → Machines → Add machine**. Give it a name you will
recognise (`office-mac`, `home-desktop`, `build-box`), then click **Generate
key**.

You get an `mch_…` key. **Copy it now — it is shown once and stored only as a
hash.** Generate a new one at any time if you lose it.

### 4 · Install the agent

On the computer you just registered:

```bash
npm install -g @indianic/dialout
```

### 5 · Point it at your server

```bash
dialout init
```

It asks for two things:

| Prompt | What to paste |
| --- | --- |
| **Server URL** | The WebSocket base — `wss://www.dialout.dev/ws`, or `ws://localhost:50052` for a local server. The agent appends `/daemon` itself. |
| **API key** | The `mch_…` key from step 3 |

Configuration is written to `~/.dialout/config.json`. `init` then offers to
install the OS service for you — choose **at boot** if you want the machine
reachable before anyone logs into the desktop session, which on a machine you
are trying to reach remotely is almost always what you want.

To run it in the foreground once, before committing to a service:

```bash
dialout start            # Ctrl-C to stop
dialout start --daemon   # or in the background
```

### 6 · Install as a service and verify

If you skipped the offer in `init`, two modes — chosen by whether you need the
agent running **before** login:

```bash
dialout install-service            # per-user  — starts at LOGIN (no sudo)
dialout install-service --system   # system    — starts at BOOT  (needs sudo)
```

| Mode | macOS | Linux | Starts |
|------|-------|-------|--------|
| default | LaunchAgent `~/Library/LaunchAgents/com.dialout.agent.plist` | systemd user unit `~/.config/systemd/user/dialout.service` | at login |
| `--system` | LaunchDaemon `/Library/LaunchDaemons/com.dialout.agent.plist` | systemd system unit `/etc/systemd/system/dialout.service` | at boot |

Both modes restart the agent automatically if it crashes or is killed.

<details>
<summary><b>Finishing a <code>--system</code> install by hand</b></summary>

<br>

A boot service must be owned by root, so a non-root CLI cannot install it
directly. Run as a normal user, `install-service --system` **stages** the unit
file and prints the exact commands to finish. Run `sudo dialout install-service
--system` instead and it does all of this for you.

**macOS**

```bash
sudo bash -c 'cp ~/.dialout/com.dialout.agent.plist /Library/LaunchDaemons/com.dialout.agent.plist \
  && chown root:wheel /Library/LaunchDaemons/com.dialout.agent.plist \
  && chmod 644 /Library/LaunchDaemons/com.dialout.agent.plist \
  && launchctl bootstrap system /Library/LaunchDaemons/com.dialout.agent.plist'
```

Replace `~` with the absolute path the command printed (e.g.
`/Users/you/.dialout/…`) — under `sudo`, `~` resolves to root's home, not yours.

**Linux**

```bash
sudo cp ~/.dialout/dialout.service /etc/systemd/system/dialout.service
sudo systemctl daemon-reload
sudo systemctl enable --now dialout
```

</details>

Then check it:

```bash
dialout status
```

```
Dialout Agent Status
────────────────────────────────────────────
  Server:    wss://www.dialout.dev/ws
  API Key:   ****K27F
  Config:    /Users/you/.dialout/config.json
  Service:   installed (launchd, at boot)
  Cron:      not installed
  Process:   running (PID: 12345, managed by launchd)
────────────────────────────────────────────
```

The machine now shows green in the dashboard and its ports go live. `status`
reports the **service-managed** process, not just a `--daemon` PID file, so a
service-installed agent that is up always shows `running` with the live PID.

Repeat steps 3 to 6 for every other machine you want in the room.

## CLI reference

| Command | Description |
|---------|-------------|
| `dialout init` | Configure server URL and API key, and optionally install the service |
| `dialout start` | Start in the foreground (Ctrl-C to stop) |
| `dialout start --daemon` | Start in the background |
| `dialout stop` | Stop a background agent |
| `dialout restart` | Stop and start again |
| `dialout status` | Connection state, service state, and the live PID |
| `dialout install-service` | Install as an OS service — starts at **login** |
| `dialout install-service --system` | Install as an OS service — starts at **boot** (needs sudo) |
| `dialout uninstall-service` | Remove the OS service, either mode |
| `dialout setup-cron` | Install a cron watchdog that restarts the agent if it dies |
| `dialout remove-cron` | Remove the cron watchdog |
| `dialout setup-cowork` | Wire your shell rc so native terminals join the same tmux session |
| `dialout repair` | Diagnose and fix a stale or competing supervisor |
| `dialout profiles` / `dialout use <profile>` | Switch between saved server configurations |
| `dialout update` | Update to the latest published version |
| `dialout config show` \| `path` \| `set <key> <value>` \| `reset` | Inspect and edit configuration |
| `dialout --version` \| `--help` | Version and help |

## Configuration

Config file: `~/.dialout/config.json`

```json
{
  "serverUrl": "wss://dialout.example.com/ws",
  "apiKey": "mch_xxxxxxxxxxxx",
  "scanPorts": [3000, 3001, 4200, 5173, 8000, 8080, 9000],
  "scanRange": { "from": 3000, "to": 9000 },
  "heartbeatInterval": 30000
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `serverUrl` | — | WebSocket base URL of your Dialout server; the agent appends `/daemon` |
| `apiKey` | — | The machine's `mch_…` key, generated in the web UI |
| `scanPorts` | common dev ports | Specific ports to check on a quick scan |
| `scanRange` | 3000–9000 | Port range for a full scan |
| `heartbeatInterval` | 30000 | Keep-alive interval, in milliseconds |

## How it works

```
┌──────────────────┐   outbound   ┌──────────────────┐    HTTPS     ┌──────────┐
│  dialout agent   │ ===========▶ │  Dialout server  │ ◀──────────▶ │ Browser  │
│  (your machine)  │     WSS      │  (yours, self-   │              │ or phone │
│                  │              │   hosted)        │              │          │
│  · port scanner  │              │  · relay         │              │ · xterm  │
│  · PTY / tmux    │              │  · auth          │              │ · UI     │
│  · AI transcripts│              │  · recording     │              │          │
│  · FS browser    │              │  · tunnel        │              │          │
└──────────────────┘              └──────────────────┘              └──────────┘
        nothing dials in ▲ the arrow only ever points this way
```

1. The agent connects outbound to `<serverUrl>/daemon` over WebSocket. No
   inbound port is needed on the machine.
2. The server authenticates it with the `X-API-Key` header, SHA-256 compared
   against the stored hash.
3. Browser requests — port scan, terminal, browse, run command — are relayed
   through the server to the agent.
4. Terminal I/O streams browser ↔ server ↔ agent ↔ local PTY.

## Service management

Logs for both modes are written to `~/.dialout/logs/`.

<details>
<summary><b>macOS (launchd)</b></summary>

<br>

```bash
dialout status
launchctl print gui/$(id -u)/com.dialout.agent   # login agent
sudo launchctl print system/com.dialout.agent    # boot daemon

tail -f ~/.dialout/logs/stdout.log
tail -f ~/.dialout/logs/stderr.log

dialout uninstall-service
# a boot daemon also needs:
sudo launchctl bootout system /Library/LaunchDaemons/com.dialout.agent.plist \
  && sudo rm /Library/LaunchDaemons/com.dialout.agent.plist
```

</details>

<details>
<summary><b>Linux (systemd)</b></summary>

<br>

```bash
systemctl --user status dialout    # login
systemctl status dialout           # boot

journalctl --user -u dialout -f    # login
journalctl -u dialout -f           # boot

dialout uninstall-service
```

</details>

## Troubleshooting

**The agent will not connect.**
Run `dialout status` first — it shows the config and the service state together.
A **401** means the API key is not registered for any machine; it is *not* a
wrong-URL problem. Regenerate the key in the web UI and
`dialout config set apiKey mch_…`. Check that `serverUrl` is the WebSocket base
(`wss://host/ws`) and does **not** include `/daemon`. The agent connects
outbound over TLS on 443, so an outbound firewall is the other thing to check.

**"not running" right after a reboot.**
A *login* service only starts once you log into the desktop session. For a
headless machine, or one you want to reach before login, use
`install-service --system`. At boot DNS may not be up yet, so a brief
`getaddrinfo ENOTFOUND` in `stderr.log` is expected — the agent retries every
5 s and connects when the network arrives.

**Terminals do not work.**
Confirm the logs say *Connected and ready*, then check `node-pty`:
`node -e "require('node-pty')"`. If it fails, `npm rebuild node-pty`.

**The service will not start.**
macOS: read `~/.dialout/logs/stderr.log`. Linux:
`journalctl --user -u dialout` (drop `--user` for a `--system` install). Make
sure `dialout init` ran before the service was installed. If a previous
supervisor is stuck, `dialout repair` diagnoses and clears it.

## Upgrading from an earlier package name

This agent has been published under three names. If you have an older one
installed, remove it first — they all provide the same `dialout` command, and
npm will not overwrite an existing binary:

```bash
dialout uninstall-service                 # stop the old service

npm uninstall -g dialout                  # the unscoped name (deprecated)
npm uninstall -g @indianic/devdash-agent  # the original private package

npm install -g @indianic/dialout
dialout install-service --system          # or without --system for a login service
dialout status
```

Your configuration is untouched by any of this. `~/.dialout/config.json` stays
where it is, and a much older `~/.devdash-agent` is **copied** rather than moved
on first run, so no re-`init` is needed.

> **On an IndiaNIC machine, check your `~/.npmrc` first.** A line reading
> `@indianic:registry=https://npm.indianic.in/` points the whole scope at a
> retired private registry, and this package will 404 until it is removed.

## The mobile app

Native **iOS and Android** apps are coming soon to the App Store and Google
Play. Until then the web dashboard installs as a PWA — *Add to Home Screen* —
with push notifications on both platforms today.

## Changelog

Release history is in
[CHANGELOG.md](https://github.com/indianic/dialout/blob/main/packages/devdash-agent/CHANGELOG.md).
Note that entries below 1.0.0 are numbered 2.x: the agent shipped privately as
`@indianic/devdash-agent` and reached 2.7.4 before the open-source release reset
it to 1.0.0.

## Contributing and issues

The whole project is open source at
**[github.com/indianic/dialout](https://github.com/indianic/dialout)**. Bugs and
feature requests go in
[Issues](https://github.com/indianic/dialout/issues); see
[CONTRIBUTING.md](https://github.com/indianic/dialout/blob/main/CONTRIBUTING.md).
Security reports go to the process in
[SECURITY.md](https://github.com/indianic/dialout/blob/main/SECURITY.md).

---

<div align="center">

Built by **[Sandeep Mundra](mailto:sandeep@indianic.com)**, CTO of IndiaNIC, to
solve a problem he had himself — working on his office and home machines from
wherever he happened to be.

<sub>Sponsored and maintained by</sub>

### [IndiaNIC Infotech Ltd](https://www.indianic.com)

[![Website](https://img.shields.io/badge/www.indianic.com-0c0e13?style=flat-square)](https://www.indianic.com)
[![Email](https://img.shields.io/badge/hello@indianic.com-1a56db?style=flat-square)](mailto:hello@indianic.com)

</div>

Dialout is free and MIT licensed, and always will be. If you want it customised
for your team, integrated with your stack, or deployed and run for you, that is
what IndiaNIC does — reach us at
**[hello@indianic.com](mailto:hello@indianic.com)** or
**[www.indianic.com](https://www.indianic.com)**.

## Licence

MIT. Copyright © 2026 IndiaNIC Infotech Ltd.
