// Focus rule for the segmented code input (OtpInput).
//
// Pure and separate from the component for two reasons: the test setup is
// node-only (no DOM), and this is precisely where the bug lived — auto-advance
// and gap-prevention pull in opposite directions, and the interaction between
// them is easy to get backwards.

/**
 * Which box should actually hold focus when box `index` receives it.
 *
 * The input's value is a plain string, so it cannot represent a gap: a digit
 * typed into box 3 while box 2 is empty would jump a box left once the
 * characters are joined. Gaps are therefore prevented rather than represented —
 * focusing past the end of what has been typed bounces to the first empty box.
 *
 * CRITICAL: `value` must be the value as of *this moment*, not the one captured
 * by the last render. Auto-advance focuses box index+1 synchronously right
 * after a keystroke, before React re-renders. Given a stale `value`, this rule
 * bounces focus straight back to the box just typed into — and every key has to
 * be pressed twice. OtpInput keeps a ref updated at commit time for this.
 */
export function otpFocusIndex(index: number, value: string, length: number): number {
  if (index > value.length) return Math.min(value.length, length - 1);
  return index;
}
