<div align="center">

# Dialout

**Your machines, one room. The agent dials out, so nothing has to dial in.**

[![License: MIT](https://img.shields.io/badge/License-MIT-1a56db.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.18-1a56db.svg)](package.json)
[![Platforms](https://img.shields.io/badge/agent-macOS%20%7C%20Linux-1a56db.svg)](packages/devdash-agent)

[Website](https://www.dialout.dev) · [Quick start](https://www.dialout.dev/docs/quick-start) · [How it works](https://www.dialout.dev/how-it-works) · [Security](SECURITY.md)

</div>

---

A self-hosted development control room. It tracks every project across every
machine you own — ports, stack, notes, todos, credentials — and live-checks
what is actually running. An agent on each machine connects **outbound** to
your server, which then gives you remote tmux terminals, a file browser,
process start/stop/restart, an HTTP tunnel that puts any local dev server on a
public URL, and your Claude Code, Codex and Grok sessions rendered as chat.

One URL, from any browser or the phone app.

## Why it exists

Four machines, and no single place that knows what is running on them. A port
is in `lsof`, a process is in `pm2 list`, a credential is in a `.env` you have
to `ssh` to read. None of that is wrong — it is just spread across four
terminals and your memory.

## The four things

**The agent dials out.** No inbound port to open on the developer machine, no
VPN to join, no firewall rule to write. A laptop on hotel Wi-Fi is as reachable
as a rack server.

**Terminals are real tmux.** Close the browser and the build keeps running.
Reattach from your phone. Open a terminal natively and join the *same* session
— the agent writes a guarded block into your shell rc so it just happens. A
dropped socket detaches rather than kills; the PTY is held for 10 minutes.

**AI sessions read as chat, without scraping the TUI.** Claude Code, Codex and
Grok each already write a structured JSONL transcript. The agent tails that and
normalises all three into one event type, so an upstream release that redraws
the terminal UI does not break anything.

**The tunnel rewrites the app.** Absolute `/_next/` and `/api/` paths are
rewritten in HTML, JS and CSS, and an injected script patches `fetch`,
`XMLHttpRequest`, `history.pushState`, anchor clicks and the Navigation API.
That is why a real Next.js or PHP app works through it rather than half-loading.

## Quick start

You need Node, PostgreSQL, and a reverse proxy that can forward a WebSocket
upgrade.

```bash
createdb dialout
git clone https://github.com/indianic/dialout.git && cd dialout
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm run db:push               # local/dev only — creates the schema
npm run dev                   # http://localhost:50051
```

Open `http://localhost:50051`, register, and enrol two-factor. Two-factor is
mandatory and enforced by the API, not just the interface.

Then on each machine you want to see, after adding it under
**Settings → Machines** to get an `mch_…` key:

```bash
npm install -g dialout
devdash-agent init             # server URL + the mch_ key
devdash-agent install-service  # launchd or systemd, plus a cron watchdog
devdash-agent status
```

Full instructions: [installation guide](https://www.dialout.dev/docs/installation).

## Architecture

```
Browser ──HTTP──▶ Next.js :50051 ──HTTP (localhost)──┐
   │                                                 │
   └──WS /ws/* ──▶ ws-server :50052 ◀──WSS /daemon───┴── agent
                        │                               (your machine)
                   PostgreSQL
```

Three processes. The web app holds sessions, database writes and
authorization, and never talks to an agent directly. The WebSocket server is
the only thing that holds agent sockets, and binds `127.0.0.1` by default
because its relay endpoints are remote command execution if they are reachable.
The agent dials out and holds the socket open.

## What is in here

| Path | What it is |
| --- | --- |
| `src/app/(dash)` | The dashboard |
| `src/app/(marketing)` | The public site at www.dialout.dev |
| `src/app/api` | 38 routes, every one authenticated and every client-supplied id authorized |
| `src/ws-server` | The WebSocket process |
| `src/lib/schema.ts` | 19 tables, Drizzle |
| `packages/devdash-agent` | The CLI agent — 19 commands, macOS and Linux |
| `packages/devdash-shared` | Types shared by server, agent and mobile |
| `packages/devdash-mobile` | The Expo app |

## Self-hosting

One Postgres database, one Node process, one WebSocket process. Your data never
leaves your server. There is no hosted tier and no account to create with us.

Read [SECURITY.md](SECURITY.md) before you point a real machine at it — it
documents the auth model, the per-route authorization rules, and the two
settings that matter most when it faces the internet.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) is short on ceremony and long on the specific
things that will get a pull request sent back — the ones you cannot guess from
reading the code.

## Licence

MIT. See [LICENSE](LICENSE).
