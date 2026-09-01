import { describe, it, expect } from 'vitest';
import { otpFocusIndex } from '../otp';

describe('otpFocusIndex', () => {
  // The bug this exists for: typing a digit auto-focuses the NEXT box, which
  // fires the focus rule synchronously — before React re-renders. Given the
  // fresh value, the rule must leave focus on the next box. If it is given the
  // stale pre-keystroke value it bounces back to the box just typed into, and
  // every key has to be pressed twice.
  it('keeps focus on the next box after a digit is typed', () => {
    // Typed "1" into box 0; value is now "1"; auto-advance focuses box 1.
    expect(otpFocusIndex(1, '1', 4)).toBe(1);
  });

  it('keeps focus advancing through every box as digits are entered', () => {
    expect(otpFocusIndex(1, '1', 4)).toBe(1);
    expect(otpFocusIndex(2, '12', 4)).toBe(2);
    expect(otpFocusIndex(3, '123', 4)).toBe(3);
  });

  it('bounces to the first empty box when clicking past what is typed', () => {
    // Empty input, user clicks the last box — no gaps allowed, go to box 0.
    expect(otpFocusIndex(3, '', 4)).toBe(0);
    // Two digits entered, user clicks box 4 — first empty is box 2.
    expect(otpFocusIndex(3, '12', 4)).toBe(2);
  });

  it('allows clicking any already-filled box to edit it', () => {
    expect(otpFocusIndex(0, '1234', 4)).toBe(0);
    expect(otpFocusIndex(2, '1234', 4)).toBe(2);
    expect(otpFocusIndex(3, '1234', 4)).toBe(3);
  });

  it('allows focusing the one box immediately after the last digit', () => {
    // value "12" -> box 2 is the next empty box, not "past the end".
    expect(otpFocusIndex(2, '12', 4)).toBe(2);
  });

  it('never returns an index outside the input', () => {
    // A full value must not send focus to a box that does not exist.
    expect(otpFocusIndex(3, '1234', 4)).toBe(3);
    expect(otpFocusIndex(5, '123456', 6)).toBe(5);
  });

  it('works for 6-box codes', () => {
    expect(otpFocusIndex(1, '1', 6)).toBe(1);
    expect(otpFocusIndex(5, '12', 6)).toBe(2);
    expect(otpFocusIndex(4, '1234', 6)).toBe(4);
  });
});
