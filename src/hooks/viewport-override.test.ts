import { describe, it, expect } from 'vitest';
import { viewportBox, KEYBOARD_MIN_PX } from './viewport-override';

describe('viewportBox', () => {
  it('does not override when the viewports agree (desktop)', () => {
    expect(viewportBox(900, 900, 1, 0)).toBe(null);
  });

  // iPad Safari rendering a site desktop-width reports a SCALED visual
  // viewport: roughly layout/scale, with nothing covering the screen. Trusting
  // it left the app ~80% tall with dead space beneath it.
  it('does not override a zoomed page, however large the difference', () => {
    expect(viewportBox(1300, 1040, 1.25, 0)).toBe(null);
    expect(viewportBox(1300, 650, 2, 0)).toBe(null);
  });

  it('overrides when a keyboard covers the screen at scale 1', () => {
    expect(viewportBox(800, 400, 1, 0)).toEqual({ height: 400, top: 0 });
  });

  // iOS does not only shrink the visual viewport, it scrolls it. Ignoring
  // offsetTop left a band of page background below the composer.
  it('carries offsetTop so the shell tracks the scrolled visual viewport', () => {
    expect(viewportBox(1300, 1000, 1, 210)).toEqual({ height: 1000, top: 210 });
  });

  it('never returns a negative top', () => {
    expect(viewportBox(1300, 1000, 1, -5)?.top).toBe(0);
    expect(viewportBox(1300, 1000, 1, NaN)?.top).toBe(0);
  });

  // Browser chrome appearing or hiding is small; a keyboard is not.
  it('ignores a difference too small to be a keyboard', () => {
    expect(viewportBox(900, 900 - KEYBOARD_MIN_PX + 1, 1, 0)).toBe(null);
  });

  // The boundary is stated one way round: a keyboard is STRICTLY larger than
  // the threshold, so exactly KEYBOARD_MIN_PX is still chrome.
  it('treats exactly the threshold as chrome, and one pixel more as a keyboard', () => {
    expect(viewportBox(900, 900 - KEYBOARD_MIN_PX, 1, 0)).toBe(null);
    expect(viewportBox(900, 900 - KEYBOARD_MIN_PX - 1, 1, 0)?.height).toBe(779);
  });

  it('never overrides on nonsense input', () => {
    expect(viewportBox(0, 0, 1, 0)).toBe(null);
    expect(viewportBox(900, 400, NaN, 0)).toBe(null);
    expect(viewportBox(900, -5, 1, 0)).toBe(null);
  });
});
