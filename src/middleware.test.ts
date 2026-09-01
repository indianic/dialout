import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { SignJWT } from 'jose';
import { COOKIE_NAME, signSessionToken, SLIDE_AFTER_SEC } from './lib/session-token';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'devdash-secret-key-change-in-prod'
);

// A token whose iat is old enough that refreshIfStale mints a replacement.
function staleToken() {
  const past = Math.floor(Date.now() / 1000) - (SLIDE_AFTER_SEC + 60);
  return new SignJWT({ userId: 1, machineId: 2, email: 'a@b.c', name: 'A' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(past)
    .setExpirationTime('30d')
    .sign(SECRET);
}

function req(headers: Record<string, string>) {
  return new NextRequest('https://dash.test/api/projects', { headers });
}

describe('session refresh middleware', () => {
  let stale: string;
  beforeAll(async () => { stale = await staleToken(); });

  it('does NOT expose the raw token to a cookie-authenticated browser', async () => {
    const res = await middleware(req({ cookie: `${COOKIE_NAME}=${stale}` }));
    // httpOnly cookie is refreshed...
    expect(res.cookies.get(COOKIE_NAME)?.value).toBeTruthy();
    // ...but page script must not be able to read it back off the response.
    expect(res.headers.get('X-DevDash-Session')).toBeNull();
  });

  it('returns the refreshed token to a Bearer (native) caller', async () => {
    const res = await middleware(req({ authorization: `Bearer ${stale}` }));
    const header = res.headers.get('X-DevDash-Session');
    expect(header).toBeTruthy();
    expect(header).not.toBe(stale);
  });

  it('varies on Authorization so caches cannot cross-serve the header', async () => {
    const res = await middleware(req({ authorization: `Bearer ${stale}` }));
    expect(res.headers.get('Vary')).toContain('Authorization');
  });

  it('emits no refresh header for a fresh token', async () => {
    const fresh = await signSessionToken({ userId: 1, machineId: 2, email: 'a@b.c', name: 'A' });
    const res = await middleware(req({ authorization: `Bearer ${fresh}` }));
    expect(res.headers.get('X-DevDash-Session')).toBeNull();
  });
});
