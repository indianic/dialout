<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# src

## Purpose

All server-side and client-side source for the Next.js app **and** the long-lived WebSocket process. This is not a typical `src/` of a single process: `app/`, `components/`, `hooks/`, `lib/`, `types/` run inside Next.js on :50051; `ws-server/` is a separate Node process on :50052 started via `tsx src/ws-server/index.ts`.

## Key Files

None at this level — everything lives in subdirectories.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router: dashboard pages, REST API, full-screen terminal/session routes (see `app/AGENTS.md`) |
| `components/` | Client UI — flat feature components plus `ai/`, `dashboard/`, `help/` (see `components/AGENTS.md`) |
| `hooks/` | Browser WebSocket clients and a few UI hooks (see `hooks/AGENTS.md`) |
| `lib/` | Server-only shared modules: schema, auth, daemon bridge, crypto (see `lib/AGENTS.md`) |
| `types/` | Hand-maintained client interfaces, not inferred from Drizzle (see `types/AGENTS.md`) |
| `ws-server/` | Separate process that holds agent sockets and the HTTP tunnel (see `ws-server/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Treat `ws-server/` as a different process with a different runtime. Changes there do not hot-reload with Next.js in the same way.
- `lib/daemon-status.ts` is the only Next.js module that may call the ws-server.
- Do not import React components from `lib/` or Node-only modules from client components without a `'use client'` / server boundary check.

### Testing Requirements

`npm test` (vitest) matches `src/**/*.test.ts`. Colocated tests live next to the module or under `lib/__tests__/`. Agent tests are **not** here.

### Common Patterns

- REST handlers live under `app/api/*/route.ts`.
- Pages under `app/(dash)/` consume `useDashboard()` and stay presentational.
- Shared types for the UI go in `types/index.ts` **and** the matching Drizzle table in `lib/schema.ts`.

## Dependencies

### Internal

- `src/app/` → `src/lib/`, `src/components/`, `src/hooks/`, `src/types/`
- `src/lib/daemon-status.ts` → `src/ws-server/` HTTP API
- `src/ws-server/` → PostgreSQL (`src/lib/schema.ts` tables) and agent sockets

### External

Next.js 15, React 19, Drizzle, ws, xterm (via components).

<!-- MANUAL: -->
