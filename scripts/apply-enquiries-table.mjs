// Idempotent: safe to run on every deploy. Creates the table behind the public
// contact and enterprise enquiry forms.
//
// The index is on created_at because the only read pattern is "show me the
// newest enquiries"; there is no lookup by id from anywhere.
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'contact',
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      message TEXT NOT NULL,
      machines TEXT DEFAULT '',
      team_size TEXT DEFAULT '',
      hosting TEXT DEFAULT '',
      security_review BOOLEAN DEFAULT FALSE,
      source_page TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      notified_at TEXT,
      created_at TEXT DEFAULT now()
    )`;
  await sql`
    CREATE INDEX IF NOT EXISTS enquiries_created_at_idx
    ON enquiries (created_at DESC)`;
  console.log('enquiries ready');
} catch (err) {
  console.error('apply-enquiries-table failed:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
