'use client';

import { useRef, useState } from 'react';
import { ctrlByte } from './terminal-keys';
import type { CtrlState } from './KeyChipBar';

interface TerminalComposerProps {
  onSendLine: (text: string) => void;
  onSendRaw: (data: string) => void;
  ctrlState: CtrlState;
  onCtrlStateChange: (s: CtrlState) => void;
}

// Chat-style input bar (spec §12.2). A REAL textarea so the OS keyboard
// provides swipe-typing and the mic/dictation button — this is the whole
// point: xterm's hidden textarea fights mobile IMEs and dictation.
export default function TerminalComposer({
  onSendLine,
  onSendRaw,
  ctrlState,
  onCtrlStateChange,
}: TerminalComposerProps) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Send press currently in flight (pointerdown seen, no pointerup/leave/
  // cancel yet). The action fires from pointerup directly — preventDefault()
  // on pointerdown can suppress the compatibility click event for touch
  // pointers on some engines, so we can't rely on onClick (see KeyChipBar).
  const sendPressActive = useRef(false);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const send = () => {
    onSendLine(value);
    setValue('');
    // Keep the keyboard up, WhatsApp-style: focus never leaves the textarea.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) { ta.style.height = 'auto'; ta.focus(); }
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    // Armed/locked Ctrl: the next typed letter becomes a control byte
    // instead of entering the composer.
    if (ctrlState !== 'off' && next.length === value.length + 1 && next.startsWith(value)) {
      const b = ctrlByte(next.slice(-1));
      if (b) {
        onSendRaw(b);
        if (ctrlState === 'armed') onCtrlStateChange('off');
        // In 'locked' mode no prop/state changes, so React won't re-render
        // the textarea back to `value` — restore the DOM imperatively or the
        // swallowed character stays typed in the DOM and leaks into the next
        // keystroke.
        e.target.value = value;
        e.target.setSelectionRange(value.length, value.length);
        return;
      }
    }
    setValue(next);
    autoGrow();
  };

  return (
    <div className="devdash-composer">
      <button
        type="button"
        className="devdash-composer-hide"
        aria-label="Hide keyboard"
        onClick={() => taRef.current?.blur()}
      >
        &#8964;
      </button>
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="devdash-composer-input"
        placeholder="Type a command&hellip;"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
      />
      <button
        type="button"
        className="devdash-composer-send"
        aria-label="Send"
        // preventDefault keeps focus in the textarea so the mobile keyboard
        // does not close when Send is tapped. This can suppress the
        // compatibility click event on some touch engines, so the action
        // fires from pointerup below, not onClick.
        onPointerDown={(e) => {
          e.preventDefault();
          sendPressActive.current = true;
        }}
        onPointerUp={() => {
          if (!sendPressActive.current) return;
          sendPressActive.current = false;
          send();
        }}
        onPointerLeave={() => { sendPressActive.current = false; }}
        onPointerCancel={() => { sendPressActive.current = false; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            send();
          }
        }}
      >
        &#10148;
      </button>
    </div>
  );
}
