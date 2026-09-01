// Idempotent: safe to run on every deploy. Adds native-push columns to the
// existing web-push table so FCM/APNs tokens live next to VAPID endpoints.
import postgres from 'postgres';
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web'`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS device_token TEXT DEFAULT ''`;
  console.log('push_subscriptions platform columns ready');
} catch (err) {
  console.error('apply-push-platform failed:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
