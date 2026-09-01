#!/usr/bin/env node
// Applies the Phase 2 cowork columns to terminal_sessions. Additive and
// idempotent (IF NOT EXISTS) — safe on the shared local/prod database.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS tmux_name text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS term_program text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS origin text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS last_active_at text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS cols integer`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS rows integer`,
];

for (const s of stmts) {
  await sql.unsafe(s);
  console.log('applied:', s);
}
await sql.end();
console.log('done');
