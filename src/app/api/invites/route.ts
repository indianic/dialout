import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signupInvites, users } from '@/lib/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isEnrolled } from '@/lib/auth';
import { mintInvite, inviteUrl, INVITE_TTL_DAYS } from '@/lib/signup-invites';
import { sendEmail, signupInviteEmailHtml } from '@/lib/email';

/**
 * Invites a signed-in user can send to a colleague.
 *
 * Any enrolled user may invite, not just an admin. That is the point of the
 * feature the way it was asked for — "already registered users can send an
 * invite to their friends or colleagues" — and it is the difference between an
 * instance that grows and one where the operator is a bottleneck. The brake is
 * the per-user quota below, not a role check.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * How many live invites one user may have outstanding.
 *
 * Counted as *unused and unexpired*, not as "sent ever", so a user who invites
 * ten colleagues who all sign up can invite ten more. Counting sends instead
 * would punish the users the feature is for while barely inconveniencing
 * anyone abusing it.
 */
const MAX_OUTSTANDING = 10;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrolment required' }, { status: 403 });
  }

  const rows = await db
    .select({
      id: signupInvites.id,
      email: signupInvites.email,
      source: signupInvites.source,
      note: signupInvites.note,
      expiresAt: signupInvites.expiresAt,
      usedAt: signupInvites.usedAt,
      revokedAt: signupInvites.revokedAt,
      createdAt: signupInvites.createdAt,
    })
    .from(signupInvites)
    .where(eq(signupInvites.invitedBy, session.userId))
    .orderBy(desc(signupInvites.id))
    .limit(100);

  // The token is not here and cannot be. Only its hash was stored, so there is
  // nothing to re-show — a user who loses the link sends a fresh invite.
  return NextResponse.json({ invites: rows, ttlDays: INVITE_TTL_DAYS });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isEnrolled(session.userId))) {
    return NextResponse.json({ error: 'Two-factor enrolment required' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Already has an account. Said plainly rather than hidden behind a generic
  // success: the sender is a signed-in user inviting someone they know, not a
  // stranger probing for registered addresses, and silently swallowing this
  // leaves them waiting for an email that will never arrive.
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'That email already has a Dialout account. They can just sign in.' },
      { status: 409 },
    );
  }

  const [{ live }] = await db
    .select({ live: sql<number>`count(*)::int` })
    .from(signupInvites)
    .where(
      sql`${signupInvites.invitedBy} = ${session.userId}
          AND ${signupInvites.usedAt} IS NULL
          AND ${signupInvites.revokedAt} IS NULL
          AND ${signupInvites.expiresAt}::timestamptz > now()`,
    );

  if (live >= MAX_OUTSTANDING) {
    return NextResponse.json(
      {
        error: `You have ${live} invites still outstanding. Revoke one, or wait for them to be used, before sending more.`,
      },
      { status: 429 },
    );
  }

  // An unused invite to the same address is replaced rather than duplicated —
  // "resend" is what the user means when they invite someone twice, and two
  // live tokens for one person is a loose end nobody closes.
  await db
    .update(signupInvites)
    .set({ revokedAt: sql`now()` })
    .where(
      sql`lower(${signupInvites.email}) = ${email}
          AND ${signupInvites.usedAt} IS NULL
          AND ${signupInvites.revokedAt} IS NULL`,
    );

  const invite = await mintInvite({ email, invitedBy: session.userId, source: 'manual', note });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
  const link = inviteUrl(appUrl, invite.token);

  // Mail failure does not fail the request: the invite row is already written
  // and the sender can copy the link out of the response. The same ordering
  // rule the enquiry endpoint follows — never lose the record to a broken SMTP.
  let emailed = true;
  try {
    await sendEmail({
      to: email,
      subject: `${session.name} invited you to Dialout`,
      html: signupInviteEmailHtml(session.name, email, link, INVITE_TTL_DAYS),
    });
  } catch (err) {
    emailed = false;
    console.error('[invites] send failed:', err);
  }

  return NextResponse.json(
    {
      // Returned once, to the sender only, so they can pass it on by hand when
      // mail is not configured. It is never readable again.
      id: invite.id,
      email: invite.email,
      link,
      expiresAt: invite.expiresAt,
      emailed,
    },
    { status: 201 },
  );
}
