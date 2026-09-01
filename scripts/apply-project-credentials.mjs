#!/usr/bin/env node
// Additive, idempotent table for the project credentials vault.
// Safe on the shared local/prod DB (IF NOT EXISTS). Never drizzle-kit push.
import { config } from 'dotenv';
config();
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const sql = postgres(url);

const stmts = [
  `CREATE TABLE IF NOT EXISTS project_credentials (
     id serial PRIMARY KEY,
     project_id integer NOT NULL,
     environment text DEFAULT 'local',
     kind text DEFAULT 'login',
     label text DEFAULT '',
     backend_url text DEFAULT '',
     username text DEFAULT '',
     secret_enc text DEFAULT '',
     sort_order integer DEFAULT 0,
     created_at text DEFAULT now()::text,
     updated_at text DEFAULT now()::text
   )`,
];
for (const s of stmts) { await sql.unsafe(s); console.log('applied:', s.split('\n')[0]); }
await sql.end();
console.log('done');
