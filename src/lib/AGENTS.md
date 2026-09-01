<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# lib

## Purpose

Server-only shared modules: Drizzle schema and DB client, auth (PIN + TOTP + JWT), the **only** Next.js→ws-server bridge, AES-256-GCM secrets, access guards, notifications, and port checks. If it talks to Postgres, SMTP, VAPID, or the ws-server, it belongs here — not in a route file.

## Key Files

| File | Description |
|------|-------------|
| `schema.ts` | Single Drizzle schema. camelCase props → snake_case columns. Timestamps are `text` defaulted to `now()`. |
| `db.ts` | Postgres client + drizzle instance. |
| `daemon-status.ts` | **Only** module allowed to call the ws-server. Posts to `http://localhost:${WS_PORT}` with `X-Internal-Token`. |
| `auth.ts` | `getSession()` — cookie `devdash-session` or `Authorization: Bearer`. Bearer wins if both present. |
| `ws-auth.ts` | Shared JWT verify for HTTP and WS upgrade. |
| `secret-crypto.ts` | AES-256-GCM. Never return ciphertext from list endpoints. |
| `machine-access.ts` | `userOwnsMachine` — the guard to copy. AI-session and browse routes use it. |
| `project-access.ts` | Owner vs share (read-only, optional `allowTerminal`). |
| `pin-hash.ts` | PIN hashing. |
| `totp.ts` / `otp.ts` / `backup-codes.ts` | TOTP, email OTP, 2FA reset codes. 2FA lockout columns are **separate** from PIN-login counters — login clears PIN counters on a correct PIN, so sharing them would let a PIN-holder reset TOTP lockout. |
| `pending-token.ts` | Short-lived tokens between login and 2FA verify. |
| `trusted-device.ts` | Remember-this-device cookies. |
| `port-check.ts` | Local TCP probe (800 ms) used when the agent is offline. |
| `email.ts` | Nodemailer SMTP. |
| `notify.ts` | In-app notifications table. |
| `ai-notify.ts` | Push only on `working → waiting_*`, 2-minute cooldown; a first sighting never fires (reconnect burst). |
| `push.ts` | Web-push send. Disabled when VAPID unset. |
| `terminal-name.ts` | Deterministic / user-pref terminal names. `tmuxSessionName()` must stay deterministic — browser sessions resume by name. |
| `terminal-scrollback-cache.ts` | Client scrollback cache helpers (tested). |
| `write-queue.ts` | Serialized async write queue. |

Colocated tests: `ai-notify.test.ts`, `auth-bearer.test.ts`, `ws-auth.test.ts`. More under `__tests__/`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `__tests__/` | Additional vitest files for lib modules (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Schema change: edit `schema.ts`, write `scripts/apply-*.mjs`, add it to `ORDER` in `scripts/apply-migrations.mjs`.
- Do not let a Next.js route open a socket to an agent — go through `daemon-status.ts`.
- Do not return decrypted secrets except from an explicit reveal route (`credentials/[credId]/reveal`).
- `userOwnsMachine` is the pattern for any caller-supplied `machineId`. Terminals/recordings currently scope by `userId` instead — do not copy that; adding a check to an existing unguarded route is a behavior change, call it out.

### Testing Requirements

`npm test` picks up `src/lib/**/*.test.ts` and `src/lib/__tests__/*.test.ts`. Auth, TOTP, OTP, backup codes, trusted-device, write-queue, scrollback cache, and ai-notify have coverage — extend those rather than inventing a second test style.

### Common Patterns

- Timestamps: `text` ISO strings, not `timestamp` columns.
- Secrets: encrypt at rest, reveal-only routes.
- Constant-time compares on the ws-server side; this dir just derives the token the same way (`WS_INTERNAL_TOKEN` or `sha256(JWT_SECRET)`).

## Dependencies

### Internal

`src/ws-server/` (via HTTP), `src/app/api/*` (consumers).

### External

`drizzle-orm`, `postgres`, `jose`, `otplib`, `nodemailer`, `web-push`.

<!-- MANUAL: -->
