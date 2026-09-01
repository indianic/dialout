import { authenticator } from 'otplib';

// TOTP (RFC 6238) via otplib. Secrets are stored encrypted at rest
// (secret-crypto.ts); only plaintext base32 secrets pass through here.

export const TOTP_WINDOW = 1;      // accept ±1 30s step for clock drift
export const TOTP_ISSUER = 'DevDash';

authenticator.options = { window: TOTP_WINDOW };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUri(secret: string, accountEmail: string): string {
  return authenticator.keyuri(accountEmail, TOTP_ISSUER, secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  const clean = (token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return authenticator.check(clean, secret);
  } catch {
    return false;
  }
}
