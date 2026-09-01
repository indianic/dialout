// Idempotent: safe to run on every deploy. Creates the web-push subscription
// table and the unique index that makes re-subscribing the same device an
// update rather than a duplicate row.
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      created_at TEXT DEFAULT now()
    )`;
  // One row per device. Without this, every page load that re-subscribes
  // would add a row and the user would get N copies of every notification.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
    ON push_subscriptions (endpoint)`;
  console.log('push_subscriptions ready');
} catch (err) {
  console.error('apply-push-subscriptions failed:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
