import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// "Remember this device" — a per-user rotating HMAC key signs a cookie value
// carrying (userId, expiry). Rotating the key (on disable/reset/revoke)
// invalidates every trusted device for that user at once. No DB table needed.

export const TRUSTED_DEVICE_DAYS = 14;
export const TRUSTED_COOKIE = 'devdash-trust';

export function generateDeviceTrustKey(): string {
  return randomBytes(32).toString('base64url');
}

function sign(userId: number, expMs: number, key: string): string {
  return createHmac('sha256', key).update(`${userId}.${expMs}`).digest('base64url');
}

export function issueTrustedCookieValue(
  userId: number, key: string, days = TRUSTED_DEVICE_DAYS, nowMs = Date.now(),
): string {
  const expMs = nowMs + days * 24 * 60 * 60 * 1000;
  return `${userId}.${expMs}.${sign(userId, expMs, key)}`;
}

export function verifyTrustedCookieValue(
  value: string | undefined, userId: number, key: string | null, nowMs = Date.now(),
): boolean {
  if (!value || !key) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [uidStr, expStr, mac] = parts;
  if (Number(uidStr) !== userId) return false;
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const expected = sign(userId, expMs, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
