<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# DevDash

## Purpose

Self-hosted, multi-user development control room. Tracks projects (ports, tech stack, notes, todos, credentials) across developer machines, live-checks whether each port is open, and — via an outbound-connecting agent — provides remote terminals (tmux-backed), filesystem browsing, folder-based project discovery, process start/stop/restart, an HTTP tunnel, and an AI-session chat surface that tails Claude Code / Codex / Grok transcripts.

The agent always connects *outbound* to the server. No inbound ports, no VPN, no port forwarding on developer machines.

Three processes:

```
Browser ──HTTP──> Next.js :50051 ──HTTP (localhost, X-Internal-Token)──┐
   │                                                                   │
   └──WS /ws/* (reverse-proxied)──> ws-server :50052 <──WSS /daemon────┴── devdash-agent
                                          │                                (developer machine)
                                     PostgreSQL
```

1. **Next.js app** (`src/app/`) — UI + REST API. Holds sessions, DB writes, authorization. Never talks to agents directly.
2. **ws-server** (`src/ws-server/index.ts`) — the only process that holds agent sockets.
3. **devdash-agent** (`packages/devdash-agent/`) — CLI daemon on each dev machine, published as `dialout`.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Root app scripts and dependencies. `npm test` is vitest over `src/**/*.test.ts` only — it does **not** run agent tests. |
| `CLAUDE.md` / `Claude.md` | Canonical architecture notes for agents. Prefer this over README.md (still a GitLab template). |
| `drizzle.config.ts` | Drizzle Kit config. `db:push` is LOCAL/DEV ONLY. |
| `ecosystem.config.cjs` | PM2: `$APP_NAME` (`next start -p 50051`, fork) + `$APP_NAME-ws` (`tsx src/ws-server/index.ts`). Keep `wait_ready` off. |
| `next.config.ts` | Next.js 15 App Router config. |
| `vitest.config.ts` | `environment: 'node'`, include `src/**/*.test.ts`. |
| `tsconfig.json` | TypeScript config for the web app. |
| `tailwind.config.ts` | Tailwind CSS 3. |
| `postcss.config.mjs` | PostCSS pipeline. |
| `.env.example` | Env template. `DATABASE_URL` and `JWT_SECRET` are required. |
| `.gitlab-ci.yml` | Single `deploy_production` job on `main`: SSH, pull, `npm run db:apply`, `npm run build`, PM2 restart. Pushing to `main` deploys production. |
| `README.md` | GitLab starter template — **not** the product spec. Use `docs/DEVDASH-GUIDE.md`. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Next.js app, REST API, shared libs, and the ws-server process (see `src/AGENTS.md`) |
| `packages/` | Agent CLI package (see `packages/AGENTS.md`) |
| `docs/` | Product spec, OpenAPI, design docs, executed plans (see `docs/AGENTS.md`) |
| `scripts/` | Idempotent production migrations, PM2 start, port killer, PWA icons (see `scripts/AGENTS.md`) |
| `public/` | PWA icons, manifest, service worker (see `public/AGENTS.md`) |

Skipped (tool-state / generated, no AGENTS.md): `.omc/`, `.impeccable/`, `.claude/`, `.superpowers/`, `node_modules/`, `.next/`, `data/`, `packages/devdash-agent/dist/`.

## For AI Agents

### Working In This Directory

- Ports: Next.js **50051**, ws-server **50052** — same in dev and prod. Both are force-cleared on start.
- `src/lib/daemon-status.ts` is the **only** module allowed to call the ws-server. Next.js never opens a socket to an agent.
- New agent capability = new message type on both ends + a `daemon-status.ts` wrapper + ws-server HTTP route.
- Schema changes in production go through `scripts/apply-*.mjs`, **not** `drizzle-kit push`. Add the new script to `ORDER` in `scripts/apply-migrations.mjs` or CI fails the deploy.
- Secrets (`twoFactorSecretEnc`, `projectCredentials.secretEnc`, `machineApiKeys.keyEnc`) are AES-256-GCM via `src/lib/secret-crypto.ts` and are never returned by list endpoints.
- Frontend uses relative API URLs (`/api/...`) — never hardcode a host.
- Comments explain *why* a non-obvious choice was made. Preserve them.
- Overlays are query-param driven (`?new=1`, `?edit=<id>`). Don't add local modal booleans.
- Don't open raw `WebSocket`s in components — go through `src/hooks/useDevDashSocket.ts` / `useDashboardSocket.ts`.
- Auth: `getSession()` accepts cookie or `Authorization: Bearer`. Native clients send `X-DevDash-Client: native` to receive the JWT in the body. Do not copy unguarded `machineId` patterns from older terminal routes — use `userOwnsMachine`.
- Agent is `os: ["darwin", "linux"]` and ships `dist/` — **build before publishing**.

### Testing Requirements

```bash
npm test                          # vitest — src/**/*.test.ts only
cd packages/devdash-agent && npm test   # tsc + node --test over test/*.test.js
npx tsc --noEmit                  # typecheck the web app
```

Two test runners do not overlap. Root `npm test` does not run agent tests.

### Common Patterns

- Drizzle schema: camelCase properties → snake_case columns; timestamps are `text` defaulted to `now()`, not `timestamp`.
- Adding a daemon capability: agent handler → `websocket.ts` message type → ws-server `handleDaemonMessage` case → exported `request*()` → HTTP route on ws-server → wrapper in `daemon-status.ts` → Next.js API route.
- `AiKind` is a union and `ADAPTERS` is `Record<AiKind, AiAdapter>` — adding a vendor without an adapter is a compile error.

## Dependencies

### Internal

- `src/` ↔ `src/ws-server/` via localhost HTTP + `X-Internal-Token` (`WS_INTERNAL_TOKEN` or `sha256(JWT_SECRET)`).
- `packages/devdash-agent/` talks to the ws-server over WSS `/daemon` with `X-API-Key` (`mch_…`).

### External

- Next.js 15 + React 19, Tailwind CSS 3, Drizzle ORM + postgres, jose (JWT), otplib (TOTP), ws, xterm, nodemailer, web-push.
- Agent: commander, node-pty, ws, smol-toml.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
