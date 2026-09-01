# Product Inventory and Marketing Site Plan

**Date:** 2026-08-31
**Purpose:** the source of truth for what the product does, written so it can be lifted into a marketing site.

Counts below were measured from the repo on 2026-08-31. Re-measure before publishing any of them.

## What it is, in one paragraph

Dialout is a self-hosted development control room. It tracks every project across every machine you own — ports, stack, notes, todos, credentials — and live-checks what is actually running. An agent on each machine connects **outbound** to your server, which then gives you remote tmux terminals, a file browser, process start/stop/restart, an HTTP tunnel that puts any local dev server on a public URL, and your Claude Code, Codex and Grok sessions rendered as chat. One URL, from any browser or the phone app.

## The four things nothing else does together

Lead the site with these. Each is defensible and specific.

**1. The agent dials out.** No inbound ports, no VPN, no port forwarding, no firewall rule on the developer's machine. A laptop on hotel Wi-Fi is as reachable as a rack server. Every remote-management tool has to solve this; most solve it by asking you to open something.

**2. Terminals are real tmux, not a web shell.** Close the browser and the session keeps running. Reattach from the phone. Attach to the *same* session from your native terminal — the agent writes a guarded wrapper into your shell rc so a terminal you open normally joins the same tmux. A dropped socket detaches, it does not kill; the PTY is held for 10 minutes so a reconnect resumes exactly where you were.

**3. AI sessions read as chat, and it never scrapes the TUI.** Claude Code, Codex and Grok each already write a structured JSONL transcript. The agent tails that file and normalises it. Scraping the alternate-screen TUI would break on every upstream release; this does not. Three vendors, one chat surface, across every machine.

**4. The tunnel rewrites the app so it survives a path prefix.** Absolute `/_next/` and `/api/` paths get rewritten in HTML, JS and CSS, and an injected script patches `fetch`, `XMLHttpRequest`, `history.pushState`, anchor clicks and the Navigation API. That is why a real Next.js or PHP app works through it rather than half-loading.

## Full feature inventory

### Projects

| Feature | What to say |
| --- | --- |
| Live port checks | Every dashboard load checks every port. If the machine's agent is online the check is batched through it; otherwise it falls back to an 800 ms TCP probe. Port-less URL projects are checked through the tunnel. |
| Multi-machine projects | One project can map onto several machines with per-machine port and root-path overrides. |
| Process control | Start, stop and restart from the browser or phone, using quick-launch commands you saved per project. |
| Notes and todos | Per project, so context travels with the project instead of living in your head. |
| Credentials vault | AES-256-GCM at rest. Never returned by list endpoints — only by an explicit reveal route, gated behind Face ID on mobile. |
| Sharing | Read-only access for a teammate, with comments, and an optional terminal grant. Non-owners never get edit paths. |
| Port and folder discovery | Scan a port range to find what is running; scan a folder tree to find projects you have not registered yet. |

### Terminals

| Feature | What to say |
| --- | --- |
| tmux-backed | Survives browser reloads, network drops and app switches. |
| Cowork | Your native terminal and the browser attach to the same session. |
| Resumable by name | Session names are deterministic, so reopening attaches instead of creating a duplicate. |
| Recording and playback | Sessions record to chunks and replay at `/sessions/<id>`, purged on a per-user retention policy. |
| Local vs Web split | The registry separates sessions you started natively from ones the browser opened. |
| Phone terminal | A real terminal on the phone, with a key-chip bar for the keys a soft keyboard does not have. |

### AI sessions

| Feature | What to say |
| --- | --- |
| Three vendors | Claude Code, Codex, Grok — each with its own transcript layout and cwd-escaping scheme, all normalised to one event type. |
| Every machine, one list | See which agents are working, waiting, or idle across your whole fleet. |
| Launch mode | Start a new session from the phone. Each message runs one turn and exits, so an agent restart loses nothing — the transcript is the state. |
| Push when it needs you | A notification fires only on working → waiting, with a two-minute cooldown, and never on a first sighting. |

### Infrastructure

| Feature | What to say |
| --- | --- |
| HTTP tunnel | Any local port, or a named vhost for PHP and static sites, on a public URL. 10 MB body cap. Styled pages for "machine offline" and "server not running". |
| File browser | Browse any machine's filesystem from the dashboard. |
| System services registry | Track the services that are not projects. |
| Machines and API keys | Each machine enrols with an `mch_…` key, SHA-256 compared server-side. |

### Account and platform

| Feature | What to say |
| --- | --- |
| PIN + mandatory TOTP | Two-factor is enforced at the API layer, not just hidden in the UI. |
| Native and browser sessions | One JWT, delivered as an HttpOnly cookie to browsers and as a bearer token to native clients. Page scripts can never read the token. |
| Web push | Notifications for shares, comments and AI sessions that need you. |
| PWA and mobile app | Installable web app, plus native iOS and Android builds. |
| Themes | Light and dark, contrast-measured. |

