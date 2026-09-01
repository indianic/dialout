'use client';

import { useEffect } from 'react';
import { viewportBox } from './viewport-override';

// The on-screen keyboard shrinks the VISUAL viewport but not the layout one,
// so a `100dvh` column keeps its last row underneath the keyboard — the
// composer vanishes at exactly the moment you start typing. dvh only tracks
// browser chrome; visualViewport is the one that knows about the keyboard.
//
// Sets --app-vh on <html>, read by Shell for full-bleed routes with a
// 100dvh fallback. A browser without visualViewport — or a desktop, where none
// of this matters — is unaffected.
export function useViewportHeight(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return; // no support — the dvh fallback stands

    const root = document.documentElement;
    const apply = () => {
      // Only a keyboard may shorten the app. Anything else — browser chrome,
      // or an iPad rendering the site desktop-width with a scaled visual
      // viewport — falls back to 100dvh by clearing the variables.
      const box = viewportBox(window.innerHeight, vv.height, vv.scale, vv.offsetTop);
      if (!box) {
        root.style.removeProperty('--app-vh');
        root.style.removeProperty('--app-vtop');
        return;
      }
      root.style.setProperty('--app-vh', `${box.height}px`);
      // iOS scrolls the visual viewport as well as shrinking it, so the shell
      // has to be pinned to where the user can actually see, not to layout y=0.
      root.style.setProperty('--app-vtop', `${box.top}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    // The keyboard can also scroll the visual viewport without resizing it.
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      // Scoped to this route: leaving the variable set would constrain every
      // other page that later decides to read it.
      root.style.removeProperty('--app-vh');
      root.style.removeProperty('--app-vtop');
    };
  }, [enabled]);
}
