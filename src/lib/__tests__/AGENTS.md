<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# __tests__

## Purpose

Vitest files for `src/lib` modules that aren't colocated. Colocated tests (`ai-notify.test.ts`, `auth-bearer.test.ts`, `ws-auth.test.ts`) stay next to the module — don't move them here without a reason.

## Key Files

| File | Description |
|------|-------------|
| `backup-codes.test.ts` | 2FA backup-code hash/consume. |
| `otp.test.ts` | Email OTP. |
| `pending-token.test.ts` | Login→2FA pending tokens. |
| `totp.test.ts` | TOTP verify + lockout separation from PIN counters. |
| `trusted-device.test.ts` | Remember-this-device. |
| `write-queue.test.ts` | Serialized write queue. |
| `terminal-scrollback-cache.test.ts` | Scrollback cache. |
| `terminal-prefs.test.ts` | Terminal naming prefs. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

`npm test` includes these via `src/**/*.test.ts`. Match the existing style (node environment, no jsdom). When adding a lib module, colocate *or* add a file here — not both.

### Testing Requirements

This directory *is* the tests.

### Common Patterns

Direct imports of `src/lib/*.ts`. Prefer hashing/token tests over mocking Drizzle unless the module is DB-bound.

## Dependencies

### Internal

`src/lib/`

### External

`vitest`

<!-- MANUAL: -->
