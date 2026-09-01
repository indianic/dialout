import { describe, it, expect } from 'vitest';
import { shouldFollow, PIN_THRESHOLD_PX } from './scroll-pin';

describe('shouldFollow', () => {
  it('follows when parked at the bottom', () => {
    expect(shouldFollow(900, 1400, 500)).toBe(true);
  });

  it('follows at exactly the threshold, and stops one pixel past it', () => {
    expect(shouldFollow(900 - PIN_THRESHOLD_PX, 1400, 500)).toBe(true);
    expect(shouldFollow(900 - PIN_THRESHOLD_PX - 1, 1400, 500)).toBe(false);
  });

  it('does not follow when the reader has scrolled up', () => {
    expect(shouldFollow(0, 1400, 500)).toBe(false);
  });

  // Content shorter than the viewport is always "at the bottom": there is
  // nowhere to scroll, so a new event must still land in view.
  it('follows when content is shorter than the viewport', () => {
    expect(shouldFollow(0, 300, 500)).toBe(true);
  });
});
