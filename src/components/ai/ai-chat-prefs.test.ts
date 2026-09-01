import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFunctionKeysVisible, setFunctionKeysVisible } from './ai-chat-prefs';

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

describe('ai-chat-prefs', () => {
  it('defaults to hidden and round-trips', () => {
    expect(getFunctionKeysVisible()).toBe(false);
    setFunctionKeysVisible(true);
    expect(getFunctionKeysVisible()).toBe(true);
    setFunctionKeysVisible(false);
    expect(getFunctionKeysVisible()).toBe(false);
  });

  // Server render has no window at all; reading must not throw.
  it('returns the default when there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(getFunctionKeysVisible()).toBe(false);
  });

  it('survives a localStorage that throws (private mode, blocked storage)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      },
    });
    expect(getFunctionKeysVisible()).toBe(false);
    expect(() => setFunctionKeysVisible(true)).not.toThrow();
  });
});