### The agent

19 CLI commands covering `init`, profiles, service install for launchd and systemd, a cron watchdog, `setup-cowork`, `repair`, and self-update. Ships for macOS and Linux.

## Proof points

Use these instead of adjectives.

- 38 API routes, every one authenticated and every client-supplied id authorized
- 19 database tables
- 19 agent CLI commands
- 18 mobile screens
- One 1,753-line WebSocket process holds every agent socket
- 3 AI vendors, added without changing the chat surface
- Agent v2.7.4, published to a private registry
- Secrets encrypted with AES-256-GCM; the ws-server refuses to start without a signing secret

## Positioning against the neighbours

Do not name competitors on the site. Describe the category gap instead — it ages better and avoids picking fights.

| Category | The gap Dialout fills |
| --- | --- |
| Server dashboards and container UIs | Built for servers you deploy to, not for the laptops you develop on. |
| Mesh VPNs | Solve the network problem well, then leave you to assemble the dashboard, terminals, and previews yourself. |
| Tunnel services | Give you a public URL and nothing else — no project registry, no terminals, no fleet view. |
| Remote-development IDE extensions | Tie you to one editor and one machine at a time. |

The honest summary: several tools do one of these well. Dialout's claim is that the combination is the product, and that the outbound-only agent is what makes the combination cheap to run.

## Marketing site structure

### Home

1. **Hero.** Headline: *Your machines, one room.* Sub: *A self-hosted control room for every project on every machine you own. The agent dials out, so nothing has to dial in.* Primary CTA `Install the agent` (ink pill), secondary `View on GitHub` (text link).
2. **The problem, in a terminal block.** The `lsof -i :3000 / ssh build-box / pm2 list / cat .env` sequence from the existing guide. It lands because every reader has typed it this week.
3. **The four differentiators**, one row each, alternating screenshot side.
4. **How it works** — the architecture diagram, with the outbound arrow emphasised.
5. **Feature grid** — the inventory above, condensed to a title and one line each.
6. **Self-hosting block** — what you need, what it costs, where the data lives.
7. **Install** — the four commands, copyable.
8. **Footer** — GitHub, docs, licence.

### Other pages

| Page | Contains |
| --- | --- |
| `/features` | The full inventory, one section per group, screenshot each |
| `/how-it-works` | Architecture, the outbound principle, the three processes, the tunnel rewrite |
| `/security` | Auth model, per-route authorization, encryption at rest, the `127.0.0.1` bind, why 2FA is mandatory |
| `/mobile` | The phone app, with device shots — terminal, AI chat, project list |
| `/docs` | Or link out to the repo guide |
| `/install` | Server setup and agent setup, copy-paste blocks |

### Copy blocks ready to use

**Hero sub:**
> A self-hosted control room for every project on every machine you own. Ports, terminals, live previews and your AI sessions — one URL, from any browser or your phone.

**Outbound principle:**
> The agent connects out to your server and holds the socket open. There is no inbound port to open, no VPN to join, and no firewall rule to write. If the machine can reach the internet, you can reach the machine.

**Terminals:**
> Real tmux sessions, not a web shell. Close the tab and the build keeps running. Reattach from your phone. Open a terminal natively and join the same session — the agent wires your shell rc so it just happens.

**AI sessions:**
> Claude Code, Codex and Grok, across every machine, as chat. It reads the transcript each CLI already writes rather than scraping the terminal UI, so an upstream release does not break it. Get a push when an agent is waiting on you.

**Self-hosting:**
> One Postgres database, one Node process, one WebSocket process. Your data never leaves your server. There is no hosted tier and no account to create with us.

## Assets the site needs

- Architecture diagram, redrawn from the ASCII in `docs/DEVDASH-GUIDE.md`, with the outbound arrow as the visual emphasis
- Dark-theme screenshots: projects list, a terminal, the AI chat, a tunnel preview, the phone app
- Social card, 1200×630, per [brand-guidelines.md](brand-guidelines.md)
- A 30–60 second screen recording: register a machine, see ports go live, open a terminal, open a tunnel

## Before launch

- [ ] Buy the domains listed in [naming-and-domain.md](naming-and-domain.md)
- [ ] Clear the wordmark with a lawyer
- [ ] Rebuild the icon — the shipped one has construction guides in it
- [ ] Replace `public/favicon.svg`; its purple gradient is in no other part of the product
- [ ] Choose a licence and put it in the repo root
- [ ] Re-measure every count in this document
- [ ] Update `docs/DEVDASH-GUIDE.md`, still marked v2.0 / May 2026 and predating AI sessions, the mobile app, credentials, process control and 2FA
