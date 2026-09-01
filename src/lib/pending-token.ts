import { SignJWT, jwtVerify } from 'jose';

// Short-lived, single-purpose token bridging the gap between password (PIN)
// verification and a full session: either the pending 2FA challenge or the
// mandatory-enrollment flow. Never grants dashboard/data access.

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'devdash-secret-key-change-in-prod');
const PENDING_TTL = '5m';

export type PendingPurpose = '2fa' | 'enroll';
export const PENDING_COOKIE = 'devdash-pending';

export async function issuePendingToken(userId: number, machineId: number, purpose: PendingPurpose): Promise<string> {
  return new SignJWT({ userId, machineId, purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(PENDING_TTL)
    .sign(SECRET);
}

export async function verifyPendingToken(
  token: string | undefined, purpose: PendingPurpose,
): Promise<{ userId: number; machineId: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== purpose) return null;
    return { userId: payload.userId as number, machineId: payload.machineId as number };
  } catch {
    return null;
  }
}
