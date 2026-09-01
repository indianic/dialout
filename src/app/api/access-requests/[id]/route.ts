import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accessRequests } from '@/lib/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { mintInvite, inviteUrl, INVITE_TTL_DAYS } from '@/lib/signup-invites';
import { sendEmail, accessApprovedEmailHtml } from '@/lib/email';

/**
 * Approve or decline one queued access request. Admin only.
 *
 * Approving has a side effect — it mints a real single-use invite and emails
 * it — which is why this is a POST with an explicit action rather than a PATCH
 * of a status field. A status column you can set to 'approved' invites the
 * question "did that send the email?", and the answer has to be yes every time.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be "approve" or "decline".' }, { status: 400 });
  }

  // Claim the row first, conditional on it still being pending, and only act if
  // the UPDATE actually changed something. Two admins clicking approve on the
  // same request at the same time would otherwise both mint an invite and the
  // applicant would get two live tokens.
  const [claimed] = await db
    .update(accessRequests)
    .set({
      status: action === 'approve' ? 'approved' : 'declined',
      reviewedBy: session.userId,
      reviewedAt: sql`now()`,
    })
    .where(and(eq(accessRequests.id, id), eq(accessRequests.status, 'pending')))
    .returning();

  if (!claimed) {
    return NextResponse.json(
      { error: 'That request is not pending — someone may have reviewed it already.' },
      { status: 409 },
    );
  }

  if (action === 'decline') {
    // No email. Being turned down silently is kinder than a rejection notice,
    // and the partial unique index lets them ask again later.
    return NextResponse.json({ success: true, status: 'declined' });
  }

  const invite = await mintInvite({
    email: claimed.email,
    invitedBy: session.userId,
    source: 'request',
    note: `Approved access request #${claimed.id}`,
  });

  await db
    .update(accessRequests)
    .set({ inviteId: invite.id })
    .where(eq(accessRequests.id, claimed.id));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
  const link = inviteUrl(appUrl, invite.token);

  let emailed = true;
  try {
    await sendEmail({
      to: claimed.email,
      subject: 'Your Dialout access is approved',
      html: accessApprovedEmailHtml(claimed.name, claimed.email, link, INVITE_TTL_DAYS),
    });
  } catch (err) {
    emailed = false;
    console.error('[access-requests] approval email failed:', err);
  }

  return NextResponse.json({
    success: true,
    status: 'approved',
    // Shown to the admin once so they can pass the link on by hand if SMTP is
    // not configured. It is never retrievable again — only the hash is stored.
    link,
    emailed,
  });
}
