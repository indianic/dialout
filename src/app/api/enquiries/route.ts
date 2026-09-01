import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enquiries } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { verifySolution } from '@/lib/captcha';
import { sendEmail, enquiryAckEmailHtml, enquiryNotifyEmailHtml, type EnquiryFields } from '@/lib/email';

/**
 * The public contact / enterprise enquiry endpoint.
 *
 * This is the only unauthenticated write in the app, so it is deliberately
 * narrow: a fixed set of fields, all length-capped, a captcha that must be
 * solved server-side, and a per-address rate limit.
 *
 * Ordering matters. The row is written BEFORE either email is attempted, and a
 * delivery failure does not fail the request. Mail is the part that breaks —
 * SMTP unset on a fresh install is the normal state, not an edge case — and an
 * enquiry that existed only as an email nobody could send is an enquiry lost.
 * `notified_at` records whether the notification actually went out.
 */

const LIMITS = {
  name: 120,
  email: 200,
  company: 160,
  phone: 60,
  message: 4000,
  machines: 60,
  teamSize: 60,
  hosting: 120,
} as const;

// Deliberately permissive: the point is to reject obvious nonsense, not to
// adjudicate RFC 5322. Anything that gets past this is validated by whether
// the acknowledgement email arrives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Rate limit, keyed on client address. In-memory is right here for the same
 * reason it is in the captcha: one PM2 fork process, and a restart clearing
 * the window is harmless. It is a spam brake, not a security boundary.
 */
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
    // Behind a reverse proxy the socket address is the proxy, so prefer the
    // forwarded chain's first entry.
    const ip =
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many enquiries from this address. Try again in a little while.' },
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
      // 'refresh' tells the form to fetch a new challenge rather than let the
      // user retype against a token that can never succeed again.
      return NextResponse.json({ error: message, refresh: true }, { status: 400 });
    }

    const kind = body.kind === 'enterprise' ? 'enterprise' : 'contact';
    const name = clean(body.name, LIMITS.name);
    const email = clean(body.email, LIMITS.email);
    const message = clean(body.message, LIMITS.message);

    if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json(
        { error: 'Please tell us a little more — at least a sentence.' },
        { status: 400 },
      );
    }

    const fields: EnquiryFields = {
      kind,
      name,
      email,
      company: clean(body.company, LIMITS.company),
      phone: clean(body.phone, LIMITS.phone),
      message,
      machines: clean(body.machines, LIMITS.machines),
      teamSize: clean(body.teamSize, LIMITS.teamSize),
      hosting: clean(body.hosting, LIMITS.hosting),
      securityReview: body.securityReview === true,
      sourcePage: clean(body.sourcePage, 200),
    };

    const [row] = await db
      .insert(enquiries)
      .values({
        ...fields,
        company: fields.company || '',
        phone: fields.phone || '',
        machines: fields.machines || '',
        teamSize: fields.teamSize || '',
        hosting: fields.hosting || '',
        securityReview: fields.securityReview ?? false,
        sourcePage: fields.sourcePage || '',
        userAgent: (request.headers.get('user-agent') || '').slice(0, 500),
      })
      .returning({ id: enquiries.id });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dialout.dev';
    const notifyTo =
      process.env.ENQUIRY_NOTIFY_EMAIL || process.env.FROM_EMAIL || 'hello@dialout.dev';

    // Notification first: if only one of the two can get through, the one that
    // matters is the one that reaches a human who can reply.
    let notified = false;
    try {
      await sendEmail({
        to: notifyTo,
        subject:
          kind === 'enterprise'
            ? `Enterprise enquiry — ${name}${fields.company ? ` (${fields.company})` : ''}`
            : `Contact enquiry — ${name}`,
        html: enquiryNotifyEmailHtml(fields),
      });
      notified = true;
      await db
        .update(enquiries)
        .set({ notifiedAt: new Date().toISOString() })
        .where(eq(enquiries.id, row.id));
    } catch (err) {
      // Logged, not surfaced. The enquiry is already saved, and telling the
      // sender their message failed when it did not would be worse than
      // silence. notified_at stays null so the gap is findable.
      console.error(`[enquiries] notification failed for #${row.id}:`, (err as Error).message);
    }

    try {
      await sendEmail({
        to: email,
        subject:
          kind === 'enterprise'
            ? 'We received your Dialout enterprise enquiry'
            : 'We received your message',
        html: enquiryAckEmailHtml(fields, appUrl),
      });
    } catch (err) {
      console.error(`[enquiries] acknowledgement failed for #${row.id}:`, (err as Error).message);
    }

    return NextResponse.json({ ok: true, id: row.id, notified });
  } catch (err) {
    console.error('[enquiries] failed:', err);
    return NextResponse.json(
      { error: 'Something went wrong on our end. Please email us directly.' },
      { status: 500 },
    );
  }
}
