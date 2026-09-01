#!/usr/bin/env node
// One-time data migration: hash any plaintext user PINs (otp_code) at rest.
// Format matches src/lib/pin-hash.ts: `s1$<saltB64url>$<hashB64url>`.
// Idempotent — skips rows already hashed.
//
// ⚠️ ORDERING: only run this AFTER the app code that can verify hashed PINs
// (verifySecret) is deployed. Running it while old plaintext-comparing code is
// live would lock out every user until deploy.
import { config } from 'dotenv';
config({ quiet: true });
import postgres from 'postgres';
import { scryptSync, randomBytes } from 'crypto';

const PREFIX = 's1';
const KEYLEN = 32;
function hashSecret(secret) {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN);
  return `${PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const rows = await sql`SELECT id, otp_code FROM users`;
let migrated = 0, skipped = 0;
for (const r of rows) {
  if (!r.otp_code || r.otp_code.startsWith(PREFIX + '$')) { skipped++; continue; }
  // Guard on the exact plaintext we read so a concurrent confirm-reset that set
  // a genuinely new PIN between the SELECT and here is never clobbered.
  const res = await sql`UPDATE users SET otp_code = ${hashSecret(r.otp_code)} WHERE id = ${r.id} AND otp_code = ${r.otp_code}`;
  if (res.count > 0) migrated++; else skipped++;
}
console.log(`done: hashed ${migrated} PIN(s), skipped ${skipped} (already hashed / empty)`);
await sql.end();
