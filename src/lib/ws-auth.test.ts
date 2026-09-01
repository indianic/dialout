import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { readCookie, extractWsToken, verifyWsToken, SESSION_COOKIE } from './ws-auth';

const secret = new TextEncoder().encode('test-secret-that-is-long-enough-for-hs256');
const otherSecret = new TextEncoder().encode('a-completely-different-secret-value-here');

const sign = (payload: Record<string, unknown>, exp = '1h', key = secret) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);

describe('readCookie', () => {
  it('finds a cookie among several', () => {
    expect(readCookie('a=1; devdash-session=abc.def; b=2', SESSION_COOKIE)).toBe('abc.def');
  });

  it('is not fooled by a cookie whose name merely ends with the target', () => {
    // 'not-devdash-session' must not match 'devdash-session'.
    expect(readCookie('not-devdash-session=evil', SESSION_COOKIE)).toBeNull();
  });

  it('handles a missing header and a missing cookie', () => {
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
    expect(readCookie('other=1', SESSION_COOKIE)).toBeNull();
  });
});

describe('extractWsToken', () => {
  it('prefers the cookie over the query parameter', () => {
    // The cookie is HttpOnly and cannot be read by page scripts, so it is the
    // stronger of the two credentials.
    expect(extractWsToken('devdash-session=from-cookie', 'from-query')).toBe('from-cookie');
  });

  it('falls back to the query parameter for native clients', () => {
    expect(extractWsToken(undefined, 'from-query')).toBe('from-query');
  });

  it('returns null when neither is present', () => {
    expect(extractWsToken(undefined, null)).toBeNull();
  });
});

describe('verifyWsToken', () => {
  it('accepts a valid token and returns its identity', async () => {
    const token = await sign({ userId: 7, machineId: 3 });
    expect(await verifyWsToken(token, secret)).toEqual({ userId: 7, machineId: 3 });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await sign({ userId: 7, machineId: 3 }, '1h', otherSecret);
    expect(await verifyWsToken(token, secret)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ userId: 7, machineId: 3 }, '-1s');
    expect(await verifyWsToken(token, secret)).toBeNull();
  });

  it('rejects a token with no usable userId', async () => {
    // The whole point is that identity comes from the signature, never from
    // something the caller can type.
    expect(await verifyWsToken(await sign({ machineId: 3 }), secret)).toBeNull();
    expect(await verifyWsToken(await sign({ userId: 0 }), secret)).toBeNull();
    expect(await verifyWsToken(await sign({ userId: 'admin' }), secret)).toBeNull();
  });

  it('rejects garbage and absence', async () => {
    expect(await verifyWsToken(null, secret)).toBeNull();
    expect(await verifyWsToken('not-a-jwt', secret)).toBeNull();
  });
});

describe('verifyWsToken with a misconfigured secret', () => {
  it('refuses to verify against an empty secret', async () => {
    // Flagged by review as a potential fail-open. It is not exploitable today
    // only because jose rejects zero-length keys; this asserts the behaviour
    // directly so it cannot regress on a library upgrade.
    const token = await sign({ userId: 7, machineId: 3 });
    expect(await verifyWsToken(token, new TextEncoder().encode(''))).toBeNull();
  });
});
