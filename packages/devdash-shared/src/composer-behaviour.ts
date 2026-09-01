// The compact key bar exists for a device with a finger and no real keyboard.
// That is a pointer question, not a width one: a half-width desktop window is
// not a phone, and an iPad in landscape is not a desktop.
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

// Enter sends where there is a real keyboard. On an on-screen keyboard the
// Enter key is conventionally a newline, and a stray one would fire a
// half-typed message — so there the send button is the only way to send.
//
// The second argument is deliberately "on-screen keyboard only", not "coarse
// pointer". They are not the same thing: an iPad with a keyboard cover is a
// coarse pointer WITH a real Enter key, and treating it as a phone made Enter
// useless there. The caller combines the pointer test with the hardware
// inference in useHardwareKeyboard.
export function shouldSubmitOnEnter(
  e: { key: string; shiftKey: boolean },
  onScreenKeyboardOnly: boolean
): boolean {
  if (e.key !== 'Enter') return false;
  if (e.shiftKey) return false;      // Shift+Enter is a newline everywhere
  return !onScreenKeyboardOnly;
}
