import { db } from './db';
import { appSettings } from './schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Instance-wide registration policy. One row, id 1, guarded by a CHECK
 * constraint so "the settings" can never be ambiguous.
 *
 * Deliberately not in `user_settings`: those are per-user preferences, and
 * "may strangers register" is instance policy, not a preference. A per-user
 * copy would also mean the answer depends on who is asking, which is exactly
 * wrong for a flag the *signed-out* signup page has to read.
 */
export interface AppSettings {
  signupEnabled: boolean;
  trialEnabled: boolean;
  closedSignupNote: string;
}

/** Closed on both counts. A fresh instance that is reachable before its owner
 *  has finished setting it up must not accept strangers, and must not advertise
 *  a request queue nobody is watching. */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  signupEnabled: false,
  trialEnabled: false,
  closedSignupNote: '',
};

/**
 * Read the policy, seeding the row if it is missing.
 *
 * Seeding here rather than at boot means a fresh database needs no bootstrap
 * step and no ordering between "app starts" and "migration ran". The insert is
 * ON CONFLICT DO NOTHING, so two requests racing on an empty table both end up
 * reading the same row rather than one of them failing.
 *
 * Never throws. A settings read sits on the signup and marketing paths, and a
 * database hiccup there should degrade to "closed" — the safe direction — not
 * to a 500 on the front page.
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    if (rows.length === 0) {
      await db
        .insert(appSettings)
        .values({ id: 1, ...DEFAULT_APP_SETTINGS })
        .onConflictDoNothing();
      return { ...DEFAULT_APP_SETTINGS };
    }
    const row = rows[0];
    return {
      signupEnabled: row.signupEnabled ?? false,
      trialEnabled: row.trialEnabled ?? false,
      closedSignupNote: row.closedSignupNote ?? '',
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * Write the policy. Callers must have already established that the actor is an
 * admin — this function does not check, because the check belongs at the route
 * boundary where the session lives.
 */
export async function updateAppSettings(
  patch: Partial<AppSettings>,
  updatedBy: number,
): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = { ...current, ...patch };

  await db
    .insert(appSettings)
    .values({ id: 1, ...next, updatedBy })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { ...next, updatedBy, updatedAt: sql`now()` },
    });

  return next;
}
