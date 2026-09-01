#!/usr/bin/env node
// Additive, idempotent column: server-side "last seen" report time for live
// terminal sessions. Safe on the shared local/prod DB (IF NOT EXISTS).
// Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS last_seen_at text`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }
await sql.end();
console.log('done');
