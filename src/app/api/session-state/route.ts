import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * "Is this browser signed in?" — and nothing else.
 *
 * Exists so the marketing nav can show *Dashboard* instead of *Log in* without
 * making the whole marketing group dynamic. Reading the session in the layout
 * would be simpler and would cost every marketing page its static render, which
 * is a poor trade for one button.
 *
 * Deliberately returns a bare boolean. `/api/me` already answers this, but it
 * also runs a database query and a daemon status call to build the machine
 * list — far too much work for deciding a link's label, and it would put the
 * user's name and email into a response that exists only to style a nav.
 *
 * `no-store` because the answer is per-user and changes on login and logout. A
 * cached "signed in" served to a signed-out visitor would render a Dashboard
 * button that bounces them straight back to the login form.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return NextResponse.json(
    { signedIn: !!session },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
