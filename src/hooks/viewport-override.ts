// A keyboard is the only thing that should shorten the app.
//
// The first version of this trusted visualViewport.height, which is wrong on
// an iPad: Safari rendering a site desktop-width reports a SCALED visual
// viewport — roughly layout/scale — with nothing covering the screen. The app
// rendered at about 80% height with dead space beneath it. A zoomed page is
// not a keyboard, and scale is how you tell.
//
// The second version got the height right and ignored offsetTop, which is the
// other half of the same story. iOS does not only shrink the visual viewport,
// it SCROLLS it: the visible window becomes [offsetTop, offsetTop + height]
// while a normally-positioned element still starts at layout y=0. The app then
// sits offsetTop pixels too high and leaves a band of page background between
// the composer and whatever iOS is showing at the bottom.

// Browser chrome sliding in and out moves the visual viewport by a few dozen
// pixels; a software keyboard takes far more. This sits between the two.
export const KEYBOARD_MIN_PX = 120;

export interface ViewportBox {
  height: number;
  top: number;
}

// Returns the box the shell should occupy, or null to fall back to 100dvh in
// normal flow.
export function viewportBox(
  layoutHeight: number,
  visualHeight: number,
  scale: number,
  offsetTop: number
): ViewportBox | null {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) > 0.01) return null;
  if (!(visualHeight > 0) || !(layoutHeight > 0)) return null;
  if (visualHeight >= layoutHeight - KEYBOARD_MIN_PX) return null;
  return {
    height: Math.round(visualHeight),
    top: Math.round(Number.isFinite(offsetTop) && offsetTop > 0 ? offsetTop : 0),
  };
}
