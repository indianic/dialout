import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// Salted scrypt hashing for the login PIN and reset codes, so a DB read never
// exposes a live credential. Format: `s1$<saltB64url>$<hashB64url>`.
// verifySecret also accepts legacy plaintext values (pre-migration) so existing
// users keep working until `scripts/hash-existing-pins.mjs` migrates them.

const PREFIX = 's1';
const KEYLEN = 32;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN);
  return `${PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function isHashed(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX + '$');
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (isHashed(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    if (expected.length === 0) return false;
    const actual = scryptSync(secret, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  // Legacy plaintext fallback (constant-time-ish). Removed effectively once the
  // one-time migration hashes all rows.
  const a = Buffer.from(secret);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
