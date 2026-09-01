# 2FA (TOTP) + Profile Page — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan

## Goal

Add authenticator-app two-factor authentication (TOTP) to DevDash, plus a
self-service profile page. 2FA becomes mandatory for all users. Recovery is via
emailed reset codes and one-time backup codes. Users can mark a device as trusted
to skip the TOTP prompt for a configurable window (default 14 days).

## Terminology

The existing field `users.otpCode` is **not** an emailed one-time code — it is a
**static 4-digit PIN** the user chooses at registration and enters (with their
email) on every login. Throughout this doc:

- **PIN / passcode** = the existing 4-digit `otpCode`.
- **2FA / TOTP** = the new second factor: an authenticator app (Google
  Authenticator, Authy, 1Password) enrolled via QR code, producing a rotating
  6-digit code (RFC 6238).

Login today is `email + PIN`. After this change it becomes
`email + PIN → TOTP (unless the device is trusted)`.

## Decisions (locked)

- **Passcode meaning:** existing 4-digit PIN; 2FA is TOTP on top of it.
- **"Setting up from admin":** means the app's own **profile page** — self-service.
  There is no separate admin role or admin-managed setup.
- **Email OTP gate before QR:** required in **both** enrollment paths (new-user
  mandatory setup and existing-user enable-from-profile). Doubles as email
  ownership verification (registration currently does no email verification).
- **Mandatory scope:** **Everyone, eventually.** New registrations must complete
  2FA before using the app. Existing users are **forced** into a blocking
  enrollment wizard on their next authenticated load until 2FA is enabled.
- **Recovery:** emailed reset code **and** one-time backup codes.
- **Trusted device window:** **configurable** constant, default **14 days**.

## Approach & libraries

