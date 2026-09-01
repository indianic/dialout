#!/usr/bin/env node
// Additive, idempotent columns for secure password reset + login rate-limiting.
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts integer DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_request_at text`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }
await sql.end();
console.log('done');
