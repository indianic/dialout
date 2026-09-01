import { cookies, headers } from 'next/headers';
import { db } from './db';
import { users, machines } from './schema';
import { eq } from 'drizzle-orm';
import { COOKIE_NAME, signSessionToken, verifySessionToken } from './session-token';

export interface Session {
  userId: number;
  machineId: number;
  email: string;
  name: string;
}

export async function createSession(userId: number, machineId: number, email: string, name: string): Promise<string> {
  const token = await signSessionToken({ userId, machineId, email, name });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return token;
}

// Read the session token from either credential.
//
// Browsers use the HttpOnly cookie. Native clients — a Flutter app, a script —
// cannot manage one usefully, so a Bearer token is accepted as an equal
// alternative. It is the same JWT either way, so there is exactly one notion
// of identity in the system.
//
// Bearer wins when both are present: it is the explicit choice.
async function readSessionToken(): Promise<string | null> {
  const headerStore = await headers();
  const authorization = headerStore.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

// Whether this caller wants the raw session token in the response body.
//
// Browsers deliberately never receive it: keeping the token cookie-only
// preserves the property that page scripts cannot read or exfiltrate a
// session. A native client opts in explicitly and takes responsibility for
// storing it somewhere safe.
export function wantsRawToken(request: Request): boolean {
  return (request.headers.get('x-devdash-client') || '').toLowerCase() === 'native';
}

export async function getSession(): Promise<Session | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return {
    userId: claims.userId,
    machineId: claims.machineId,
    email: claims.email,
    name: claims.name,
  };
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function switchMachine(userId: number, machineId: number): Promise<string | null> {
  const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
  if (!machine || machine.userId !== userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  return createSession(userId, machineId, user.email, user.name);
}

// True when the user has completed 2FA enrollment. Used by data routes to
// enforce mandatory 2FA at the API layer (not just the Shell UI gate), so a
// legacy/pre-feature session can't pull data without enrolling.
export async function isEnrolled(userId: number): Promise<boolean> {
  const [u] = await db.select({ e: users.twoFactorEnabled }).from(users).where(eq(users.id, userId));
  return !!u?.e;
}
