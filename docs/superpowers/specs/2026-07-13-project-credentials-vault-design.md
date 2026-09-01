# Project Credentials Vault (Encrypted) — Design

**Date:** 2026-07-13
**Status:** Draft for review
**Sibling spec:** `2026-07-13-project-process-control-design.md` (independent sub-feature)

## Goal

Give each project a structured **access/credentials** section — a backend URL plus a list of credential entries (type, identifier, password) for local and live environments — replacing the free-text credentials currently jammed into `notes`. Passwords are **encrypted at rest** and revealed/copied on demand. Every field has a **copy button**.

## Scope & non-goals

- **In scope:** a `projectCredentials` table; reversible AES-256-GCM encryption of the password/secret; CRUD API; a reveal endpoint that returns the decrypted secret to authorized users; a credentials editor in the project add/edit flow with per-field copy buttons and a masked/reveal password field; local vs live environment tagging.
- **Out of scope:** password rotation/history; TOTP/2FA secrets or generators; browser autofill/injection into the target site; audit logging of reveals (noted as a possible follow-up); sharing secrets outside DevDash.

## Key security decisions

- **Reversible encryption, not hashing.** A copy button requires the plaintext back, so passwords are encrypted (AES-256-GCM) and decryptable server-side — never hashed.
- **Key lives on the server** in a dedicated env var `CREDENTIALS_KEY` (32 bytes). This protects against a **stolen database dump**, not full server compromise. Documented plainly in `.env.example`.
- **Who can reveal:** the project **owner and any user the project is shared with** (per product decision). Non-participants get nothing.
- Secrets are **never** returned by list endpoints, never placed in URLs/query strings, and never logged. Reveal is an explicit authenticated `POST`.
- Usernames, emails, labels, and backend URLs are stored **plaintext** (they are identifiers, not secrets) so they can be listed and searched; only the password/secret column is encrypted.

## Data model

New table `projectCredentials` (`src/lib/schema.ts`):

```ts
export const projectCredentials = pgTable('project_credentials', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  environment: text('environment').default('local'), // 'local' | 'live'
  kind: text('kind').default('login'),               // 'login' | 'email' | 'api' | 'db' | 'other'
  label: text('label').default(''),                  // e.g. "Admin panel"
  backendUrl: text('backend_url').default(''),        // login / backend URL this cred is for
  username: text('username').default(''),             // username / email / identifier (plaintext)
  secretEnc: text('secret_enc').default(''),          // AES-256-GCM ciphertext (see crypto)
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});
```

`ProjectCredential` type added to `src/types/index.ts`. The list/GET shape **omits `secretEnc`** and instead returns `hasSecret: boolean`.

## Crypto

New `src/lib/crypto.ts`:

- `encryptSecret(plain: string): string` — AES-256-GCM with a random 12-byte IV; returns `base64(iv):base64(authTag):base64(ciphertext)`.
- `decryptSecret(enc: string): string` — inverse; throws on tamper (auth tag mismatch) or malformed input.
- Key: `Buffer` derived from `process.env.CREDENTIALS_KEY` (base64, must decode to 32 bytes). If unset/invalid, credential **writes and reveals fail** with a clear error (feature effectively disabled); reads of non-secret fields still work.
- Empty plaintext encrypts to `''` (no secret stored).
- `.env.example` documents generating a key: `openssl rand -base64 32`.

## Authorization helper

A shared check `canAccessProjectCredentials(session, projectId): Promise<boolean>` — true if the requester owns the project (its `machineId` belongs to the session user) **or** the project is shared with the requester (`projectShares`). Reused by every credentials endpoint. (Follows the existing share-auth pattern used by comments/shared views.)

## Web API

New route `src/app/api/projects/[id]/credentials/route.ts`:
- `GET` — list credentials for the project (authorized users only), **without** `secretEnc`; each row includes `hasSecret`.
- `POST` — create; body `{ environment, kind, label, backendUrl, username, secret }`; encrypts `secret` → `secretEnc`.
- `PUT` — update by `{ credentialId, ...fields }`; if `secret` is present, re-encrypt; if omitted, leave the stored secret untouched.
- `DELETE` — remove by `{ credentialId }`.

New route `src/app/api/projects/[id]/credentials/[credId]/reveal/route.ts`:
- `POST` — authorize, load the credential (scoped to the project), `decryptSecret`, return `{ secret }`. This is the copy button's data source. No secret in the URL or logs.

All endpoints 401 if unauthenticated, 403 if `canAccessProjectCredentials` is false, 404 if the credential/project doesn't match.

## Frontend

**Credentials editor** — a section in the project **edit** flow (the add/edit modal or the detail page). Because credentials are a child collection managed by their own API (like `projectCommands`), the editor calls the credentials endpoints directly rather than bundling into the project `PUT`.

- For an **existing** project: the section lists credential rows and supports add/edit/delete inline.
- For a **brand-new, unsaved** project: the section shows "Save the project first to add credentials" (the project needs an `id`). (Simplest correct UX; avoids a temp-id dance.)

**Each credential row** shows: environment badge (Local/Live), kind, label, backend URL, username, and a masked password. Controls:
- **Copy** buttons on backend URL, username, and password. The password copy calls the reveal endpoint, writes the plaintext to the clipboard, and toasts "Copied" — the value is not shown.
- An **eye toggle** to reveal the password inline (also via the reveal endpoint), masked again on blur/close.
- Edit and delete.
- An **Add credential** button with a small form (environment, kind, label, backend URL, username, password).

**New component `DrawerCredentials.tsx`** (or a section within the existing edit surface), plus a lightweight `CopyButton` helper.

## Error handling

- `CREDENTIALS_KEY` missing/invalid on a write or reveal → 500 with a clear message; the UI toasts "Encryption key not configured on the server."
- Reveal on a tampered/garbled `secretEnc` → 500; toast "Couldn't decrypt this secret."
- Clipboard write failure (permissions) → toast "Copy failed — reveal and copy manually."
- Unauthorized access → 403; the UI never shows the section for projects the user can't access.

## Testing

- `src/lib/crypto.ts`: round-trip encrypt→decrypt equals input; tampered ciphertext throws; wrong-length key rejected. (If the web app gains a test runner; otherwise verify via a one-off `tsx` script and delete it.)
- `npx tsc --noEmit` + `npm run build`.
- Manual: add local + live credentials; list never leaks the secret (check the network response); reveal + copy work; a shared user can reveal; a non-participant gets 403; deleting a credential removes it.

## Files touched

- `src/lib/schema.ts` (+`projectCredentials`), `src/types/index.ts` (+`ProjectCredential`)
- `src/lib/crypto.ts` (new), `.env.example` (+`CREDENTIALS_KEY`)
- `src/app/api/projects/[id]/credentials/route.ts` (new)
- `src/app/api/projects/[id]/credentials/[credId]/reveal/route.ts` (new)
- an auth helper (in `src/lib/auth.ts` or a new `src/lib/project-access.ts`)
- `src/components/DrawerCredentials.tsx` (new) + `CopyButton` helper, wired into the project edit/detail surface
