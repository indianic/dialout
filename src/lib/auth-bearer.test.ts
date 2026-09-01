import { describe, it, expect } from 'vitest';
import { wantsRawToken } from './auth';

// The opt-in that keeps browsers cookie-only.
//
// A browser must never receive the raw session token in a readable place: the
// whole value of an HttpOnly cookie is that page scripts cannot read or
// exfiltrate it. A native client has no such protection to lose and asks
// explicitly.
describe('wantsRawToken', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://example.com/api/auth', { method: 'POST', headers });

  it('is true only when a client identifies itself as native', () => {
    expect(wantsRawToken(req({ 'x-devdash-client': 'native' }))).toBe(true);
  });

  it('is case-insensitive about the value', () => {
    expect(wantsRawToken(req({ 'x-devdash-client': 'Native' }))).toBe(true);
  });

  it('is false for a browser, which sends no such header', () => {
    expect(wantsRawToken(req({}))).toBe(false);
    expect(wantsRawToken(req({ 'user-agent': 'Mozilla/5.0' }))).toBe(false);
  });

  it('is false for any other client value', () => {
    // Fail closed: an unrecognised client gets the cookie-only behaviour.
    expect(wantsRawToken(req({ 'x-devdash-client': 'web' }))).toBe(false);
    expect(wantsRawToken(req({ 'x-devdash-client': '' }))).toBe(false);
  });
});
