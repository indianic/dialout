import webpush from 'web-push';

// Push delivery. Web uses VAPID; native uses FCM (Android and APNs via FCM).
// Entirely optional: missing keys disable that transport rather than throwing.

let webConfigured: boolean | null = null;
let fcmApp: any = null;
let fcmTried = false;

export type PushPlatform = 'web' | 'fcm' | 'apns';

export function pushConfigured(): boolean {
  return vapidConfigured() || fcmConfigured();
}

export function vapidConfigured(): boolean {
  if (webConfigured !== null) return webConfigured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    webConfigured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    publicKey,
    privateKey
  );
  webConfigured = true;
  return true;
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}

export function fcmConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  platform?: string | null;
  deviceToken?: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

// Returns true when the subscription is still good, false when the push
// service says it is gone and the row should be deleted.
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<boolean> {
  const platform = (target.platform || 'web') as PushPlatform;
  if (platform === 'fcm' || platform === 'apns') {
    return sendFcm(target.deviceToken || fcmTokenFromEndpoint(target.endpoint), payload);
  }
  if (!vapidConfigured()) return true;
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    // 404/410 mean the browser threw the subscription away — uninstalled the
    // PWA, cleared data, revoked permission. Anything else is transient and
    // the row is worth keeping.
    const status = err?.statusCode;
    return !(status === 404 || status === 410);
  }
}

function fcmTokenFromEndpoint(endpoint: string): string {
  return endpoint.startsWith('fcm:') ? endpoint.slice(4) : endpoint;
}

async function sendFcm(token: string, payload: PushPayload): Promise<boolean> {
  if (!token) return false;
  const messaging = await fcmMessaging();
  if (!messaging) return true; // not configured: keep the row, send nothing
  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url, tag: payload.tag || '' },
      android: { collapseKey: payload.tag },
      apns: payload.tag ? { headers: { 'apns-collapse-id': payload.tag } } : undefined,
    });
    return true;
  } catch (err: any) {
    const code = String(err?.code || err?.errorInfo?.code || '');
    // Invalid / unregistered tokens should drop the row. Anything else is transient.
    return !/registration-token-not-registered|invalid-registration-token|invalid-argument/i.test(code);
  }
}

async function fcmMessaging(): Promise<any | null> {
  if (!fcmConfigured()) return null;
  if (fcmTried) return fcmApp ? fcmApp.messaging() : null;
  fcmTried = true;
  try {
    const admin = await import('firebase-admin');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    const cred = JSON.parse(raw);
    fcmApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(cred) });
    return fcmApp.messaging();
  } catch (err: any) {
    console.error('[push] firebase-admin not available:', err?.message);
    fcmApp = null;
    return null;
  }
}
