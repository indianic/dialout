import { describe, it, expect } from 'vitest';
import {
  generateBackupCodes, consumeBackupCode,
  serializeBackupCodes, parseBackupCodes, BACKUP_CODE_COUNT,
} from '../backup-codes';

describe('backup-codes', () => {
  it('generates the configured number of unique formatted codes', () => {
    const { plain, stored } = generateBackupCodes();
    expect(plain).toHaveLength(BACKUP_CODE_COUNT);
    expect(stored).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(plain).size).toBe(BACKUP_CODE_COUNT);
    for (const c of plain) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    for (const s of stored) expect(s.usedAt).toBeNull();
  });

  it('consumes a valid code once and rejects reuse', () => {
    const { plain, stored } = generateBackupCodes();
    const first = consumeBackupCode(plain[0], stored);
    expect(first.ok).toBe(true);
    const again = consumeBackupCode(plain[0], first.updated);
    expect(again.ok).toBe(false);
  });

  it('accepts codes case-insensitively and ignoring dashes', () => {
    const { plain, stored } = generateBackupCodes();
    const noDash = plain[1].replace('-', '').toUpperCase();
    expect(consumeBackupCode(noDash, stored).ok).toBe(true);
  });

  it('rejects an unknown code', () => {
    const { stored } = generateBackupCodes();
    expect(consumeBackupCode('zzzz-zzzz', stored).ok).toBe(false);
  });

  it('round-trips through serialize/parse', () => {
    const { stored } = generateBackupCodes();
    const parsed = parseBackupCodes(serializeBackupCodes(stored));
    expect(parsed).toHaveLength(BACKUP_CODE_COUNT);
    expect(parseBackupCodes(null)).toEqual([]);
  });
});
