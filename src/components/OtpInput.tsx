'use client';

import { useEffect, useRef } from 'react';
import { otpFocusIndex } from '@/lib/otp';

// One segmented code input for the whole app. Extracted verbatim from the login
// screen's boxes so every code field — login, PIN change, 2FA enable, 2FA
// disable — is literally the same component and cannot drift apart.
//
// Controlled on a plain string: the parent holds "1234", never an array of
// characters, so callers never re-implement the split/join dance.

interface OtpInputProps {
  /** How many boxes. 4 = PIN, 6 = emailed / authenticator code. */
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Dots instead of digits — for secrets (PINs), not for emailed codes. */
  masked?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** 'md' is the login size. 'sm' fits 6 boxes inside a card or modal. */
  size?: 'md' | 'sm';
  /** Announced to screen readers, e.g. "Current PIN". */
  label?: string;
  /** Fires when the last box fills — lets a form act without a click. */
  onComplete?: (value: string) => void;
}

const SIZES = {
  md: { width: 54, height: 62, fontSize: 28, gap: 12 },
  sm: { width: 42, height: 50, fontSize: 21, gap: 8 },
};

export default function OtpInput({
  length = 4,
  value,
  onChange,
  masked = false,
  autoFocus = false,
  disabled = false,
  size = 'md',
  label,
  onComplete,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const s = SIZES[size];
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  // handleFocus runs synchronously from inside handleChange's auto-advance,
  // BEFORE React re-renders — so reading the `value` prop there would read the
  // pre-keystroke value and bounce focus back to the box just typed into. This
  // ref carries the value as of right now. Kept in sync both eagerly (commit)
  // and when the parent changes it (effect).
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  const commit = (next: string) => {
    valueRef.current = next;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  // A string cannot represent a gap: ['1','','3'] joins to "13" and the 3 would
  // visibly jump a box left. So gaps are forbidden rather than represented —
  // handleFocus bounces the caret to the first empty box, keeping entry
  // contiguous and join() lossless. Clearing a middle box collapses the rest
  // left, exactly like a text field.
  const setAt = (index: number, char: string) => {
    const arr = [...digits];
    arr[index] = char;
    commit(arr.join(''));
  };

  const handleChange = (index: number, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    if (!raw) { setAt(index, ''); return; }
    setAt(index, raw.slice(-1));
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  // Clicking box 4 with two digits entered would strand a gap — send the caret
  // to the first empty box instead. otpFocusIndex owns that rule and is unit
  // tested; it must be fed valueRef (fresh), never the `value` prop (stale).
  const handleFocus = (index: number, e: React.FocusEvent<HTMLInputElement>) => {
    const target = otpFocusIndex(index, valueRef.current, length);
    if (target !== index) {
      refs.current[target]?.focus();
      return;
    }
    e.target.select();
  };

  // Paste is bound to every box, not only the first: people paste into whichever
  // one happens to have focus.
  const handlePaste = (index: number, e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length - index);
    if (!pasted) return;
    const arr = [...digits];
    for (let i = 0; i < pasted.length; i++) arr[index + i] = pasted[i];
    commit(arr.join(''));
    refs.current[Math.min(index + pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex" style={{ gap: s.gap }} role="group" aria-label={label}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          autoComplete="one-time-code"
          aria-label={label ? `${label}, digit ${i + 1} of ${length}` : `Digit ${i + 1} of ${length}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => handleFocus(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className="font-display text-center outline-none"
          style={{
            width: s.width,
            height: s.height,
            fontSize: s.fontSize,
            borderRadius: 'var(--r-sm)',
            background: 'var(--inp-bg)',
            border: `1.5px solid ${digit ? 'var(--accent)' : 'var(--b2)'}`,
            boxShadow: digit ? '0 0 0 3px var(--accent-weak)' : 'none',
            color: 'var(--accent)',
            letterSpacing: '0.06em',
            opacity: disabled ? 0.5 : 1,
            transition: 'border-color .15s, box-shadow .15s',
          }}
        />
      ))}
    </div>
  );
}
