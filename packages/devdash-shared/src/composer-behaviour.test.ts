import { describe, it, expect } from 'vitest';
import { shouldSubmitOnEnter, COARSE_POINTER_QUERY } from './composer-behaviour';

const k = (key: string, shiftKey = false) => ({ key, shiftKey });

describe('shouldSubmitOnEnter', () => {
  it('sends on Enter where there is a real keyboard', () => {
    expect(shouldSubmitOnEnter(k('Enter'), false)).toBe(true);
  });

  // On a touch device the on-screen Enter is conventionally a newline, and a
  // stray one would fire a half-typed message.
  it('never sends on Enter on a coarse pointer', () => {
    expect(shouldSubmitOnEnter(k('Enter'), true)).toBe(false);
  });

  it('Shift+Enter is always a newline', () => {
    expect(shouldSubmitOnEnter(k('Enter', true), false)).toBe(false);
    expect(shouldSubmitOnEnter(k('Enter', true), true)).toBe(false);
  });

  it('ignores every other key', () => {
    for (const key of ['a', 'Escape', 'Tab', 'NumpadEnter']) {
      expect(shouldSubmitOnEnter(k(key), false)).toBe(false);
    }
  });

  it('exposes the media query it is paired with', () => {
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
  });
});
