import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// AES-256-GCM encryption for secrets at rest (machine API keys).
// Key is derived from JWT_SECRET so no new env var is required; set
// SECRET_ENC_KEY to rotate independently of JWT signing.

function encryptionKey(): Buffer {
  const secret = process.env.SECRET_ENC_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('SECRET_ENC_KEY or JWT_SECRET must be set');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

// Returns null if the value is malformed or the key doesn't match.
export function decryptSecret(stored: string): string | null {
  try {
    const [version, ivB64, tagB64, ctB64] = stored.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
