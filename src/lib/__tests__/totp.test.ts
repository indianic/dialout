import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import { generateTotpSecret, buildOtpauthUri, verifyTotp, TOTP_ISSUER } from '../totp';

describe('totp', () => {
  it('generates a non-empty base32 secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies a code produced from the same secret', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('000000', secret)).toBe(false);
  });

  it('rejects a malformed / empty token safely', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp('', secret)).toBe(false);
    expect(verifyTotp('abc', secret)).toBe(false);
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'a@b.com');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    // Asserted against the exported constant rather than a literal, so a
    // rebrand updates one place. The issuer is what an authenticator app shows
    // beside the code — a wrong one is a support ticket, not a broken login.
    expect(uri).toContain(`issuer=${TOTP_ISSUER}`);
    expect(uri).toContain(`${TOTP_ISSUER}:`);
    expect(uri).toContain('a%40b.com');
  });
});