- **TOTP:** `otplib` (pure JS, RFC 6238). **QR:** `qrcode` (renders a data-URL
  locally — no external requests, consistent with the app's CSP posture). Both
  are dependency-light with no native builds.
- **Secrets at rest:** the TOTP secret is encrypted with the existing
  `src/lib/secret-crypto.ts` (AES-256-GCM), same as project credentials. Backup
  codes are **hashed** with `src/lib/pin-hash.ts` `hashSecret()` (same primitive
  as the PIN).
- **Trusted device ("remember N days"):** a signed cookie HMAC'd with a per-user
  `deviceTrustKey` stored on the user row. Rotating the key instantly invalidates
  **every** trusted device for that user — exactly what a 2FA reset/disable needs.
  No new table; still supports multiple devices. (Alternative — a `trustedDevices`
  table for per-device revocation — deferred as YAGNI.)

## Data model — additions to `users`

Inline fields, matching the existing schema style:

| Field | Type | Purpose |
|-------|------|---------|
| `twoFactorEnabled` | boolean, default false | Is 2FA active for this user |
| `twoFactorSecretEnc` | text, nullable | Active encrypted TOTP secret (AES-256-GCM) |
| `twoFactorPendingSecretEnc` | text, nullable | Secret held during enrollment; promoted to active only after one valid code is proven, so re-enrolling never clobbers a working secret |
| `twoFactorBackupCodes` | text, nullable | JSON array of `{ hash, usedAt }` |
| `deviceTrustKey` | text, nullable | Per-user HMAC key for trusted-device cookies; rotates to revoke all trusted devices |
| `enrollCode` | text, nullable | Hashed emailed OTP that gates the QR step |
| `enrollCodeExpires` | text, nullable | Expiry for `enrollCode` |
| `enrollAttempts` | integer, default 0 | Attempt counter for `enrollCode` |
| `pendingEmail` | text, nullable | New email awaiting verification during change-email |
| `emailChangeCode` | text, nullable | Hashed OTP sent to the new email |
| `emailChangeExpires` | text, nullable | Expiry for `emailChangeCode` |

Migration applied via `npm run db:push` (project convention).

## Login flow

1. `email + PIN` verified exactly as today (hashed compare, brute-force lockout).
2. **Branch:**
   - **2FA enabled + device trusted** (valid trusted cookie for this user, HMAC
     verifies against `deviceTrustKey`, not expired) → create full session, done.
   - **2FA enabled + not trusted** → issue a short-lived (5-min) **`pending-2fa`
     token** (jose JWT in a cookie); **no real session yet**. Front-end shows the
     TOTP prompt. User enters a 6-digit TOTP **or** a backup code, plus an optional
     **"Trust this device"** checkbox. On success → full session (+ set trusted
     cookie if checked).
   - **2FA NOT enabled** (existing user) → issue a **`pending-enroll` token** →
     front-end shows the **mandatory enrollment wizard** (blocking).
3. Under the TOTP prompt: **"Lost your authenticator?"** → `reset-2fa-request`
   emails a code → `reset-2fa-confirm` verifies it, **disables 2FA and rotates
   `deviceTrustKey`**, so the user can sign in with email+PIN and then re-enroll.

Pending tokens are single-purpose (a `purpose` claim: `2fa` or `enroll`),
short-lived, and are rejected by all dashboard/data APIs.

## Enrollment wizard (shared component)

Used for both new-user-mandatory setup and profile-initiated enable.

1. **Confirm identity** — enter current PIN. *Skipped immediately after
   registration* (the PIN was just set in the same flow).
2. **Email OTP** — `request-enroll-code` emails a code; entering it verifies email
   ownership. (Both paths.)
3. **Scan QR** — generate a TOTP secret, store it in `twoFactorPendingSecretEnc`,
   render the QR (`otpauth://` URI) + manual entry key.
4. **Verify & finish** — `confirm-enroll` checks a TOTP code against the pending
   secret. On success: promote pending → `twoFactorSecretEnc`, set
   `twoFactorEnabled = true`, generate `deviceTrustKey`, generate and **show 8
   one-time backup codes once** (copy/download). Send "2FA enabled" email.

## Mandatory enforcement (existing users)

- `GET /api/auth` returns `requires2faEnrollment: true` when an authenticated user
  has `twoFactorEnabled = false`.
- The app shell renders the blocking enrollment wizard over the dashboard until
  2FA is enabled. Because the user already has a valid session, the wizard still
  starts at **Confirm identity (PIN)** to prove presence before enrollment.
- New registrations transition straight into the wizard after account creation
  (Confirm-identity step skipped).

## Profile page (new — `/profile`)

Authenticated page with these sections:

- **Edit profile** — change display name.
- **Change email** — enter new email → `request-email-change` sends a code to the
  **new** address → `confirm-email-change` verifies → email updated; the **old**
  address is notified of the change.
- **Change PIN** — enter **current** PIN → new 4-digit PIN → confirm.
- **2FA** — shows status. **Enable** runs the wizard. **Disable** requires **both**
  the current PIN **and** a live TOTP code (so a walk-up attacker holding only the
  PIN cannot strip 2FA); disabling rotates `deviceTrustKey`. **Regenerate backup
  codes** (requires a live TOTP code; shows new set once, invalidates the old).
  **Log out trusted devices** rotates `deviceTrustKey`.

## API surface

### `/api/auth` (unauthenticated or pending-token)
- `login` — gains the 2FA branch described above.
- `verify-2fa` — accepts `pending-2fa` token + TOTP/backup code (+ trust flag) → session.
- `request-enroll-code` — emails the enrollment OTP (PIN/pending-enroll gated).
- `confirm-enroll` — verifies TOTP against pending secret, activates 2FA, returns backup codes.
- `reset-2fa-request` / `reset-2fa-confirm` — lost-authenticator email reset (disables 2FA, rotates key).

### `/api/profile` (authenticated full session)
- `update-name`
- `request-email-change` / `confirm-email-change`
- `change-pin`
- `enable-2fa` (wizard steps, reusing the enroll actions server-side)
- `disable-2fa`
- `regenerate-backup-codes`
- `revoke-trusted-devices`

### `src/lib/email.ts` — new templates
- Enrollment OTP code
- Email-change OTP code (to new address)
- "2FA enabled" confirmation
- "2FA reset / disabled" notice

## Security notes

- Pending tokens carry a `purpose` claim and a short TTL; dashboard/data APIs
  reject them.
- All new email-code flows reuse the existing anti-enumeration (generic success),
  per-account cooldown, TTL, and attempt-limit patterns from the reset flow.
- Both `reset-2fa` and `disable-2fa` rotate `deviceTrustKey`.
- TOTP verification allows a ±1 step (±30s) window for clock drift.
- Backup codes are single-use; each use marks `usedAt` and is rejected thereafter.
- Trusted-device cookies are HttpOnly, Secure, SameSite=Lax, HMAC-signed with the
  per-user `deviceTrustKey`, and carry an absolute expiry.

## Constants

- `TRUSTED_DEVICE_DAYS = 14` (configurable in one place)
- `PENDING_TOKEN_TTL = 5 min`
- `ENROLL_CODE_TTL = 15 min`, reuses reset attempt/cooldown limits
- `BACKUP_CODE_COUNT = 8`
- `TOTP_WINDOW = 1`

## Out of scope (YAGNI)

- Separate admin role / admin-managed 2FA.
- Per-device trusted-device management table (single rotating key is enough now).
- SMS/WebAuthn/passkeys.
