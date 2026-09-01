'use client';

import { useEffect, useRef } from 'react';
import { KEY_CHIPS, ctrlByte, DEFAULT_ENABLED_KEYS } from './terminal-keys';
import type { KeyChip } from './terminal-keys';

export type CtrlState = 'off' | 'armed' | 'locked';

interface KeyChipBarProps {
  onSend: (data: string) => void;
  ctrlState: CtrlState;
  onCtrlStateChange: (s: CtrlState) => void;
  enabledKeys?: Record<string, boolean>;
  haptics?: boolean;
}

const LONG_PRESS_MS = 450;

export default function KeyChipBar({ onSend, ctrlState, onCtrlStateChange, enabledKeys, haptics = true }: KeyChipBarProps) {
  const enabled = enabledKeys ?? DEFAULT_ENABLED_KEYS;
  const visibleChips = KEY_CHIPS.filter((c) => enabled[c.id] !== false);

  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });
  // Chip ids with a press currently in flight (pointerdown seen, no
  // pointerup/leave/cancel yet). The action fires from pointerup directly —
  // preventDefault() on pointerdown can suppress the compatibility click
  // event for touch pointers on some engines, so we can't rely on onClick.
  const activePress = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (longPress.current.timer) clearTimeout(longPress.current.timer);
    };
  }, []);

  const haptic = () => { if (!haptics) return; try { navigator.vibrate?.(10); } catch {} };

  const tapChip = (chip: KeyChip) => {
    haptic();
    if (chip.kind === 'modifier-ctrl') {
      // Tap cycles off → armed → off; long-press (below) locks.
      onCtrlStateChange(ctrlState === 'off' ? 'armed' : 'off');
      return;
    }
    if (chip.kind === 'paste') {
      navigator.clipboard?.readText?.()
        .then((t) => { if (t) onSend(t); })
        .catch(() => {});
      return;
    }
    if (!chip.seq) return;
    if (ctrlState !== 'off' && chip.seq.length === 1) {
      const b = ctrlByte(chip.seq);
      if (b) {
        onSend(b);
        if (ctrlState === 'armed') onCtrlStateChange('off');
        return;
      }
    }
    onSend(chip.seq);
    if (ctrlState === 'armed') onCtrlStateChange('off');
  };

  const ctrlPointerDown = () => {
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      haptic();
      onCtrlStateChange('locked');
    }, LONG_PRESS_MS);
  };
  const ctrlPointerUp = () => {
    if (longPress.current.timer) {
      clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  };

  // Cancel a press without firing the chip's action (finger dragged off the
  // chip, or the platform cancelled the pointer).
  const abortPress = (chip: KeyChip) => {
    activePress.current.delete(chip.id);
    if (chip.kind === 'modifier-ctrl') ctrlPointerUp();
  };

  return (
    <div className="devdash-kcb">
      {visibleChips.map((chip) => {
        const isCtrl = chip.kind === 'modifier-ctrl';
        return (
          <button
            key={chip.id}
            type="button"
            className={`devdash-kcb-chip${isCtrl && ctrlState !== 'off' ? ` ${ctrlState}` : ''}`}
            // preventDefault keeps focus in the composer textarea so the
            // mobile keyboard does not close when a chip is tapped. This can
            // suppress the compatibility click event on some touch engines,
            // so the action fires from pointerup below, not onClick.
            onPointerDown={(e) => {
              e.preventDefault();
              activePress.current.add(chip.id);
              if (isCtrl) ctrlPointerDown();
            }}
            onPointerUp={() => {
              const wasActive = activePress.current.delete(chip.id);
              if (isCtrl) ctrlPointerUp();
              if (!wasActive) return;
              if (isCtrl && longPress.current.fired) {
                longPress.current.fired = false;
                return;
              }
              tapChip(chip);
            }}
            onPointerLeave={() => abortPress(chip)}
            onPointerCancel={() => abortPress(chip)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                tapChip(chip);
              }
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
