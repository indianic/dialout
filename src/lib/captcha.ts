import { randomInt, timingSafeEqual } from 'crypto';
import { encryptSecret, decryptSecret } from './secret-crypto';

/**
 * A small self-contained captcha for the public enquiry forms.
 *
 * The design constraint is that these forms are unauthenticated, so there is
 * no session to hang challenge state on, and the app runs as a single process
 * that can be restarted by a deploy at any moment. So the challenge is
 * *sealed* rather than stored: the expected answer is AES-256-GCM encrypted
 * into an opaque token the browser holds and hands back on submit.
 *
 * Why sealed rather than an HMAC of the answer: an HMAC would let a bot brute
 * force the answer offline. The alphabet below is 30 characters and the code
 * is 5 long, which is only ~24 million combinations — seconds of work against
 * a hash. Encryption gives it nothing to grind against.
 *
 * This stops scripted spam, which is what a contact form actually faces. It is
 * not a defence against a human being paid to fill in forms, and nothing in
 * this class is.
 */

// No 0/O/1/I/L — they are the characters people mistype off a screen, and a
// captcha that punishes good-faith users for the font's ambiguity is worse
// than no captcha.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const TTL_MS = 10 * 60 * 1000;

export interface Challenge {
  /** Shown to the user. */
  code: string;
  /** Opaque; round-trips through the browser and back to verifySolution. */
  token: string;
}

export function createChallenge(): Challenge {
  let code = '';
  // randomInt, not Math.random: this is the one value the whole check rests on.
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  const token = encryptSecret(JSON.stringify({ a: code, exp: Date.now() + TTL_MS }));
  return { code, token };
}

/**
 * Tokens are single-use within their lifetime. Without this, one solved
 * challenge could be replayed for ten minutes, which is exactly long enough
 * for a script to be worth writing.
 *
 * In-memory is correct here: the web app runs as one PM2 fork process, and a
 * restart invalidating outstanding challenges is harmless — the user gets a
 * fresh one and retypes five characters.
 */
const spent = new Map<string, number>();

function sweep(now: number) {
  for (const [token, exp] of spent) if (exp < now) spent.delete(token);
}

export type CaptchaResult = 'ok' | 'expired' | 'wrong' | 'malformed' | 'reused';

export function verifySolution(token: string, answer: string): CaptchaResult {
  if (typeof token !== 'string' || typeof answer !== 'string') return 'malformed';

  const plain = decryptSecret(token);
  if (!plain) return 'malformed';

  let parsed: { a?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(plain);
  } catch {
    return 'malformed';
  }
  const expected = typeof parsed.a === 'string' ? parsed.a : null;
  const exp = typeof parsed.exp === 'number' ? parsed.exp : 0;
  if (!expected) return 'malformed';

  const now = Date.now();
  sweep(now);
  if (exp < now) return 'expired';
  if (spent.has(token)) return 'reused';

  // Case-insensitive: the code is displayed in capitals, and rejecting a
  // correct answer because the user did not hold shift helps nobody.
  const a = Buffer.from(answer.trim().toUpperCase(), 'utf8');
  const b = Buffer.from(expected.toUpperCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'wrong';

  spent.set(token, exp);
  return 'ok';
}
