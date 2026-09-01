#!/usr/bin/env node
// Additive, idempotent columns for project process control (start/stop/restart).
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_command text DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS stop_command text DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS restart_command text DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS run_in_background boolean DEFAULT true`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }
await sql.end();
console.log('done');
