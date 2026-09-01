# 2FA (TOTP) + Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticator-app (TOTP) two-factor authentication to DevDash with mandatory enrollment, emailed-code + backup-code recovery, a "trust this device" window, and a self-service profile page.

**Architecture:** Pure security helpers (`totp`, `backup-codes`, `trusted-device`, `pending-token`) are unit-tested with vitest. The existing `/api/auth` route gains a 2FA branch and enrollment/verify/reset actions; a new `/api/profile` route handles authenticated account mutations. The frontend `LoginPage` becomes a multi-step state machine, a shared `TwoFactorWizard` drives enrollment, and a new `/profile` page hosts account settings. TOTP secrets are encrypted at rest with the existing AES-256-GCM `secret-crypto.ts`; backup codes and PINs are scrypt-hashed via the existing `pin-hash.ts`.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle ORM + PostgreSQL, `jose` (JWT), `otplib` (TOTP), `qrcode` (QR data-URL), `vitest` (unit tests, new).

## Global Constraints

- Node/Next runtime only — TOTP + QR must run server-side; QR is rendered as a self-contained data-URL (no external requests, consistent with the app CSP posture).
- Reuse existing primitives — `hashSecret`/`verifySecret`/`isHashed` (`src/lib/pin-hash.ts`), `encryptSecret`/`decryptSecret` (`src/lib/secret-crypto.ts`), `createSession`/`getSession`/`clearSession` (`src/lib/auth.ts`), `shell`/`ctaButton` email builders (`src/lib/email.ts`). Do not reimplement them.
- The existing `otpCode` field is the 4-digit **PIN**; never rename it. New fields are additive and nullable.
- All new email-code flows reuse the existing anti-enumeration pattern: return a generic success regardless of whether the account exists, enforce per-account cooldown, TTL, and attempt limits (mirror `request-reset`/`confirm-reset`).
- Cookies match the existing session cookie options: `httpOnly: true, sameSite: 'lax', path: '/'` (no explicit `secure`, since the app is served over internal HTTP behind Apache TLS).
- Verify web-app changes with `npx tsc --noEmit` and `npm run build`. Run unit tests with `npx vitest run`. Schema changes are applied with `npm run db:push`.
- Constants (defined once): `TRUSTED_DEVICE_DAYS = 14`, `PENDING_TOKEN_TTL = '5m'`, `ENROLL_CODE_TTL_MINUTES = 15`, `BACKUP_CODE_COUNT = 8`, `TOTP_WINDOW = 1`.

---

## File Structure

**Create:**
- `src/lib/totp.ts` — TOTP secret gen, otpauth URI, verify (otplib wrapper)
- `src/lib/backup-codes.ts` — generate/hash/consume one-time backup codes
- `src/lib/trusted-device.ts` — per-user HMAC trusted-device cookie value + key gen
- `src/lib/pending-token.ts` — short-lived purpose-scoped JWT (jose)
- `src/lib/__tests__/totp.test.ts`
- `src/lib/__tests__/backup-codes.test.ts`
- `src/lib/__tests__/trusted-device.test.ts`
- `src/lib/__tests__/pending-token.test.ts`
- `vitest.config.ts`
- `src/app/api/profile/route.ts` — authenticated account mutations
- `src/app/profile/page.tsx` — profile route (server shell)
- `src/components/ProfilePage.tsx` — profile UI (client)
- `src/components/TwoFactorWizard.tsx` — shared enrollment wizard (client)

**Modify:**
- `src/lib/schema.ts` — add 2FA/email-change fields to `users`
- `src/lib/email.ts` — 4 new templates
- `src/app/api/auth/route.ts` — login 2FA branch + enroll/verify/reset actions + GET flag
- `src/components/LoginPage.tsx` — multi-step login (TOTP prompt, launch wizard, lost-authenticator)
- `src/app/page.tsx` — mandatory-enrollment gate + profile link wiring
- `package.json` — deps (`otplib`, `qrcode`, `@types/qrcode`), devDep (`vitest`), `test` script

---

## Task 1: Dependencies, vitest scaffold, and schema fields

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/smoke.test.ts` (temporary)
- Modify: `src/lib/schema.ts:4-18`

**Interfaces:**
- Produces: the `users` table columns consumed by every later task: `twoFactorEnabled`, `twoFactorSecretEnc`, `twoFactorPendingSecretEnc`, `twoFactorBackupCodes`, `deviceTrustKey`, `enrollCode`, `enrollCodeExpires`, `enrollAttempts`, `pendingEmail`, `emailChangeCode`, `emailChangeExpires`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install otplib qrcode && npm install -D vitest @types/qrcode
```
Expected: packages added, no peer-dep errors.

- [ ] **Step 2: Add the `test` script**

In `package.json` `scripts`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create a smoke test**

`src/lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run`
Expected: 1 passed.

- [ ] **Step 6: Add schema fields**

In `src/lib/schema.ts`, extend the `users` table (after `lockoutUntil` on line 17), keeping the existing fields untouched:
```ts
  // Two-factor (TOTP authenticator app).
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecretEnc: text('two_factor_secret_enc'),          // AES-256-GCM (secret-crypto.ts)
  twoFactorPendingSecretEnc: text('two_factor_pending_secret_enc'), // held during enrollment
  twoFactorBackupCodes: text('two_factor_backup_codes'),      // JSON: {hash, usedAt}[]
  deviceTrustKey: text('device_trust_key'),                   // rotates to revoke trusted devices
  // Emailed OTP that gates the QR step during 2FA enrollment.
  enrollCode: text('enroll_code'),
  enrollCodeExpires: text('enroll_code_expires'),
  enrollAttempts: integer('enroll_attempts').default(0),
  // Change-email re-verification (code sent to the NEW address).
  pendingEmail: text('pending_email'),
  emailChangeCode: text('email_change_code'),
  emailChangeExpires: text('email_change_expires'),
```
`boolean` and `integer` are already imported on line 1 — no import change needed.

- [ ] **Step 7: Push schema and typecheck**

Run: `npm run db:push && npx tsc --noEmit`
Expected: push reports the new columns added; tsc exits 0.

- [ ] **Step 8: Remove the smoke test and commit**

```bash
rm src/lib/__tests__/smoke.test.ts
git add package.json package-lock.json vitest.config.ts src/lib/schema.ts
git commit -m "chore(2fa): deps, vitest scaffold, and users 2FA schema fields"
```

---

## Task 2: TOTP helper (`src/lib/totp.ts`)

**Files:**
- Create: `src/lib/totp.ts`
- Test: `src/lib/__tests__/totp.test.ts`

**Interfaces:**
- Produces:
  - `generateTotpSecret(): string` — base32 secret
  - `buildOtpauthUri(secret: string, accountEmail: string): string`
  - `verifyTotp(token: string, secret: string): boolean` — ±1 step window
  - `TOTP_WINDOW = 1`, `TOTP_ISSUER = 'DevDash'`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/totp.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { generateTotpSecret, buildOtpauthUri, verifyTotp } from '../totp';

describe('totp', () => {
  it('generates a non-empty base32 secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies a code produced from the same secret', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('000000', secret)).toBe(false);
  });

  it('rejects a malformed / empty token safely', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('', secret)).toBe(false);
    expect(verifyTotp('abc', secret)).toBe(false);
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'a@b.com');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('DevDash');
    expect(uri).toContain('a%40b.com');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/__tests__/totp.test.ts`
Expected: FAIL — cannot find module `../totp`.

- [ ] **Step 3: Implement `src/lib/totp.ts`**

```ts
import { authenticator } from 'otplib';

// TOTP (RFC 6238) via otplib. Secrets are stored encrypted at rest
// (secret-crypto.ts); only plaintext base32 secrets pass through here.

