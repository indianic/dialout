// Client-side scrollback cache (Phase 2, Task 4): persists a bounded xterm
// buffer snapshot in localStorage so a cold PWA/tab launch can replay "what
// this device last saw" before the live stream resumes. NOT full server
// scrollback (see Terminal.tsx wiring) — a per-device, per-key cache only.
// Fail-safe try/catch style mirrors mobile-term-prefs.ts throughout: every
// exported function is safe to call unconditionally (SSR, private mode,
// quota errors, corrupt stored values) and never throws.

const KEY_PREFIX = 'devdash-term-scrollback:';

// Hard cap in UTF-16 code units (JS string ".length"), not true UTF-8 bytes —
// close enough for a cap whose entire purpose is "don't let this grow
// unbounded"; xterm snapshots are overwhelmingly ASCII/ANSI-escape text.
export const MAX_SCROLLBACK_BYTES = 128 * 1024;

function storageKey(key: string): string {
  return KEY_PREFIX + key;
}

export function saveScrollback(key: string, data: string): void {
  if (typeof window === 'undefined') return;
  try {
    // Truncate from the FRONT so the most-recent tail survives — the whole
    // point of a bounded cache is "keep what the user just saw", not the
    // oldest history.
    const bounded = data.length > MAX_SCROLLBACK_BYTES
      ? data.slice(data.length - MAX_SCROLLBACK_BYTES)
      : data;
    window.localStorage.setItem(storageKey(key), bounded);
  } catch {}
}

export function loadScrollback(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(storageKey(key));
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {}
  return null;
}

export function clearScrollback(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(storageKey(key)); } catch {}
}

// Restore-once gate, scoped to the JS module lifetime (NOT a React mount and
// NOT sessionStorage). This is the correct scope because the /terminal attach
// page remounts <Terminal> on every Peek/Drive toggle (its `key` embeds a
// nonce that switchMode() bumps) while cacheKey (= tmuxSession) stays constant
// — a per-mount guard would re-inject a "--- restored ---" block on each
// toggle. Semantics: cold PWA launch / F5 reload re-executes the module → set
// empty → restore fires; an in-app SPA remount reuses the same module → key
// already marked → restore is skipped. sessionStorage would wrongly survive an
// F5 and block a legitimate restore, so a plain in-memory Set is used.
const restoredKeys = new Set<string>();

export function wasRestored(key: string): boolean {
  return restoredKeys.has(key);
}

export function markRestored(key: string): void {
  restoredKeys.add(key);
}
