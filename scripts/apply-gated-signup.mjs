// Idempotent: safe to run on every deploy. Adds gated signup — the global
// registration policy row, single-use signup invites, the early-access request
// queue, and the users.is_admin flag those three are gated on.
//
// The admin backfill only fires when NO user is already an admin, so re-running
// this after ownership has been moved does not hand it back to user 1.
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`;

  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      signup_enabled BOOLEAN DEFAULT FALSE,
      trial_enabled BOOLEAN DEFAULT FALSE,
      closed_signup_note TEXT DEFAULT '',
      updated_at TEXT DEFAULT now(),
      updated_by INTEGER
    )
  `;
  // Guard the singleton at the database level. Without this, a bug that inserts
  // a second row makes "the settings" ambiguous and the app silently reads
  // whichever one comes back first.
  await sql`ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_singleton`;
  await sql`ALTER TABLE app_settings ADD CONSTRAINT app_settings_singleton CHECK (id = 1)`;

  await sql`
    CREATE TABLE IF NOT EXISTS signup_invites (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      invited_by INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT DEFAULT '',
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by_user_id INTEGER,
      revoked_at TEXT,
      created_at TEXT DEFAULT now()
    )
  `;
  // Redemption looks the invite up by hash and nothing else, so this index is
  // on the read path of every gated signup. Unique because two rows sharing a
  // hash would make "which invite did they use" unanswerable.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS signup_invites_token_hash_idx ON signup_invites (token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS signup_invites_email_idx ON signup_invites (lower(email))`;

  await sql`
    CREATE TABLE IF NOT EXISTS access_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT DEFAULT '',
      role TEXT DEFAULT '',
      machine_count TEXT DEFAULT '',
      use_case TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      invite_id INTEGER,
      source_page TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS access_requests_status_idx ON access_requests (status, created_at DESC)`;
  // One open request per address. Without this, a refresh-happy visitor fills
  // the queue with duplicates of themselves and the admin reviews the same
  // person five times. Partial, so a declined request can be re-submitted later.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS access_requests_pending_email_idx
      ON access_requests (lower(email)) WHERE status = 'pending'
  `;

  // Seed the singleton. Closed by default: an instance that is reachable before
  // its owner has finished setting it up must not accept strangers.
  await sql`
    INSERT INTO app_settings (id, signup_enabled, trial_enabled)
    VALUES (1, FALSE, FALSE)
    ON CONFLICT (id) DO NOTHING
  `;

  // Backfill the administrator, but only if there is not one already.
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM users WHERE is_admin = TRUE`;
  if (count === 0) {
    const changed = await sql`
      UPDATE users SET is_admin = TRUE
      WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
      RETURNING id, email
    `;
    if (changed.length) console.log(`  granted admin to user ${changed[0].id} (${changed[0].email})`);
    else console.log('  no users yet — the first account to register becomes admin');
  } else {
    console.log(`  ${count} admin(s) already set, leaving them alone`);
  }

  console.log('✓ gated signup: app_settings, signup_invites, access_requests, users.is_admin');
} finally {
  await sql.end();
}
