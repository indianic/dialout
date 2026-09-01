# Contributing to Dialout

Thanks for looking. This document is short on ceremony and long on the specific
things that will get a pull request rejected, because those are the parts you
cannot guess from the code.

## Getting it running

```bash
createdb dialout
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run db:push               # local/dev only — never against a real database
npm run dev                   # http://localhost:50051
```

`npm run dev` starts two processes: Next.js on **50051** and the WebSocket
server on **50052**. Both ports are force-cleared on start, so a stale process
from a previous run is not something you need to hunt down.

To exercise anything that touches a developer machine — terminals, the file
browser, port checks, tunnels — you also need the agent running locally:

```bash
cd packages/devdash-agent && npm run build
node dist/cli.js init         # point it at http://localhost:50051
node dist/cli.js start
```

## Before you open a pull request

```bash
npm run typecheck                        # must exit 0
npm test                                 # vitest, web app
npm run build                            # must exit 0
cd packages/devdash-agent && npm test    # node:test, agent
```

Those are two separate test runners and they do not overlap. **Root `npm test`
does not run the agent's tests.** If you touched `packages/devdash-agent`, run
both.

## Things that will get a PR sent back

**Adding a database column without the migration script.** Production schema
changes go through standalone idempotent `scripts/apply-*.mjs` files, not
`drizzle-kit push`. A new column means three edits, not one:

1. `src/lib/schema.ts`
2. a new `scripts/apply-<thing>.mjs` using `ADD COLUMN IF NOT EXISTS`
3. **that script added to the `ORDER` list in `scripts/apply-migrations.mjs`**

Step 3 is the one people forget. The migration entry point refuses to run if
any `apply-*.mjs` on disk is missing from its list, so forgetting it fails the
deploy loudly instead of shipping an app with a missing column. Never put a
non-idempotent script in that list — they run on every single deploy.

**Authorizing a route with a session check alone.** `getSession()` proves the
caller is *some* user. Any route taking a `machineId`, `projectId` or row id
from the client must also prove ownership, through `src/lib/machine-access.ts`
or `src/lib/project-access.ts`. Do not hand-roll the query. For a child row,
resolve it to its project and authorize that; scope the final `UPDATE`/`DELETE`
to both the row id and the parent id. Prefer `404` over `403` when denying by
id. `src/lib/__tests__/project-access.test.ts` pins these rules.

**Opening a WebSocket from a component.** Go through `useDevDashSocket` or
`useDashboardSocket`. There is exactly one socket per browser and every PTY
session plus dashboard events are multiplexed over it.

**Calling the ws-server from a Next.js route.** `src/lib/daemon-status.ts` is
the only module allowed to do that. A new agent capability is a full path:
agent handler → `websocket.ts` message type → ws-server `handleDaemonMessage`
case → exported `request*()` → HTTP route in the ws-server → wrapper in
`daemon-status.ts` → Next.js API route. Short-cutting it is the rejection.

**A local modal boolean.** Overlays are query-param driven — `?new=1`,
`?edit=<id>`, `?delete=<id>`, `?share=<id>`, `?tab=notes` — so they are
linkable and Escape-closable. `GlobalOverlays` renders from the URL.

**A gradient.** The design system has one interactive blue and status colors
that carry meaning. `--g1/--g2/--g3` still exist only because 60+ call sites
reference them, and they are all set to the same flat color. Adding a gradient
makes the surface look like a different product.

**Deleting a "why" comment.** Comments in this codebase explain non-obvious
choices — ordering guarantees, why the 2FA lockout counters are split, why the
ws-server binds `127.0.0.1`, why PM2 runs in fork mode. They encode bugs that
were already paid for. Preserve them when refactoring.

**AI attribution in a commit message.** No `Co-Authored-By:` trailer for a
model, no session links, no generated-with footers. The commit author is you.

## Commit messages

Conventional-commit prefixes, imperative mood, lowercase subject:

```
feat(terminals): resume a browser session by deterministic name
fix(auth): split 2FA lockout counters from PIN counters
docs: bring the guide up to date with v3.0
```

## Where the documentation is

- `docs/DEVDASH-GUIDE.md` — the narrative product spec
- `CLAUDE.md` / `AGENTS.md` — the architecture map, kept current
- `docs/api/openapi.yaml` — the HTTP contract for native clients. It is
  hand-maintained, not generated, and a shipped mobile app is pinned to it.
  **A route change updates it in the same commit.**

## Reporting bugs and asking for features

Use the issue templates. For anything security-related, do not open an issue —
see [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the MIT
Licence that covers this project.
