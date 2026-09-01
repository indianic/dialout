<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# scripts

## Purpose

Deploy-time and local-ops scripts. The important invariant: production schema changes are **idempotent** `apply-*.mjs` files run on every deploy via one entry point. One-shot scripts are deliberately not named `apply-*`.

## Key Files

| File | Description |
|------|-------------|
| `apply-migrations.mjs` | Ordered list of every `apply-*.mjs`. `.gitlab-ci.yml` calls `npm run db:apply`. **Refuses to run — failing the deploy — if any `apply-*.mjs` on disk is missing from `ORDER`.** |
| `apply-2fa-columns.mjs` | Idempotent 2FA columns. |
| `apply-auth-security-columns.mjs` | Auth lockout / security columns. |
| `apply-cowork-columns.mjs` | Terminal/cowork registry columns (`tmuxName`, `isLive`, `origin`, …). |
| `apply-process-control-columns.mjs` | Project process-control columns. |
| `apply-project-credentials.mjs` | Encrypted project credentials table/columns. |
| `apply-push-subscriptions.mjs` | Web-push subscription table. |
| `apply-terminal-last-seen.mjs` | `lastSeenAt` (server receipt time — use this for staleness, not `lastActiveAt`). |
| `apply-terminal-naming-columns.mjs` | Terminal naming prefs. |
| `hash-existing-pins.mjs` | One-shot PIN rehash. **Not** `apply-*` on purpose — do not add it to `ORDER`. |
| `start.sh` | PM2 start/stop/restart behind `npm run pm2:*`. Builds if `.next/BUILD_ID` is missing, force-frees the port, `pm2 save`. |
| `kill-port.js` | `lsof` kill of the Next.js port; used by `npm run dev` / `start`. |
| `generate-pwa-icons.js` | Regenerates `public/icon-*.png` and apple-touch-icon. |
| `install-claude-remote.sh` | Helper for installing Claude remote tooling. |
| `project-scanner.mjs` | Standalone scanner utility (not the agent module). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

A new column means **three** edits, or the deploy breaks loudly:

1. `src/lib/schema.ts`
2. a new `scripts/apply-<name>.mjs` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`)
3. add that filename to `ORDER` in `apply-migrations.mjs`

Never add a non-idempotent script to `ORDER` — they run on every single deploy. Never run `drizzle-kit push` against prod; it would diff and drop.

### Testing Requirements

`apply-migrations.mjs` is the gate: it must list every `apply-*.mjs` on disk. After adding a script, run `node scripts/apply-migrations.mjs` against a local DB (or at least confirm `ORDER` includes the new file).

### Common Patterns

Each `apply-*.mjs` is standalone and re-runnable. Prefer `IF NOT EXISTS`.

## Dependencies

### Internal

- `src/lib/schema.ts` — the intended shape
- `.gitlab-ci.yml` — calls `npm run db:apply` before `npm run build`

### External

`postgres` driver via `DATABASE_URL`.

<!-- MANUAL: -->
