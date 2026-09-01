import { randomBytes } from 'crypto';
import { hashSecret, verifySecret } from './pin-hash';

// One-time recovery codes. Stored hashed (scrypt, same as the PIN); the
// plaintext set is shown to the user exactly once at generation time.

export const BACKUP_CODE_COUNT = 8;

export interface BackupCode {
  hash: string;
  usedAt: string | null;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous l/o/0/1

function randomCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function normalize(input: string): string {
  return (input || '').replace(/-/g, '').trim().toLowerCase();
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): { plain: string[]; stored: BackupCode[] } {
  const plain: string[] = [];
  while (plain.length < count) {
    const c = randomCode();
    if (!plain.includes(c)) plain.push(c);
  }
  const stored = plain.map((c) => ({ hash: hashSecret(normalize(c)), usedAt: null as string | null }));
  return { plain, stored };
}

export function consumeBackupCode(input: string, stored: BackupCode[]): { ok: boolean; updated: BackupCode[] } {
  const candidate = normalize(input);
  if (!candidate) return { ok: false, updated: stored };
  for (let i = 0; i < stored.length; i++) {
    const entry = stored[i];
    if (entry.usedAt) continue;
    if (verifySecret(candidate, entry.hash)) {
      const updated = stored.slice();
      updated[i] = { ...entry, usedAt: new Date().toISOString() };
      return { ok: true, updated };
    }
  }
  return { ok: false, updated: stored };
}

export function serializeBackupCodes(stored: BackupCode[]): string {
  return JSON.stringify(stored);
}

export function parseBackupCodes(json: string | null): BackupCode[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
