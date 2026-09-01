import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accessRequests, users, signupInvites } from '@/lib/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getAppSettings } from '@/lib/app-settings';
import { verifySolution } from '@/lib/captcha';
import { sendEmail, accessRequestAckEmailHtml, accessRequestAdminEmailHtml } from '@/lib/email';

/**
 * "Request early access" — the public queue that stands in for open signup.
 *
 * POST is unauthenticated, so it carries the same defences as the enquiry
 * endpoint: fixed fields, all length-capped, a server-verified captcha, and a
 * per-address rate limit. The row is written before any email is attempted, for
 * the same reason: a request that existed only as an email nobody could send is
 * a person who was never told no.
 *
 * GET is admin-only and returns the queue.
 */

const LIMITS = {
  name: 120,
  email: 200,
  company: 160,
  role: 120,
  machineCount: 60,
  useCase: 2000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return false;
}

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(request: NextRequest) {
  try {
    // The queue is only open when the operator says it is. Checked server-side
    // as well as hidden in the UI, because a hidden button is a UI state and
    // this is a policy — the marketing page's copy must not be the only thing
    // standing between a closed instance and a full table.
    const settings = await getAppSettings();
    if (!settings.trialEnabled) {
      return NextResponse.json(
        { error: 'Access requests are closed right now.' },
        { status: 403 },
      );
    }

    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests from this address. Try again in a little while.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const captcha = verifySolution(clean(body.captchaToken, 4096), clean(body.captchaAnswer, 32));
    if (captcha !== 'ok') {
      const message =
        captcha === 'expired' || captcha === 'reused'
          ? 'That code has expired. Here is a new one.'
          : 'That code does not match. Please try again.';
      return NextResponse.json({ error: message, refresh: true }, { status: 400 });
    }

    const name = clean(body.name, LIMITS.name);
    const email = clean(body.email, LIMITS.email).toLowerCase();
    const company = clean(body.company, LIMITS.company);
    const role = clean(body.role, LIMITS.role);
    const machineCount = clean(body.machineCount, LIMITS.machineCount);
    const useCase = clean(body.useCase, LIMITS.useCase);

    if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    // Already has an account. Answered with the same shape as success so this
    // endpoint cannot be used to test whether an address is registered — unlike
    // the invite route, the caller here is an anonymous stranger.
    const registered = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (registered.length > 0) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    // One open request per address, enforced by a partial unique index. Racing
    // duplicates land on the constraint rather than on a read-then-write gap.
    let created;
    try {
      [created] = await db
        .insert(accessRequests)
        .values({
          name,
          email,
          company,
          role,
          machineCount,
          useCase,
          sourcePage: clean(body.sourcePage, 200),
          userAgent: (request.headers.get('user-agent') || '').slice(0, 400),
        })
        .returning();
    } catch {
      // Unique violation on the pending index: they already asked. Same success
      // shape, so a refresh reads as "we got it" rather than as an error.
      return NextResponse.json({ success: true, duplicate: true });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
    const notifyTo = process.env.ENQUIRY_NOTIFY_EMAIL || process.env.FROM_EMAIL;

    try {
      await sendEmail({
        to: email,
        subject: 'Your Dialout access request',
        html: accessRequestAckEmailHtml(name),
      });
    } catch (err) {
      console.error('[access-requests] ack email failed:', err);
    }

    if (notifyTo) {
      try {
        await sendEmail({
          to: notifyTo,
          subject: `Access request — ${name}${company ? ` (${company})` : ''}`,
          html: accessRequestAdminEmailHtml(
            { name, email, company, role, machineCount, useCase },
            `${appUrl.replace(/\/+$/, '')}/settings`,
          ),
        });
      } catch (err) {
        console.error('[access-requests] notify email failed:', err);
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('[access-requests] POST failed:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const status = new URL(request.url).searchParams.get('status');
  const valid = status === 'approved' || status === 'declined' || status === 'pending';

  const rows = await db
    .select({
      id: accessRequests.id,
      name: accessRequests.name,
      email: accessRequests.email,
      company: accessRequests.company,
      role: accessRequests.role,
      machineCount: accessRequests.machineCount,
      useCase: accessRequests.useCase,
      status: accessRequests.status,
      reviewedAt: accessRequests.reviewedAt,
      createdAt: accessRequests.createdAt,
      inviteId: accessRequests.inviteId,
      // Whether the invite an approval minted has actually been redeemed, so
      // the queue can distinguish "approved" from "approved and joined".
      inviteUsedAt: signupInvites.usedAt,
    })
    .from(accessRequests)
    .leftJoin(signupInvites, eq(accessRequests.inviteId, signupInvites.id))
    .where(valid ? eq(accessRequests.status, status!) : sql`true`)
    .orderBy(desc(accessRequests.id))
    .limit(200);

  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(accessRequests)
    .where(eq(accessRequests.status, 'pending'));

  return NextResponse.json({ requests: rows, pendingCount: pending });
}
