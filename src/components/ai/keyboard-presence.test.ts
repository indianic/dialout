import { describe, it, expect } from 'vitest';
import { isHardwareKeydown } from './keyboard-presence';

const k = (key: string, mods: Partial<{metaKey: boolean; ctrlKey: boolean; altKey: boolean}> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });

describe('isHardwareKeydown', () => {
  // No browser exposes "a keyboard is attached" — it is a fingerprinting
  // vector — so this is positive proof by elimination: an on-screen keyboard
  // cannot produce any of these.
  it('treats a modifier as proof of a physical keyboard', () => {
    expect(isHardwareKeydown(k('c', { metaKey: true }))).toBe(true);
    expect(isHardwareKeydown(k('c', { ctrlKey: true }))).toBe(true);
    expect(isHardwareKeydown(k('c', { altKey: true }))).toBe(true);
  });

  it('treats Escape, arrows and function keys as proof', () => {
    expect(isHardwareKeydown(k('Escape'))).toBe(true);
    expect(isHardwareKeydown(k('ArrowUp'))).toBe(true);
    expect(isHardwareKeydown(k('ArrowDown'))).toBe(true);
    expect(isHardwareKeydown(k('F5'))).toBe(true);
    expect(isHardwareKeydown(k('F12'))).toBe(true);
  });

  // The iPadOS on-screen keyboard DOES have a Tab key on its full layout, so
  // Tab proves nothing. False positives are the dangerous direction here: they
  // would make Enter send a half-typed message.
  it('does not treat Tab as proof', () => {
    expect(isHardwareKeydown(k('Tab'))).toBe(false);
  });

  it('does not treat ordinary typing or Enter as proof', () => {
    expect(isHardwareKeydown(k('a'))).toBe(false);
    expect(isHardwareKeydown(k('Enter'))).toBe(false);
    expect(isHardwareKeydown(k('Backspace'))).toBe(false);
    expect(isHardwareKeydown(k(' '))).toBe(false);
  });
});
