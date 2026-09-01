import { describe, it, expect } from 'vitest';
import {
  generateDeviceTrustKey, issueTrustedCookieValue, verifyTrustedCookieValue,
} from '../trusted-device';

describe('trusted-device', () => {
  it('verifies a freshly issued cookie for the same user + key', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value, 1, key)).toBe(true);
  });

  it('rejects a different user', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value, 2, key)).toBe(false);
  });

  it('rejects after the key rotates (revocation)', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    const rotated = generateDeviceTrustKey();
    expect(verifyTrustedCookieValue(value, 1, rotated)).toBe(false);
  });

  it('rejects an expired cookie', () => {
    const key = generateDeviceTrustKey();
    const now = 1_000_000_000_000;
    const value = issueTrustedCookieValue(1, key, 14, now);
    const later = now + 15 * 24 * 60 * 60 * 1000;
    expect(verifyTrustedCookieValue(value, 1, key, later)).toBe(false);
  });

  it('rejects tampered/empty/nullkey inputs safely', () => {
    const key = generateDeviceTrustKey();
    const value = issueTrustedCookieValue(1, key);
    expect(verifyTrustedCookieValue(value + 'x', 1, key)).toBe(false);
    expect(verifyTrustedCookieValue(undefined, 1, key)).toBe(false);
    expect(verifyTrustedCookieValue(value, 1, null)).toBe(false);
  });
});
