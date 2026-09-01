import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/schema';
import { vapidPublicKey, pushConfigured, fcmConfigured, type PushPlatform } from '@/lib/push';

// GET — the public key the browser needs to subscribe, plus whether the
// server can send at all. A client that asks for notification permission on
// an install with no keys configured would be asking for nothing.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    enabled: pushConfigured(),
    publicKey: vapidPublicKey(),
    fcm: fcmConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const platform = (['web', 'fcm', 'apns'].includes(body.platform) ? body.platform : 'web') as PushPlatform;

  let endpoint = String(body.endpoint || '');
  let p256dh = String(body.keys?.p256dh || '');
  let auth = String(body.keys?.auth || '');
  const deviceToken = String(body.token || body.deviceToken || '');

  if (platform === 'fcm' || platform === 'apns') {
    if (!deviceToken) {
      return NextResponse.json({ error: 'Missing device token' }, { status: 400 });
    }
    // Reuse the unique endpoint index so a re-subscribe updates rather than
    // duplicates. Native rows have no VAPID keys.
    endpoint = `fcm:${deviceToken}`;
    p256dh = p256dh || 'native';
    auth = auth || 'native';
  } else if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Incomplete subscription' }, { status: 400 });
  }

  // The endpoint is unique per device, so re-subscribing the same browser
  // updates its row instead of adding a duplicate that would deliver every
  // notification twice.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  await db.insert(pushSubscriptions).values({
    userId: session.userId,
    endpoint,
    p256dh,
    auth,
    userAgent: (req.headers.get('user-agent') || '').slice(0, 300),
    platform,
    deviceToken: deviceToken || '',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = String(body.endpoint || '');
  if (endpoint) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  return NextResponse.json({ ok: true });
}
