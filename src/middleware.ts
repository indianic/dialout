import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, refreshIfStale } from './lib/session-token';

// Sliding session for native clients. A 30-day JWT with no refresh would
// dump a phone user (PIN + TOTP) with no warning. After a week of age we
// mint a new token: cookie for browsers, X-DevDash-Session for Bearer
// clients. Login itself is not refreshed here — a pending 2FA cookie is a
// different, shorter-lived credential.

export async function middleware(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const token = bearer || req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const next = await refreshIfStale(token);
  if (!next) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, next, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  // Only a Bearer caller gets the raw token back. A browser authenticates by
  // cookie and must never be able to read its own session: same-origin page
  // script can read any response header, so emitting this unconditionally
  // would hand a fresh 30-day JWT to any XSS and defeat the httpOnly cookie.
  if (bearer) res.headers.set('X-DevDash-Session', next);
  // The response now varies on Authorization — keep a shared cache from
  // serving one caller's refresh header to another.
  res.headers.set('Vary', 'Authorization');
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
