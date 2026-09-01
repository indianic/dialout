import { NextRequest, NextResponse } from 'next/server';
import { checkInvite } from '@/lib/signup-invites';

/**
 * Check an invite link before drawing the signup form.
 *
 * Unauthenticated, because the whole point is that the visitor has no account
 * yet. It returns only "is this usable" and, when it is, the address the invite
 * was issued to — which the holder of the link already knows, since it is in
 * the email they are reading.
 *
 * Every rejection collapses to `{ valid: false }` with no reason attached.
 * Telling the caller apart "expired", "already used" and "never existed" turns
 * this into an oracle that confirms a token was once real.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const check = await checkInvite(token);

  if (!check.ok || !check.invite) {
    return NextResponse.json({ valid: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(
    { valid: true, email: check.invite.email, expiresAt: check.invite.expiresAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
