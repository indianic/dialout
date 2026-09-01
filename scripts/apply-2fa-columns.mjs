#!/usr/bin/env node
// Additive, idempotent columns + unique email index for the 2FA + profile feature.
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push in prod.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_enc text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_pending_secret_enc text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS device_trust_key text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS enroll_code text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS enroll_code_expires text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS enroll_attempts integer DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_code text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_change_expires text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_reset_code text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_reset_code_expires text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_reset_attempts integer DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_last_reset_request_at text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_attempts integer DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_lockout_until text`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }

// Unique email index (case-insensitive). Wrapped so a pre-existing duplicate
// doesn't abort the column migration — operator must dedupe then re-run.
try {
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email))`);
  console.log('applied: users_email_lower_unique');
} catch (e) {
  console.error('WARNING: could not create unique email index (likely duplicate emails). Resolve duplicates and re-run:', e.message);
}

await sql.end();
console.log('done');
