import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// Isolated from auth.ts so Edge middleware can refresh a JWT without pulling
// in Drizzle / next/headers.

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'devdash-secret-key-change-in-prod'
);

export const COOKIE_NAME = 'devdash-session';
export const SESSION_TTL = '30d';
// Slide after a week of a 30-day token so a phone that is used at all never
// hits a surprise 401. The leftover 23 days is the idle window.
export const SLIDE_AFTER_SEC = 7 * 24 * 60 * 60;

export interface SessionClaims {
  userId: number;
  machineId: number;
  email: string;
  name: string;
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<(SessionClaims & { iat?: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return claimsFrom(payload);
  } catch {
    return null;
  }
}

function claimsFrom(payload: JWTPayload): (SessionClaims & { iat?: number }) | null {
  if (
    typeof payload.userId !== 'number' ||
    typeof payload.machineId !== 'number' ||
    typeof payload.email !== 'string' ||
    typeof payload.name !== 'string'
  ) {
    return null;
  }
  return {
    userId: payload.userId,
    machineId: payload.machineId,
    email: payload.email,
    name: payload.name,
    iat: typeof payload.iat === 'number' ? payload.iat : undefined,
  };
}

export async function refreshIfStale(token: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const claims = await verifySessionToken(token);
  if (!claims || claims.iat == null) return null;
  if (nowSec - claims.iat < SLIDE_AFTER_SEC) return null;
  const { iat: _iat, ...rest } = claims;
  return signSessionToken(rest);
}
