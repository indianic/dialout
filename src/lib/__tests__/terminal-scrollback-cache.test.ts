import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveScrollback, loadScrollback, clearScrollback, MAX_SCROLLBACK_BYTES,
  wasRestored, markRestored,
} from '../terminal-scrollback-cache';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  });
});

describe('terminal-scrollback-cache', () => {
  it('round-trips a save through to load', () => {
    saveScrollback('sess-1', 'hello world\r\nline two\r\n');
    expect(loadScrollback('sess-1')).toBe('hello world\r\nline two\r\n');
  });

  it('missing key loads as null', () => {
    expect(loadScrollback('never-saved')).toBeNull();
  });

  it('corrupt/oversize stored value cannot crash the loader', () => {
    // Directly poke a value in under the namespaced key that saveScrollback
    // itself would never have produced this large, simulating another tab's
    // stale/rogue write. Should still just return it (or null) — never throw.
    (window as any).localStorage.setItem(
      'devdash-term-scrollback:weird',
      'x'.repeat(MAX_SCROLLBACK_BYTES * 4),
    );
    expect(() => loadScrollback('weird')).not.toThrow();
  });

  it('oversize input is truncated to the cap, keeping the TAIL (most recent output)', () => {
    const marker = 'FRONT-MARKER-MUST-BE-DROPPED';
    const head = marker + 'A'.repeat(MAX_SCROLLBACK_BYTES); // way oversized; must be dropped
    const tail = 'B'.repeat(1000); // the most recent bytes, must survive
    saveScrollback('sess-big', head + tail);
    const loaded = loadScrollback('sess-big');
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBeLessThanOrEqual(MAX_SCROLLBACK_BYTES);
    // Tail must be fully preserved and be the actual end of the stored string.
    expect(loaded!.endsWith(tail)).toBe(true);
    // The front marker must have been dropped, not just re-arranged.
    expect(loaded).not.toContain(marker);
  });

  it('clear removes a saved key', () => {
    saveScrollback('sess-clear', 'some data');
    expect(loadScrollback('sess-clear')).toBe('some data');
    clearScrollback('sess-clear');
    expect(loadScrollback('sess-clear')).toBeNull();
  });

  it('namespaces keys so two cache keys never collide', () => {
    saveScrollback('a', 'data-for-a');
    saveScrollback('b', 'data-for-b');
    expect(loadScrollback('a')).toBe('data-for-a');
    expect(loadScrollback('b')).toBe('data-for-b');
    clearScrollback('a');
    expect(loadScrollback('a')).toBeNull();
    expect(loadScrollback('b')).toBe('data-for-b'); // untouched
  });

  it('quota/exception on setItem is swallowed, not thrown', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError'); },
        removeItem: () => {},
      },
    });
    expect(() => saveScrollback('sess-quota', 'data')).not.toThrow();
  });

  it('SSR / no-window environment is a safe no-op', () => {
    vi.stubGlobal('window', undefined);
    expect(() => saveScrollback('sess-ssr', 'data')).not.toThrow();
    expect(loadScrollback('sess-ssr')).toBeNull();
    expect(() => clearScrollback('sess-ssr')).not.toThrow();
  });
});

// Restore-once gate: a module-level Set (survives SPA remounts, resets only on
// a real page load / F5 when the JS module re-executes). Each test uses a
// unique key since the Set is intentionally module-scoped and never reset.
describe('terminal-scrollback-cache restore gate', () => {
  it('a key is not restored until marked, then stays marked', () => {
    expect(wasRestored('gate-a')).toBe(false); // fresh key: restore would fire
    markRestored('gate-a');
    expect(wasRestored('gate-a')).toBe(true); // subsequent SPA remount: skip
    markRestored('gate-a'); // idempotent
    expect(wasRestored('gate-a')).toBe(true);
  });

  it('distinct keys are gated independently', () => {
    markRestored('gate-b');
    expect(wasRestored('gate-b')).toBe(true);
    expect(wasRestored('gate-c')).toBe(false); // a different session still restores
  });
});
