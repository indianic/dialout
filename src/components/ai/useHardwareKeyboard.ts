'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isHardwareKeydown } from './keyboard-presence';
import { KEYBOARD_MIN_PX } from '@/hooks/viewport-override';

// How long to let the on-screen keyboard animate in before concluding it is
// not coming. iOS takes roughly 250ms; this leaves headroom without making the
// first Enter feel laggy.
const SETTLE_MS = 450;

/**
 * Infers whether a real keyboard is attached. There is no API for this, so it
 * combines two signals:
 *
 *  1. A keydown an on-screen keyboard cannot produce — positive proof.
 *  2. Focusing the input without the visual viewport shrinking — on a touch
 *     device, nothing covered the screen, so the typing must be happening
 *     somewhere else.
 *
 * Both are live, so snapping an iPad cover on or off is picked up without a
 * reload. Starts false: until something proves otherwise, touch behaves like
 * touch, because a wrongly-inserted newline is an annoyance while a wrongly
 * sent half-written message goes to a live agent.
 */
export function useHardwareKeyboard(enabled: boolean) {
  const [hardware, setHardware] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) setHardware(false);
  }, [enabled]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const noteKeydown = useCallback((e: {
    key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean;
  }) => {
    if (isHardwareKeydown(e)) setHardware(true);
  }, []);

  const noteFocus = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Shrunk => an on-screen keyboard really is covering the screen.
      // Didn't => on a coarse pointer, the keys are coming from elsewhere.
      const covered = vv.height < window.innerHeight - KEYBOARD_MIN_PX;
      setHardware(!covered);
    }, SETTLE_MS);
  }, [enabled]);

  return { hardware, noteKeydown, noteFocus };
}
