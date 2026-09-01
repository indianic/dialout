import { describe, it, expect } from 'vitest';
import { signSessionToken, verifySessionToken, refreshIfStale, SLIDE_AFTER_SEC } from './session-token';

const claims = { userId: 1, machineId: 2, email: 'a@b.c', name: 'Ada' };

describe('session-token', () => {
  it('round-trips claims', async () => {
    const token = await signSessionToken(claims);
    const got = await verifySessionToken(token);
    expect(got).toMatchObject(claims);
    expect(got?.iat).toBeGreaterThan(0);
  });

  it('does not slide a fresh token', async () => {
    const token = await signSessionToken(claims);
    const now = Math.floor(Date.now() / 1000);
    expect(await refreshIfStale(token, now)).toBeNull();
  });

  it('slides a token older than the idle window', async () => {
    const token = await signSessionToken(claims);
    const now = Math.floor(Date.now() / 1000) + SLIDE_AFTER_SEC + 10;
    const next = await refreshIfStale(token, now);
    expect(next).toEqual(expect.any(String));
    // A re-sign in the same second can produce an identical compact JWT
    // (iat is second-resolution). What matters is we got a valid token back.
    const got = await verifySessionToken(next!);
    expect(got).toMatchObject(claims);
  });
});