export const TOTP_WINDOW = 1;      // accept ±1 30s step for clock drift
export const TOTP_ISSUER = 'DevDash';

authenticator.options = { window: TOTP_WINDOW };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUri(secret: string, accountEmail: string): string {
  return authenticator.keyuri(accountEmail, TOTP_ISSUER, secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  const clean = (token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return authenticator.check(clean, secret);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/__tests__/totp.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/totp.ts src/lib/__tests__/totp.test.ts
git commit -m "feat(2fa): TOTP helper with drift window and unit tests"
```

---

## Task 3: Backup codes (`src/lib/backup-codes.ts`)

**Files:**
- Create: `src/lib/backup-codes.ts`
- Test: `src/lib/__tests__/backup-codes.test.ts`

**Interfaces:**
- Consumes: `hashSecret`, `verifySecret` from `src/lib/pin-hash.ts`.
- Produces:
  - `interface BackupCode { hash: string; usedAt: string | null }`
  - `generateBackupCodes(count?: number): { plain: string[]; stored: BackupCode[] }`
  - `consumeBackupCode(input: string, stored: BackupCode[]): { ok: boolean; updated: BackupCode[] }`
  - `serializeBackupCodes(stored: BackupCode[]): string` / `parseBackupCodes(json: string | null): BackupCode[]`
  - `BACKUP_CODE_COUNT = 8`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/backup-codes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  generateBackupCodes, consumeBackupCode,
  serializeBackupCodes, parseBackupCodes, BACKUP_CODE_COUNT,
} from '../backup-codes';

describe('backup-codes', () => {
  it('generates the configured number of unique formatted codes', () => {
    const { plain, stored } = generateBackupCodes();
    expect(plain).toHaveLength(BACKUP_CODE_COUNT);
    expect(stored).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(plain).size).toBe(BACKUP_CODE_COUNT);
    for (const c of plain) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    for (const s of stored) expect(s.usedAt).toBeNull();
  });

  it('consumes a valid code once and rejects reuse', () => {
    const { plain, stored } = generateBackupCodes();
    const first = consumeBackupCode(plain[0], stored);
    expect(first.ok).toBe(true);
    const again = consumeBackupCode(plain[0], first.updated);
    expect(again.ok).toBe(false);
  });

  it('accepts codes case-insensitively and ignoring dashes', () => {
    const { plain, stored } = generateBackupCodes();
    const noDash = plain[1].replace('-', '').toUpperCase();
    expect(consumeBackupCode(noDash, stored).ok).toBe(true);
  });

  it('rejects an unknown code', () => {
    const { stored } = generateBackupCodes();
    expect(consumeBackupCode('zzzz-zzzz', stored).ok).toBe(false);
  });

  it('round-trips through serialize/parse', () => {
    const { stored } = generateBackupCodes();
    const parsed = parseBackupCodes(serializeBackupCodes(stored));
    expect(parsed).toHaveLength(BACKUP_CODE_COUNT);
    expect(parseBackupCodes(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/__tests__/backup-codes.test.ts`
Expected: FAIL — cannot find module `../backup-codes`.

- [ ] **Step 3: Implement `src/lib/backup-codes.ts`**

```ts
import { randomBytes } from 'crypto';
import { hashSecret, verifySecret } from './pin-hash';

// One-time recovery codes. Stored hashed (scrypt, same as the PIN); the
// plaintext set is shown to the user exactly once at generation time.

export const BACKUP_CODE_COUNT = 8;

export interface BackupCode {
  hash: string;
  usedAt: string | null;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous l/o/0/1

function randomCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function normalize(input: string): string {
  return (input || '').replace(/-/g, '').trim().toLowerCase();
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): { plain: string[]; stored: BackupCode[] } {
  const plain: string[] = [];
  while (plain.length < count) {
    const c = randomCode();
    if (!plain.includes(c)) plain.push(c);
  }
  const stored = plain.map((c) => ({ hash: hashSecret(normalize(c)), usedAt: null as string | null }));
  return { plain, stored };
}

export function consumeBackupCode(input: string, stored: BackupCode[]): { ok: boolean; updated: BackupCode[] } {
  const candidate = normalize(input);
  if (!candidate) return { ok: false, updated: stored };
  for (let i = 0; i < stored.length; i++) {
    const entry = stored[i];
    if (entry.usedAt) continue;
    if (verifySecret(candidate, entry.hash)) {
      const updated = stored.slice();
      updated[i] = { ...entry, usedAt: new Date().toISOString() };
      return { ok: true, updated };
    }
  }
  return { ok: false, updated: stored };
}

export function serializeBackupCodes(stored: BackupCode[]): string {
  return JSON.stringify(stored);
}

export function parseBackupCodes(json: string | null): BackupCode[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/__tests__/backup-codes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/backup-codes.ts src/lib/__tests__/backup-codes.test.ts
git commit -m "feat(2fa): one-time backup codes (hashed, single-use)"
```

---

## Task 4: Trusted-device cookie (`src/lib/trusted-device.ts`)

**Files:**
- Create: `src/lib/trusted-device.ts`
- Test: `src/lib/__tests__/trusted-device.test.ts`

**Interfaces:**
- Produces:
  - `TRUSTED_DEVICE_DAYS = 14`, `TRUSTED_COOKIE = 'devdash-trust'`
  - `generateDeviceTrustKey(): string`
  - `issueTrustedCookieValue(userId: number, key: string, days?: number, nowMs?: number): string`
  - `verifyTrustedCookieValue(value: string | undefined, userId: number, key: string | null, nowMs?: number): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/trusted-device.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  generateDeviceTrustKey, issueTrustedCookieValue, verifyTrustedCookieValue,
} from '../trusted-device';

describe('trusted-device', () => {
  it('verifies a freshly issued cookie for the same user + key', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value, 1, key)).toBe(true);
  });

  it('rejects a different user', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value, 2, key)).toBe(false);
  });

  it('rejects after the key rotates (revocation)', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    const rotated = generateDeviceTrustKey();
    expect(verifyTrustedCookieValue(value, 1, rotated)).toBe(false);
  });

  it('rejects an expired cookie', () => {
    const key = generateDeviceTrustKey();
    const now = 1_000_000_000_000;
    const value = issueTrustedCookieValue(1, key, 14, now);
    const later = now + 15 * 24 * 60 * 60 * 1000;
    expect(verifyTrustedCookieValue(value, 1, key, later)).toBe(false);
  });

  it('rejects tampered/empty/nullkey inputs safely', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value + 'x', 1, key)).toBe(false);
    expect(verifyTrustedCookieValue(undefined, 1, key)).toBe(false);
    expect(verifyTrustedCookieValue(value, 1, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/__tests__/trusted-device.test.ts`
Expected: FAIL — cannot find module `../trusted-device`.

- [ ] **Step 3: Implement `src/lib/trusted-device.ts`**

```ts
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// "Remember this device" — a per-user rotating HMAC key signs a cookie value
// carrying (userId, expiry). Rotating the key (on disable/reset/revoke)
// invalidates every trusted device for that user at once. No DB table needed.

export const TRUSTED_DEVICE_DAYS = 14;
export const TRUSTED_COOKIE = 'devdash-trust';

export function generateDeviceTrustKey(): string {
  return randomBytes(32).toString('base64url');
}

function sign(userId: number, expMs: number, key: string): string {
  return createHmac('sha256', key).update(`${userId}.${expMs}`).digest('base64url');
}

export function issueTrustedCookieValue(
  userId: number, key: string, days = TRUSTED_DEVICE_DAYS, nowMs = Date.now(),
): string {
  const expMs = nowMs + days * 24 * 60 * 60 * 1000;
  return `${userId}.${expMs}.${sign(userId, expMs, key)}`;
}

export function verifyTrustedCookieValue(
  value: string | undefined, userId: number, key: string | null, nowMs = Date.now(),
): boolean {
  if (!value || !key) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [uidStr, expStr, mac] = parts;
  if (Number(uidStr) !== userId) return false;
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const expected = sign(userId, expMs, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/__tests__/trusted-device.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trusted-device.ts src/lib/__tests__/trusted-device.test.ts
git commit -m "feat(2fa): trusted-device HMAC cookie with rotating per-user key"
```

---

## Task 5: Pending token (`src/lib/pending-token.ts`)

**Files:**
- Create: `src/lib/pending-token.ts`
- Test: `src/lib/__tests__/pending-token.test.ts`

**Interfaces:**
- Produces:
  - `type PendingPurpose = '2fa' | 'enroll'`
  - `PENDING_COOKIE = 'devdash-pending'`
  - `issuePendingToken(userId: number, machineId: number, purpose: PendingPurpose): Promise<string>`
  - `verifyPendingToken(token: string | undefined, purpose: PendingPurpose): Promise<{ userId: number; machineId: number } | null>`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/pending-token.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { issuePendingToken, verifyPendingToken } from '../pending-token';

describe('pending-token', () => {
  it('round-trips a token for the matching purpose', async () => {
    const token = await issuePendingToken(7, 3, '2fa');
    const claims = await verifyPendingToken(token, '2fa');
    expect(claims).toEqual({ userId: 7, machineId: 3 });
  });

  it('rejects a token used for the wrong purpose', async () => {
    const token = await issuePendingToken(7, 3, 'enroll');
    expect(await verifyPendingToken(token, '2fa')).toBeNull();
  });

  it('rejects garbage / undefined', async () => {
    expect(await verifyPendingToken(undefined, '2fa')).toBeNull();
    expect(await verifyPendingToken('not.a.jwt', '2fa')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/__tests__/pending-token.test.ts`
Expected: FAIL — cannot find module `../pending-token`.

- [ ] **Step 3: Implement `src/lib/pending-token.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';

// Short-lived, single-purpose token bridging the gap between password (PIN)
// verification and a full session: either the pending 2FA challenge or the
// mandatory-enrollment flow. Never grants dashboard/data access.

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'devdash-secret-key-change-in-prod');
const PENDING_TTL = '5m';

export type PendingPurpose = '2fa' | 'enroll';
export const PENDING_COOKIE = 'devdash-pending';

export async function issuePendingToken(userId: number, machineId: number, purpose: PendingPurpose): Promise<string> {
  return new SignJWT({ userId, machineId, purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(PENDING_TTL)
    .sign(SECRET);
}

export async function verifyPendingToken(
  token: string | undefined, purpose: PendingPurpose,
): Promise<{ userId: number; machineId: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== purpose) return null;
    return { userId: payload.userId as number, machineId: payload.machineId as number };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/__tests__/pending-token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pending-token.ts src/lib/__tests__/pending-token.test.ts
git commit -m "feat(2fa): short-lived purpose-scoped pending token"
```

---

## Task 6: Email templates

**Files:**
- Modify: `src/lib/email.ts` (append after line 113)

**Interfaces:**
- Consumes: existing `shell(eyebrow, body)` and `ctaButton(href, label)`.
- Produces:
  - `enrollCodeEmailHtml(name: string, code: string): string`
  - `emailChangeCodeEmailHtml(name: string, code: string): string`
  - `twoFactorEnabledEmailHtml(name: string, appUrl: string): string`
  - `twoFactorResetEmailHtml(name: string, appUrl: string): string`

- [ ] **Step 1: Append the four templates to `src/lib/email.ts`**

```ts
// 2FA enrollment code (light) — gates the QR step / verifies email ownership.
export function enrollCodeEmailHtml(name: string, code: string): string {
  return shell('2FA SETUP CODE', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${name}</strong>, enter the code below to continue setting up two-factor authentication.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:22px;">
      After this you'll scan a QR code with your authenticator app. This code expires in 15 minutes.
    </div>
    <div style="text-align:center; margin-bottom:22px;">
      <div style="display:inline-block; font-family:'Courier New',monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#111225; background:#f4f2ff; border:1px solid #e4defb; border-radius:12px; padding:16px 26px;">
        ${code}
      </div>
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not start this, ignore this email.
    </div>
  `);
}

// Email-change verification code (light) — sent to the NEW address.
export function emailChangeCodeEmailHtml(name: string, code: string): string {
  return shell('CONFIRM NEW EMAIL', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${name}</strong>, use the code below to confirm this as your new DevDash email.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:22px;">
      Enter it on the profile screen. This code expires in 15 minutes.
    </div>
    <div style="text-align:center; margin-bottom:22px;">
      <div style="display:inline-block; font-family:'Courier New',monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#111225; background:#f4f2ff; border:1px solid #e4defb; border-radius:12px; padding:16px 26px;">
        ${code}
      </div>
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not request this, ignore this email.
    </div>
  `);
}

// 2FA enabled confirmation (light).
export function twoFactorEnabledEmailHtml(name: string, appUrl: string): string {
  return shell('2FA ENABLED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${name}</strong>, two-factor authentication is now active on your DevDash account.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      You'll be asked for a code from your authenticator app when you log in on an untrusted device. Keep your backup codes somewhere safe.
    </div>
    ${ctaButton(appUrl, 'OPEN DEVDASH')}
  `);
}

// 2FA reset/disabled notice (light) — sent after an email-based reset.
export function twoFactorResetEmailHtml(name: string, appUrl: string): string {
  return shell('2FA RESET', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${name}</strong>, two-factor authentication was reset and is now disabled on your account.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      Log in with your email and 4-digit code, then set up 2FA again from your profile. If this wasn't you, reset your 4-digit code immediately.
    </div>
    ${ctaButton(appUrl, 'LOG IN TO DEVDASH')}
  `);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(2fa): enrollment, email-change, enabled, and reset email templates"
```

---

## Task 7: Auth route — login 2FA branch + `verify-2fa`

**Files:**
- Modify: `src/app/api/auth/route.ts` (imports; `login` action ~lines 25-68; add `verify-2fa`)

**Interfaces:**
- Consumes: `verifyTrustedCookieValue`, `TRUSTED_COOKIE`, `TRUSTED_DEVICE_DAYS`, `issueTrustedCookieValue` (trusted-device.ts); `issuePendingToken`, `verifyPendingToken`, `PENDING_COOKIE` (pending-token.ts); `verifyTotp` (totp.ts); `decryptSecret` (secret-crypto.ts); `consumeBackupCode`, `parseBackupCodes`, `serializeBackupCodes` (backup-codes.ts); existing `createSession`, `cookies` from `next/headers`.
- Produces: `login` returns one of `{ success, user, machines }` (trusted or non-2FA... see below), `{ pending: '2fa' }`, or `{ pending: 'enroll', firstTime: false }`. `verify-2fa` returns `{ success, user, machines }`.

- [ ] **Step 1: Add imports at the top of the file**

After the existing import block (line 8):
```ts
import { cookies } from 'next/headers';
import { verifyTotp } from '@/lib/totp';
import { decryptSecret } from '@/lib/secret-crypto';
import { consumeBackupCode, parseBackupCodes, serializeBackupCodes } from '@/lib/backup-codes';
import { issuePendingToken, verifyPendingToken, PENDING_COOKIE } from '@/lib/pending-token';
import {
  verifyTrustedCookieValue, issueTrustedCookieValue,
  TRUSTED_COOKIE, TRUSTED_DEVICE_DAYS,
} from '@/lib/trusted-device';
```

- [ ] **Step 2: Add a shared cookie-maxAge constant**

Below the existing constants (after line 17):
```ts
const TRUSTED_MAX_AGE = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;
const PENDING_MAX_AGE = 5 * 60;
```

- [ ] **Step 3: Replace the success tail of the `login` action**

The current `login` action creates a session immediately after PIN success (lines 55-67). Replace **from the `// Success —` comment (line 55) through the end of the `login` block (line 68)** with the 2FA branch. Keep everything above (lockout, PIN verify, failure counting) unchanged:
```ts
      // PIN correct. Clear failure state and lazily upgrade a legacy plaintext PIN.
      const successPatch: Record<string, unknown> = {};
      if (user.failedLoginAttempts || user.lockoutUntil) {
        successPatch.failedLoginAttempts = 0;
        successPatch.lockoutUntil = null;
      }
      if (!isHashed(user.otpCode)) successPatch.otpCode = hashSecret(otpCode);
      if (Object.keys(successPatch).length > 0) {
        await db.update(users).set(successPatch).where(eq(users.id, user.id));
      }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      if (userMachines.length === 0) return NextResponse.json({ error: 'No machines configured' }, { status: 400 });

      const cookieStore = await cookies();

      // Not enrolled yet → mandatory enrollment (no full session granted).
      if (!user.twoFactorEnabled) {
        const token = await issuePendingToken(user.id, userMachines[0].id, 'enroll');
        cookieStore.set(PENDING_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
        return NextResponse.json({ pending: 'enroll', firstTime: false });
      }

      // Enrolled + this device already trusted → straight to a full session.
      const trustCookie = cookieStore.get(TRUSTED_COOKIE)?.value;
      if (verifyTrustedCookieValue(trustCookie, user.id, user.deviceTrustKey)) {
        await createSession(user.id, userMachines[0].id, user.email, user.name);
        return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email }, machines: userMachines });
      }

      // Enrolled, untrusted device → issue the 2FA challenge.
      const pendingToken = await issuePendingToken(user.id, userMachines[0].id, '2fa');
      cookieStore.set(PENDING_COOKIE, pendingToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
      return NextResponse.json({ pending: '2fa' });
    }

    if (action === 'verify-2fa') {
      const { code, trustDevice } = body;
      if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

      const cookieStore = await cookies();
      const claims = await verifyPendingToken(cookieStore.get(PENDING_COOKIE)?.value, '2fa');
      if (!claims) return NextResponse.json({ error: 'Session expired. Log in again.' }, { status: 401 });

      const [user] = await db.select().from(users).where(eq(users.id, claims.userId));
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
        return NextResponse.json({ error: 'Session expired. Log in again.' }, { status: 401 });
      }

      const secret = decryptSecret(user.twoFactorSecretEnc);
      const clean = String(code).replace(/\s/g, '');
      let ok = !!secret && verifyTotp(clean, secret);

      // Fall back to a one-time backup code.
      if (!ok) {
        const codes = parseBackupCodes(user.twoFactorBackupCodes);
        const res = consumeBackupCode(clean, codes);
        if (res.ok) {
          ok = true;
          await db.update(users).set({ twoFactorBackupCodes: serializeBackupCodes(res.updated) }).where(eq(users.id, user.id));
        }
      }

      if (!ok) return NextResponse.json({ error: 'Invalid code' }, { status: 401 });

      cookieStore.delete(PENDING_COOKIE);
      await createSession(user.id, claims.machineId, user.email, user.name);

      if (trustDevice && user.deviceTrustKey) {
        const value = issueTrustedCookieValue(user.id, user.deviceTrustKey);
        cookieStore.set(TRUSTED_COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: TRUSTED_MAX_AGE });
      }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email }, machines: userMachines });
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Manual probe (dev server running)**

Register/keep an existing user, then:
```bash
curl -s -X POST localhost:50051/api/auth -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"<you>","otpCode":"<pin>"}'
```
Expected (existing user, not yet enrolled): `{"pending":"enroll","firstTime":false}`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/route.ts
git commit -m "feat(2fa): login 2FA branch (trusted/challenge/enroll) + verify-2fa"
```

---

## Task 8: Auth route — enrollment actions + register hand-off

**Files:**
- Modify: `src/app/api/auth/route.ts` (`register` action ~lines 70-108; add three enroll actions)

**Interfaces:**
- Consumes: `generateTotpSecret`, `buildOtpauthUri`, `verifyTotp` (totp.ts); `encryptSecret`, `decryptSecret` (secret-crypto.ts); `generateBackupCodes`, `serializeBackupCodes` (backup-codes.ts); `generateDeviceTrustKey` (trusted-device.ts); `verifyPendingToken`, `issuePendingToken`, `PENDING_COOKIE` (pending-token.ts); `getSession` (auth.ts); `verifySecret`, `hashSecret` (pin-hash.ts); `sendEmail`, `enrollCodeEmailHtml`, `twoFactorEnabledEmailHtml` (email.ts); `randomInt` (already imported); `QRCode` from `qrcode`.
- Produces:
  - Actor helper `resolveEnrollActor()` → `{ userId: number; machineId: number; viaSession: boolean } | null`
  - `enroll-request-code` → `{ success: true }`
  - `enroll-verify-email` → `{ secret: string; qr: string }` (base32 secret + PNG data-URL)
  - `enroll-activate` → `{ success: true, backupCodes: string[], user, machines }`

- [ ] **Step 1: Add imports**

Extend the top-of-file imports:
```ts
import QRCode from 'qrcode';
import { getSession } from '@/lib/auth';
import { generateTotpSecret, buildOtpauthUri } from '@/lib/totp';
import { encryptSecret } from '@/lib/secret-crypto';
import { generateBackupCodes } from '@/lib/backup-codes';
import { generateDeviceTrustKey } from '@/lib/trusted-device';
import {
  enrollCodeEmailHtml, twoFactorEnabledEmailHtml,
} from '@/lib/email';
```
(Some names — `decryptSecret`, `serializeBackupCodes`, `verifyPendingToken`, `issuePendingToken`, `PENDING_COOKIE`, `sendEmail` — are already imported from Task 7 / the original file. Merge, don't duplicate.)

- [ ] **Step 2: Add the actor helper above `export async function POST`**

```ts
// An enrollment step is authorized by EITHER a full session (profile-initiated
// enable, or forced-on-load) OR a fresh pending-enroll token (right after
// login/registration). viaSession=true means we must re-check the PIN.
async function resolveEnrollActor(): Promise<{ userId: number; machineId: number; viaSession: boolean } | null> {
  const session = await getSession();
  if (session) return { userId: session.userId, machineId: session.machineId, viaSession: true };
  const cookieStore = await cookies();
  const claims = await verifyPendingToken(cookieStore.get(PENDING_COOKIE)?.value, 'enroll');
  if (claims) return { userId: claims.userId, machineId: claims.machineId, viaSession: false };
  return null;
}
```

- [ ] **Step 3: Change the `register` tail to hand off to enrollment**

Replace the session-creation tail of `register` (the `await createSession(...)` and its `return` — original lines 106-107) with:
```ts
      const token = await issuePendingToken(user.id, machine.id, 'enroll');
      const cookieStore = await cookies();
      cookieStore.set(PENDING_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
      return NextResponse.json({
        pending: 'enroll', firstTime: true,
        user: { id: user.id, name: user.name, email: user.email },
        machines: [machine], resolvedInvites: invites.length,
      }, { status: 201 });
```

- [ ] **Step 4: Add the three enrollment actions** (inside the `POST` switch, e.g. after `verify-2fa`)

```ts
    if (action === 'enroll-request-code') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      // Session-driven (profile enable / forced-on-load) must prove the PIN.
      if (actor.viaSession) {
        const { pin } = body;
        if (!verifySecret(String(pin || ''), user.otpCode)) {
          return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
        }
      }

      const now = Date.now();
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      await db.update(users).set({
        enrollCode: hashSecret(code),
        enrollCodeExpires: new Date(now + RESET_CODE_TTL_MINUTES * 60000).toISOString(),
        enrollAttempts: 0,
      }).where(eq(users.id, user.id));
      try {
        await sendEmail({ to: user.email, subject: 'Your DevDash 2FA setup code', html: enrollCodeEmailHtml(user.name, code) });
      } catch { /* code stored regardless */ }
      return NextResponse.json({ success: true });
    }

    if (action === 'enroll-verify-email') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const { code } = body;
      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      const now = Date.now();
      const live = !!user?.enrollCode && !!user?.enrollCodeExpires && new Date(user!.enrollCodeExpires!).getTime() > now;
      if (!user || !live || !verifySecret(String(code || '').trim(), user.enrollCode)) {
        if (user && live) {
          const attempts = (user.enrollAttempts || 0) + 1;
          if (attempts >= MAX_RESET_ATTEMPTS) {
            await db.update(users).set({ enrollCode: null, enrollCodeExpires: null, enrollAttempts: 0 }).where(eq(users.id, user.id));
          } else {
            await db.update(users).set({ enrollAttempts: attempts }).where(eq(users.id, user.id));
          }
        }
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }

      // Email proven → mint the pending TOTP secret and return QR + manual key.
      const secret = generateTotpSecret();
      await db.update(users).set({
        twoFactorPendingSecretEnc: encryptSecret(secret),
        enrollCode: null, enrollCodeExpires: null, enrollAttempts: 0,
      }).where(eq(users.id, user.id));
      const uri = buildOtpauthUri(secret, user.email);
      const qr = await QRCode.toDataURL(uri);
      return NextResponse.json({ secret, qr });
    }

    if (action === 'enroll-activate') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const { code } = body;
      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      if (!user || !user.twoFactorPendingSecretEnc) {
        return NextResponse.json({ error: 'Start setup again' }, { status: 400 });
      }
      const secret = decryptSecret(user.twoFactorPendingSecretEnc);
      if (!secret || !verifyTotp(String(code || ''), secret)) {
        return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
      }

      const { plain, stored } = generateBackupCodes();
      await db.update(users).set({
        twoFactorEnabled: true,
        twoFactorSecretEnc: user.twoFactorPendingSecretEnc,
        twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: serializeBackupCodes(stored),
        deviceTrustKey: generateDeviceTrustKey(),
      }).where(eq(users.id, user.id));

      // Promote to a full session and clear the pending cookie (login/register path).
      const cookieStore = await cookies();
      cookieStore.delete(PENDING_COOKIE);
      await createSession(user.id, actor.machineId, user.email, user.name);

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({ to: user.email, subject: 'Two-factor authentication enabled', html: twoFactorEnabledEmailHtml(user.name, appUrl) });
      } catch { /* non-fatal */ }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      return NextResponse.json({ success: true, backupCodes: plain, user: { id: user.id, name: user.name, email: user.email }, machines: userMachines });
    }
```

- [ ] **Step 5: Also import `createSession` merge check + typecheck**

`createSession` is already imported at the top of the original file (line 6). Run: `npx tsc --noEmit`
Expected: exits 0 (no duplicate-import or unused-import errors — remove any leftover duplicate import lines).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/route.ts
git commit -m "feat(2fa): enrollment actions (email gate, QR, activate) + register hand-off"
```

---

## Task 9: Auth route — 2FA reset + session enrollment flag

**Files:**
- Modify: `src/app/api/auth/route.ts` (add `reset-2fa-request`/`reset-2fa-confirm`; extend `GET`)

**Interfaces:**
- Consumes: `sendEmail`, `otpResetCodeEmailHtml` (reuse for the reset code), `twoFactorResetEmailHtml`; `hashSecret`, `verifySecret`; existing reset constants.
- Produces: `reset-2fa-request` → `{ success: true }` (generic); `reset-2fa-confirm` → `{ success: true }`; `GET /api/auth` response gains `twoFactorEnabled: boolean` and `requires2faEnrollment: boolean`.

- [ ] **Step 1: Add the reset actions**

Reuse the `resetCode`/`resetCodeExpires`/`resetAttempts`/`lastResetRequestAt` columns (a user resetting 2FA is not simultaneously resetting their PIN). Add:
```ts
    if (action === 'reset-2fa-request') {
      const { email } = body;
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (user && user.twoFactorEnabled) {
        const now = Date.now();
        const last = user.lastResetRequestAt ? new Date(user.lastResetRequestAt).getTime() : 0;
        if (now - last >= RESET_COOLDOWN_MS) {
          const code = String(randomInt(0, 1000000)).padStart(6, '0');
          await db.update(users).set({
            resetCode: hashSecret(code),
            resetCodeExpires: new Date(now + RESET_CODE_TTL_MINUTES * 60000).toISOString(),
            resetAttempts: 0,
            lastResetRequestAt: new Date(now).toISOString(),
          }).where(eq(users.id, user.id));
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
            await sendEmail({ to: user.email, subject: 'Your DevDash 2FA reset code', html: otpResetCodeEmailHtml(user.name, code, appUrl) });
          } catch { /* stored regardless */ }
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'reset-2fa-confirm') {
      const { email, code } = body;
      if (!email || !code) return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      const now = Date.now();
      const live = !!user?.resetCode && !!user?.resetCodeExpires && new Date(user!.resetCodeExpires!).getTime() > now;
      if (!user || !live || !verifySecret(String(code).trim(), user.resetCode)) {
        if (user && live) {
          const attempts = (user.resetAttempts || 0) + 1;
          if (attempts >= MAX_RESET_ATTEMPTS) {
            await db.update(users).set({ resetCode: null, resetCodeExpires: null, resetAttempts: 0 }).where(eq(users.id, user.id));
          } else {
            await db.update(users).set({ resetAttempts: attempts }).where(eq(users.id, user.id));
          }
        }
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }
      // Disable 2FA, wipe secrets, rotate the trust key (kills trusted devices).
      await db.update(users).set({
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: null,
        deviceTrustKey: null,
        resetCode: null, resetCodeExpires: null, resetAttempts: 0,
      }).where(eq(users.id, user.id));
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({ to: user.email, subject: 'Two-factor authentication reset', html: twoFactorResetEmailHtml(user.name, appUrl) });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true });
    }
```
Add `twoFactorResetEmailHtml` to the `@/lib/email` import.

- [ ] **Step 2: Extend `GET` to report enrollment status**

In the `GET` handler, after fetching `userMachines`, load the user row and add the flags:
```ts
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    const twoFactorEnabled = !!user?.twoFactorEnabled;

    return NextResponse.json({
      userId: session.userId,
      machineId: session.machineId,
      email: session.email,
      name: session.name,
      machines: userMachines,
      twoFactorEnabled,
      requires2faEnrollment: !twoFactorEnabled,
    });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Manual probe**

```bash
curl -s -X POST localhost:50051/api/auth -H 'Content-Type: application/json' \
  -d '{"action":"reset-2fa-request","email":"nobody@example.com"}'
```
Expected: `{"success":true}` (generic, even for unknown email).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/route.ts
git commit -m "feat(2fa): email-based 2FA reset + enrollment flag on session"
```

---

## Task 10: Profile API route (`/api/profile`)

**Files:**
- Create: `src/app/api/profile/route.ts`

**Interfaces:**
- Consumes: `getSession`, `createSession` (auth.ts); `hashSecret`, `verifySecret` (pin-hash.ts); `verifyTotp` (totp.ts); `decryptSecret` (secret-crypto.ts); `generateBackupCodes`, `serializeBackupCodes` (backup-codes.ts); `generateDeviceTrustKey`, `TRUSTED_COOKIE` (trusted-device.ts); `sendEmail`, `emailChangeCodeEmailHtml` (email.ts); `randomInt`, `cookies`.
- Produces: `POST /api/profile` with actions `update-name`, `change-pin`, `request-email-change`, `confirm-email-change`, `disable-2fa`, `regenerate-backup-codes`, `revoke-trusted-devices`.

- [ ] **Step 1: Create the route**

`src/app/api/profile/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq, and, ne } from 'drizzle-orm';
import { getSession, createSession } from '@/lib/auth';
import { hashSecret, verifySecret } from '@/lib/pin-hash';
import { verifyTotp } from '@/lib/totp';
import { decryptSecret } from '@/lib/secret-crypto';
import { generateBackupCodes, serializeBackupCodes } from '@/lib/backup-codes';
import { generateDeviceTrustKey, TRUSTED_COOKIE } from '@/lib/trusted-device';
import { sendEmail, emailChangeCodeEmailHtml } from '@/lib/email';

const CODE_TTL_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { action } = body;
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'update-name') {
      const name = String(body.name || '').trim();
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      await db.update(users).set({ name }).where(eq(users.id, user.id));
      await createSession(user.id, session.machineId, user.email, name); // refresh session name
      return NextResponse.json({ success: true, name });
    }

    if (action === 'change-pin') {
      const { currentPin, newPin } = body;
      if (!verifySecret(String(currentPin || ''), user.otpCode)) {
        return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
      if (!/^\d{4}$/.test(String(newPin || ''))) {
        return NextResponse.json({ error: 'New PIN must be 4 digits' }, { status: 400 });
      }
      await db.update(users).set({ otpCode: hashSecret(newPin) }).where(eq(users.id, user.id));
      return NextResponse.json({ success: true });
    }

    if (action === 'request-email-change') {
      const newEmail = String(body.newEmail || '').toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
        return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
      }
      const taken = await db.select().from(users).where(and(eq(users.email, newEmail), ne(users.id, user.id)));
      if (taken.length > 0) return NextResponse.json({ error: 'That email is already in use' }, { status: 409 });

      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      await db.update(users).set({
        pendingEmail: newEmail,
        emailChangeCode: hashSecret(code),
        emailChangeExpires: new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString(),
      }).where(eq(users.id, user.id));
      try {
        await sendEmail({ to: newEmail, subject: 'Confirm your new DevDash email', html: emailChangeCodeEmailHtml(user.name, code) });
      } catch { /* stored regardless */ }
      return NextResponse.json({ success: true });
    }

    if (action === 'confirm-email-change') {
      const { code } = body;
      const now = Date.now();
      const live = !!user.pendingEmail && !!user.emailChangeCode && !!user.emailChangeExpires
        && new Date(user.emailChangeExpires).getTime() > now;
      if (!live || !verifySecret(String(code || '').trim(), user.emailChangeCode)) {
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }
      const oldEmail = user.email;
      const newEmail = user.pendingEmail!;
      await db.update(users).set({
        email: newEmail, pendingEmail: null, emailChangeCode: null, emailChangeExpires: null,
      }).where(eq(users.id, user.id));
      await createSession(user.id, session.machineId, newEmail, user.name); // session carries email
      try {
        await sendEmail({ to: oldEmail, subject: 'Your DevDash email was changed', html: emailChangeCodeEmailHtml(user.name, '— changed to ' + newEmail) });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, email: newEmail });
    }

    if (action === 'disable-2fa') {
      const { pin, totp } = body;
      if (!user.twoFactorEnabled) return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
      if (!verifySecret(String(pin || ''), user.otpCode)) {
        return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
      }
      const secret = user.twoFactorSecretEnc ? decryptSecret(user.twoFactorSecretEnc) : null;
      if (!secret || !verifyTotp(String(totp || ''), secret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 });
      }
      await db.update(users).set({
        twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: null, deviceTrustKey: null,
      }).where(eq(users.id, user.id));
      (await cookies()).delete(TRUSTED_COOKIE);
      return NextResponse.json({ success: true });
    }

    if (action === 'regenerate-backup-codes') {
      const { totp } = body;
      const secret = user.twoFactorEnabled && user.twoFactorSecretEnc ? decryptSecret(user.twoFactorSecretEnc) : null;
      if (!secret || !verifyTotp(String(totp || ''), secret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 });
      }
      const { plain, stored } = generateBackupCodes();
      await db.update(users).set({ twoFactorBackupCodes: serializeBackupCodes(stored) }).where(eq(users.id, user.id));
      return NextResponse.json({ success: true, backupCodes: plain });
    }

    if (action === 'revoke-trusted-devices') {
      await db.update(users).set({ deviceTrustKey: user.twoFactorEnabled ? generateDeviceTrustKey() : null }).where(eq(users.id, user.id));
      (await cookies()).delete(TRUSTED_COOKIE);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Manual probe (logged-in session cookie required)**

```bash
curl -s -X POST localhost:50051/api/profile -H 'Content-Type: application/json' \
  -b devdash-session=<token> -d '{"action":"update-name","name":"New Name"}'
```
Expected: `{"success":true,"name":"New Name"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat(profile): authenticated profile API (name, pin, email, 2FA mgmt)"
```

---

## Task 11: TwoFactorWizard component

**Files:**
- Create: `src/components/TwoFactorWizard.tsx`

**Interfaces:**
- Consumes: the auth-route enroll endpoints (`enroll-request-code`, `enroll-verify-email`, `enroll-activate`).
- Produces:
```ts
interface TwoFactorWizardProps {
  requirePin: boolean;          // true = session-driven (profile/forced-load); false = fresh login/register
  onComplete: () => void;       // 2FA active → parent refreshes session / closes
  onCancel?: () => void;        // omitted when enrollment is mandatory (no escape)
}
export default function TwoFactorWizard(props: TwoFactorWizardProps): JSX.Element
```

- [ ] **Step 1: Create the component**

`src/components/TwoFactorWizard.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { ShieldCheck, Loader2, AlertCircle, Copy, Check } from 'lucide-react';

interface TwoFactorWizardProps {
  requirePin: boolean;
  onComplete: () => void;
  onCancel?: () => void;
}

type Step = 'pin' | 'email' | 'qr' | 'backup';

async function post(body: unknown) {
  const r = await fetch('/api/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json() };
}

export default function TwoFactorWizard({ requirePin, onComplete, onCancel }: TwoFactorWizardProps) {
  const [step, setStep] = useState<Step>(requirePin ? 'pin' : 'email');
  const [pin, setPin] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [totp, setTotp] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step PIN + request email code (also used to (re)send the email code).
  async function requestCode() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-request-code', pin });
    setLoading(false);
    if (!ok) { setError(data.error || 'Failed'); return; }
    setStep('email');
  }

  async function verifyEmail() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-verify-email', code: emailCode });
    setLoading(false);
    if (!ok) { setError(data.error || 'Invalid code'); return; }
    setSecret(data.secret); setQr(data.qr); setStep('qr');
  }

  async function activate() {
    setLoading(true); setError('');
    const { ok, data } = await post({ action: 'enroll-activate', code: totp });
    setLoading(false);
    if (!ok) { setError(data.error || 'Invalid code'); return; }
    setBackupCodes(data.backupCodes || []); setStep('backup');
  }

  function copyCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="card-v2" style={{ padding: '24px 22px', maxWidth: 410, margin: '0 auto' }}>
      <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--accent)' }}>
        <ShieldCheck size={18} /> <span className="font-display" style={{ fontSize: 18 }}>Set up two-factor auth</span>
      </div>

      {step === 'pin' && (
        <div>
          <label className="label">Confirm your 4-digit PIN</label>
          <input className="inp" type="password" inputMode="numeric" maxLength={4}
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <button className="btn-grad w-full mt-4" disabled={loading || pin.length !== 4} onClick={requestCode}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Send email code'}
          </button>
        </div>
      )}

      {step === 'email' && (
        <div>
          <div className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
            We emailed a 6-digit code to verify your address. Enter it to continue.
          </div>
          <input className="inp" inputMode="numeric" maxLength={6} placeholder="6-digit code"
            value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ textAlign: 'center', letterSpacing: '0.3em' }} />
          <button className="btn-grad w-full mt-4" disabled={loading || emailCode.length !== 6} onClick={verifyEmail}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Verify email'}
          </button>
        </div>
      )}

      {step === 'qr' && (
        <div>
          <div className="text-[12.5px] mb-2" style={{ color: 'var(--muted)' }}>
            Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code it shows.
          </div>
          {qr && <img src={qr} alt="2FA QR code" style={{ width: 180, height: 180, margin: '10px auto', display: 'block', borderRadius: 8 }} />}
          <div className="text-center text-[11px] mb-3" style={{ color: 'var(--dim)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            Manual key: {secret}
          </div>
          <input className="inp" inputMode="numeric" maxLength={6} placeholder="6-digit app code"
            value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{ textAlign: 'center', letterSpacing: '0.3em' }} />
          <button className="btn-grad w-full mt-4" disabled={loading || totp.length !== 6} onClick={activate}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Verify & enable'}
          </button>
        </div>
      )}

      {step === 'backup' && (
        <div>
          <div className="text-[13px] mb-3" style={{ color: 'var(--live)' }}>
            2FA is on. Save these one-time backup codes — each works once if you lose your authenticator.
          </div>
          <div className="glass rounded-lg p-3 mb-3" style={{ fontFamily: 'monospace', fontSize: 14, columnCount: 2 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <button type="button" className="ftab w-full justify-center mb-3" onClick={copyCodes}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy codes</>}
          </button>
          <button className="btn-grad w-full" onClick={onComplete}>I've saved them — continue</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--offline)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {onCancel && step !== 'backup' && (
        <button type="button" onClick={onCancel} className="w-full text-center mt-3 text-[12px]"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/TwoFactorWizard.tsx
git commit -m "feat(2fa): shared enrollment wizard (PIN → email → QR → backup codes)"
```

---

## Task 12: LoginPage multi-step integration

**Files:**
- Modify: `src/components/LoginPage.tsx`

**Interfaces:**
- Consumes: `TwoFactorWizard`; auth actions `login`, `verify-2fa`, `reset-2fa-request`, `reset-2fa-confirm`.
- Produces: `LoginPage` now internally routes to a TOTP challenge screen and the enrollment wizard before calling `onSuccess()`. Its external prop (`onSuccess: () => void`) is unchanged.

- [ ] **Step 1: Add sub-view state and import the wizard**

At the top of `LoginPage.tsx`, add `import TwoFactorWizard from './TwoFactorWizard';` and introduce a view state alongside `mode`:
```tsx
// Which screen we're on within login. 'form' is the email+PIN card.
type View = 'form' | 'twofa' | 'enroll' | 'reset2fa';
const [view, setView] = useState<View>('form');
const [twofaCode, setTwofaCode] = useState('');
const [trustDevice, setTrustDevice] = useState(false);
const [reset2faStep, setReset2faStep] = useState<'request' | 'confirm'>('request');
```

- [ ] **Step 2: Branch on the login response**

Replace the success handling in `handleLogin` (currently `onSuccess()` on ok) with:
```tsx
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Login failed'); setLoading(false); return; }
      setLoading(false);
      if (data.pending === '2fa') { setView('twofa'); return; }
      if (data.pending === 'enroll') { setView('enroll'); return; }
      onSuccess();
```
Do the same in `handleRegister`: on `data.pending === 'enroll'` call `setView('enroll')` instead of `onSuccess()`.

- [ ] **Step 3: Add the TOTP challenge + verify handler**

```tsx
  async function handleVerify2fa() {
    if (twofaCode.trim().length < 6 && !twofaCode.includes('-')) { setError('Enter your 6-digit code or a backup code'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-2fa', code: twofaCode.trim(), trustDevice }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Invalid code'); setLoading(false); return; }
      onSuccess();
    } catch { setError('Connection failed'); }
    setLoading(false);
  }
```

- [ ] **Step 4: Render the sub-views**

At the top of the returned JSX (before the normal form card), short-circuit on `view`:
```tsx
  if (view === 'enroll') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <TwoFactorWizard requirePin={false} onComplete={onSuccess} />
      </div>
    );
  }
  if (view === 'twofa') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <div className="card-v2" style={{ padding: '24px 22px', width: '100%', maxWidth: 410 }}>
          <div className="font-display mb-3" style={{ fontSize: 20 }}>Enter your authenticator code</div>
          <input className="inp" inputMode="text" placeholder="6-digit code or backup code"
            value={twofaCode} onChange={(e) => setTwofaCode(e.target.value)} autoFocus
            style={{ textAlign: 'center', letterSpacing: '0.2em' }} />
          <label className="flex items-center gap-2 mt-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
            Trust this device for 14 days
          </label>
          {error && <div className="flex items-center justify-center gap-1.5 text-center mt-3 text-[12.5px]" style={{ color: 'var(--offline)' }}><AlertCircle size={14} /> {error}</div>}
          <button className="btn-grad w-full mt-4" disabled={loading} onClick={handleVerify2fa}>
            {loading ? <Loader2 size={17} className="spin" /> : 'Verify'}
          </button>
          <button type="button" onClick={() => { setView('reset2fa'); setReset2faStep('request'); setError(''); setSuccess(''); }}
            className="w-full text-center mt-3 text-[12px]" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Lost your authenticator?
          </button>
        </div>
      </div>
    );
  }
```
Add a `view === 'reset2fa'` screen with the same two-step shape as the existing PIN reset (`request` emails via `reset-2fa-request`, `confirm` via `reset-2fa-confirm`), and on success set `view='form'` + `mode='login'` with a success message telling the user to log in and re-enroll. (Mirror `handleRequestReset`/`handleConfirmReset`, swapping the action names; no `newOtpCode` field.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "feat(2fa): multi-step login (TOTP challenge, enroll hand-off, reset)"
```

---

## Task 13: Profile page + component + Header link

**Files:**
- Create: `src/app/profile/page.tsx`
- Create: `src/components/ProfilePage.tsx`
- Modify: the dashboard header (`src/components/dashboard/*` — locate the user/account menu) to add a "Profile" link to `/profile`.

**Interfaces:**
- Consumes: `/api/profile` actions; `/api/auth` GET for current name/email/2FA status; `TwoFactorWizard` (for the Enable flow).
- Produces: a `/profile` route rendering `ProfilePage`.

- [ ] **Step 1: Create the route shell**

`src/app/profile/page.tsx`:
```tsx
import ProfilePage from '@/components/ProfilePage';

export default function Page() {
  return <ProfilePage />;
}
```

- [ ] **Step 2: Create `src/components/ProfilePage.tsx`**

A client component that:
- On mount, `GET /api/auth` → fill `name`, `email`, `twoFactorEnabled`.
- **Edit profile**: name input → `update-name`.
- **Change email**: new-email input → `request-email-change` → code input → `confirm-email-change` (update shown email on success).
- **Change PIN**: current + new (4-digit) → `change-pin`.
- **2FA section**:
  - If disabled: "Enable" button → render `<TwoFactorWizard requirePin onComplete={reload} onCancel={...} />` inline.
  - If enabled: "Disable" (collect PIN + TOTP → `disable-2fa`), "Regenerate backup codes" (collect TOTP → `regenerate-backup-codes`, show the returned codes once), "Log out trusted devices" → `revoke-trusted-devices`.
- A back link to `/`.

Use the existing utility classes (`card-v2`, `inp`, `label`, `btn-grad`, `ftab`, `glass`) and the `useToast()` hook (`src/components/Toast.tsx`) for success/error feedback, matching sibling components. Each section is its own `card-v2` block with a heading.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import TwoFactorWizard from './TwoFactorWizard';
import { useToast } from './Toast';

async function post(action: string, extra: Record<string, unknown> = {}) {
  const r = await fetch('/api/profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
  });
  return { ok: r.ok, data: await r.json() };
}

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [enabling, setEnabling] = useState(false);

  async function reload() {
    const r = await fetch('/api/auth');
    if (r.ok) {
      const d = await r.json();
      setName(d.name); setEmail(d.email); setTwoFactorEnabled(!!d.twoFactorEnabled);
    }
    setLoaded(true); setEnabling(false);
  }
  useEffect(() => { reload(); }, []);

  if (!loaded) return <div className="min-h-[100dvh] grid place-items-center"><Loader2 className="spin" /></div>;

  return (
    <div className="max-w-[560px] mx-auto px-4 py-8">
      <button onClick={() => router.push('/')} className="ftab mb-5"><ArrowLeft size={15} /> Back</button>
      <h1 className="font-display grad-text mb-6" style={{ fontSize: 30 }}>Profile</h1>

      {/* --- name, email, PIN, and 2FA sections here (see step notes) --- */}
      {enabling
        ? <TwoFactorWizard requirePin onComplete={() => { toast.success('2FA enabled'); reload(); }} onCancel={() => setEnabling(false)} />
        : /* 2FA status card with Enable/Disable/Regenerate/Revoke controls */ null}
    </div>
  );
}
```
Implement each section fully (name/email/PIN forms and the enabled-state 2FA controls) following the inline-form pattern already used in `SettingsPanel.tsx`/`MachineManagement.tsx`. Each mutating call uses `post(...)` and surfaces `data.error` via `toast.error` on failure, `toast.success` on success.

- [ ] **Step 3: Add a Profile link in the dashboard header**

Locate the account/user control in the header (grep for the logout button — `action: 'logout'` — in `src/components/dashboard/`). Add a link/button that does `router.push('/profile')` (or `<Link href="/profile">`), styled like the neighboring controls.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/app/profile/page.tsx src/components/ProfilePage.tsx src/components/dashboard
git commit -m "feat(profile): profile page with account settings + 2FA management"
```

---

## Task 14: Mandatory-enrollment gate in the app shell

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/auth` (`requires2faEnrollment`); `TwoFactorWizard`.
- Produces: an authenticated user with `requires2faEnrollment === true` sees a blocking wizard instead of the dashboard.

- [ ] **Step 1: Capture the enrollment flag when loading the session**

In `page.tsx`, wherever the session is fetched (`GET /api/auth`), store `requires2faEnrollment` in state (e.g. `const [needsEnroll, setNeedsEnroll] = useState(false)` set from the response).

- [ ] **Step 2: Gate the dashboard render**

After the auth/loading gate but before rendering the dashboard, add:
```tsx
  if (session && needsEnroll) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10">
        <TwoFactorWizard requirePin onComplete={() => { setNeedsEnroll(false); /* re-fetch session */ }} />
      </div>
    );
  }
```
No `onCancel` is passed — enrollment is mandatory, so there is no escape to the dashboard. Import `TwoFactorWizard` at the top.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(2fa): block dashboard until mandatory 2FA enrollment completes"
```

---

## Task 15: Full verification + manual test checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: all totp / backup-codes / trusted-device / pending-token tests pass.

- [ ] **Step 2: Full typecheck + production build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 3: Security self-review (read-through)**

Confirm each holds in the code:
- Pending tokens carry `purpose` and are rejected by dashboard/data routes (they only ever grant a full session via `verify-2fa`/`enroll-activate`).
- `verify-2fa`, `disable-2fa`, `reset-2fa-confirm`, and `revoke-trusted-devices` all clear or rotate `deviceTrustKey`/trusted cookie where required.
- Every email-code flow returns a generic success and enforces TTL + attempt limits.
- TOTP secrets are only ever stored via `encryptSecret`; backup codes only via `hashSecret`.
- Disable-2FA requires **both** PIN and a live TOTP.

- [ ] **Step 4: Manual test checklist (hand to the user)**

Provide the checklist below; wait for the user to run it (per project UI-verification preference).

**Manual test checklist**

1. **Existing user forced enrollment** — log in with an existing account: after email+PIN you land on the wizard (PIN step skipped — it was just entered), receive an email code, verify it, scan the QR, enter the app code, see backup codes, then reach the dashboard.
2. **New registration** — register: immediately enters the wizard (no PIN step), completes enrollment, reaches the dashboard.
3. **2FA login (untrusted)** — log out, log in again: after email+PIN you're prompted for the authenticator code; entering it logs you in.
4. **Trust device** — repeat login with "Trust this device for 14 days" checked; the next login skips the TOTP prompt on that browser.
5. **Backup code** — at the TOTP prompt, enter one backup code instead: it logs you in and that code no longer works a second time.
6. **Lost authenticator** — at the TOTP prompt use "Lost your authenticator?", complete the email reset; 2FA is disabled and the next login pushes you back into mandatory enrollment.
7. **Profile: change name / PIN** — update name (persists); change PIN with the correct current PIN (new PIN works next login; wrong current PIN is rejected).
8. **Profile: change email** — request change to a new address, enter the code sent to the *new* address, confirm; the old address gets a notice; you can log in with the new email.
9. **Profile: disable 2FA** — requires both current PIN and a live authenticator code; after disabling, the next login routes to mandatory enrollment again.
10. **Regenerate backup codes / revoke trusted devices** — regenerating invalidates the old set; revoking makes a previously-trusted browser prompt for TOTP again.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A && git commit -m "test(2fa): verification pass — unit suite, build, security review"
```

---

## Self-Review Notes (author)

- **Spec coverage:** profile page (Task 13), change PIN/email/name (Tasks 10, 13), default/mandatory enrollment (Tasks 8, 9, 14), trust-device 14d (Tasks 4, 7, 12), existing-user enable-from-profile (Tasks 10-reuse, 13), QR + app-code verify (Tasks 8, 11), email-OTP gate both paths (Task 8, `enroll-request-code`/`enroll-verify-email`), email-based 2FA reset (Task 9, 12), backup codes (Tasks 3, 8, 10, 11), PIN re-entry when session-driven (Task 8 `viaSession`), disable requires PIN+TOTP (Task 10). All spec sections map to a task.
- **Naming consistency:** enroll endpoints (`enroll-request-code`/`enroll-verify-email`/`enroll-activate`), cookies (`devdash-pending`/`devdash-trust`), and helper signatures are used identically across Tasks 7-14.
- **Known follow-up (not blocking):** Task 13's Header-link location and the full body of `ProfilePage` sections follow existing sibling patterns rather than being pinned to exact line numbers, because the dashboard header file wasn't line-mapped during planning — the implementer greps for the logout control first.
