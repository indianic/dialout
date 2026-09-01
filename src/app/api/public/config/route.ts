import { NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/app-settings';

/**
 * The instance's public posture: may strangers register, and is there a queue
 * to join if they cannot.
 *
 * Unauthenticated by necessity — the signup page and the marketing site both
 * need it before anyone has an account. It exposes exactly two booleans and a
 * line of operator-written copy, and nothing that identifies a user, a machine
 * or the shape of the data. Anything richer belongs behind a session.
 *
 * `no-store` because the whole point of the toggle is that flipping it takes
 * effect now. A cached "signup is open" on a page served after it closed is
 * the one failure mode this endpoint has.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getAppSettings();
  return NextResponse.json(
    {
      signupEnabled: settings.signupEnabled,
      trialEnabled: settings.trialEnabled,
      closedSignupNote: settings.closedSignupNote,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
