import { jwtVerify } from 'jose';

// Authenticating a WebSocket upgrade.
//
// The ws-server previously trusted `?userId=` from the query string, which
// meant anyone who could reach it could claim to be any user. That was
// tolerable only for as long as the events it broadcast were machine-online
// pings; it stopped being tolerable the moment AI session transcripts started
// travelling over the same socket.
//
// Two credential sources, deliberately:
//   1. the `devdash-session` cookie, which browsers send on the upgrade
//      request automatically — no client change needed
//   2. a `token` query parameter, for native clients where cookie handling is
//      awkward or unavailable (a Flutter app, for instance)
//
// Both carry the same JWT that `getSession()` reads, so there is exactly one
// notion of identity in the system.

export interface WsIdentity {
  userId: number;
  machineId: number;
}

export const SESSION_COOKIE = 'devdash-session';

// Extract one cookie from a raw Cookie header. Values are not URL-decoded
// here because a JWT is already URL-safe.
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function verifyWsToken(
  token: string | null,
  secret: Uint8Array
): Promise<WsIdentity | null> {
  if (!token) return null;
  // Never verify against an empty secret. jose happens to reject zero-length
  // keys today, which is the only reason a misconfigured server fails closed
  // rather than accepting anything — that is a library behaviour, not a
  // guarantee, so the check is made here explicitly.
  if (secret.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = Number(payload.userId);
    const machineId = Number(payload.machineId);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return { userId, machineId: Number.isFinite(machineId) ? machineId : 0 };
  } catch {
    // Expired, tampered, or signed with a different secret. All the same
    // answer: this connection has no identity.
    return null;
  }
}

// Pull whichever credential the client offered. Cookie first: a browser always
// has one and it cannot be read by page scripts, so it is the stronger of the
// two.
export function extractWsToken(
  cookieHeader: string | undefined,
  queryToken: string | null
): string | null {
  return readCookie(cookieHeader, SESSION_COOKIE) || queryToken || null;
}
