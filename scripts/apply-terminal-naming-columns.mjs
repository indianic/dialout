#!/usr/bin/env node
// Additive, idempotent columns for terminal naming + preview.
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS folder text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS folder_path text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS created_local text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS git_branch text`,
  `ALTER TABLE terminal_sessions ADD COLUMN IF NOT EXISTS last_lines text`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS terminal_name_template text`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS terminal_preview_lines integer DEFAULT 3`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s); }
await sql.end();
console.log('done');
