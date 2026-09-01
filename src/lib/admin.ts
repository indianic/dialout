import { db } from './db';
import { users } from './schema';
import { eq } from 'drizzle-orm';

/**
 * Instance administrators.
 *
 * Self-hosting means there is nobody above the first account, so admin is a
 * column on `users` rather than a separate roles table — one flag is the whole
 * model, and a roles table for a single boolean is furniture nobody asked for.
 *
 * `ADMIN_EMAILS` is the recovery path, not the normal one. It exists because
 * the alternative to "the flag is on the wrong row and only an admin can fix
 * it" is a psql session, and an operator locked out of their own instance
 * should not need one.
 */
function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(userId: number): Promise<boolean> {
  const rows = await db
    .select({ isAdmin: users.isAdmin, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (rows.length === 0) return false;
  if (rows[0].isAdmin) return true;
  return envAdminEmails().includes(rows[0].email.toLowerCase());
}

/**
 * True while the instance has no accounts at all.
 *
 * The first person to register on an empty instance is its operator by
 * definition — they are the one who set up the database and the environment —
 * so `register` grants them admin. Every later signup gets nothing, which is
 * why this asks "are there zero users" rather than "are there zero admins":
 * an instance whose admin flag was cleared by hand must not silently hand
 * ownership to the next stranger who signs up.
 */
export async function isFirstEverUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length === 0;
}
