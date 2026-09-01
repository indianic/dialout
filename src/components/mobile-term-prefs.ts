// Per-device mobile terminal preferences (spec §12.1: font size 10–22px,
// persisted in localStorage, double-tap resets).

const FONT_KEY = 'devdash-mobile-fontsize';

export const MIN_FONT = 10;
export const MAX_FONT = 22;
export const DEFAULT_FONT = 13;

export function clampFont(px: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(px)));
}

export function getSavedFontSize(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT;
  try {
    const v = Number(window.localStorage.getItem(FONT_KEY));
    if (Number.isFinite(v) && v >= MIN_FONT && v <= MAX_FONT) return v;
  } catch {}
  return DEFAULT_FONT;
}

export function saveFontSize(px: number): void {
  try { window.localStorage.setItem(FONT_KEY, String(clampFont(px))); } catch {}
}

import { TERMINAL_THEMES, DEFAULT_THEME_ID } from './terminal-themes';
import { DEFAULT_ENABLED_KEYS } from './terminal-keys';

const THEME_KEY = 'devdash-terminal-theme';
const KEYS_KEY = 'devdash-terminal-keys';
const CURSOR_KEY = 'devdash-terminal-cursorblink';
const HAPTICS_KEY = 'devdash-terminal-haptics';
const HINT_KEY = 'devdash-fullscreen-hint-seen';

function isKnownTheme(id: string): boolean {
  return TERMINAL_THEMES.some((t) => t.id === id);
}

export function getSavedThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v && isKnownTheme(v)) return v;
  } catch {}
  return DEFAULT_THEME_ID;
}
export function saveThemeId(id: string): void {
  if (!isKnownTheme(id)) {
    try { window.localStorage.removeItem(THEME_KEY); } catch {}
    return;
  }
  try { window.localStorage.setItem(THEME_KEY, id); } catch {}
}

export function getSavedKeys(): Record<string, boolean> {
  if (typeof window === 'undefined') return { ...DEFAULT_ENABLED_KEYS };
  try {
    const raw = window.localStorage.getItem(KEYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_ENABLED_KEYS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_ENABLED_KEYS };
}
export function saveKeys(map: Record<string, boolean>): void {
  try { window.localStorage.setItem(KEYS_KEY, JSON.stringify(map)); } catch {}
}

export function getCursorBlink(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(CURSOR_KEY) !== 'false'; } catch { return true; }
}
export function saveCursorBlink(v: boolean): void {
  try { window.localStorage.setItem(CURSOR_KEY, String(v)); } catch {}
}

export function getHaptics(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(HAPTICS_KEY) !== 'false'; } catch { return true; }
}
export function saveHaptics(v: boolean): void {
  try { window.localStorage.setItem(HAPTICS_KEY, String(v)); } catch {}
}

export function getFullscreenHintSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(HINT_KEY) === 'true'; } catch { return true; }
}
export function setFullscreenHintSeen(): void {
  try { window.localStorage.setItem(HINT_KEY, 'true'); } catch {}
}

// Task 6: font-family choice. Curated list only — every entry below is a
// stack of fonts already available to the browser (JetBrains Mono is loaded
// app-wide via layout.tsx's Google Fonts <link>; the rest are OS-bundled
// monospace fonts). No web-font downloads are added for this feature.
//
// A "ligature-capable" entry was considered (JetBrains Mono does support
// ligatures) but xterm 5.3.0's ITerminalOptions has no `fontLigatures` flag
// at all — ligature rendering in xterm.js only exists via the separate
// @xterm/addon-ligatures package (not installed in this repo, and the task
// brief says not to add new addons). So this list stays plain font stacks;
// no ligature toggle is offered.
export interface TerminalFont {
  id: string;
  label: string;
  css: string;
}

export const TERMINAL_FONTS: TerminalFont[] = [
  // Matches the fontFamily xterm.js was hardcoded to before this feature
  // (Terminal.tsx) — kept first/default so behavior is unchanged out of the box.
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: "'JetBrains Mono', Menlo, Monaco, monospace" },
  { id: 'system-mono', label: 'System Monospace', css: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  { id: 'menlo-monaco', label: 'Menlo / Monaco', css: 'Menlo, Monaco, monospace' },
];

export const DEFAULT_FONT_FAMILY = TERMINAL_FONTS[0].css;

const FONTFAMILY_KEY = 'devdash-terminal-fontfamily';

function isKnownFontFamily(css: string): boolean {
  return TERMINAL_FONTS.some((f) => f.css === css);
}

export function getFontFamily(): string {
  if (typeof window === 'undefined') return DEFAULT_FONT_FAMILY;
  try {
    const v = window.localStorage.getItem(FONTFAMILY_KEY);
    if (v && isKnownFontFamily(v)) return v;
  } catch {}
  return DEFAULT_FONT_FAMILY;
}

export function saveFontFamily(css: string): void {
  if (!isKnownFontFamily(css)) {
    try { window.localStorage.removeItem(FONTFAMILY_KEY); } catch {}
    return;
  }
  try { window.localStorage.setItem(FONTFAMILY_KEY, css); } catch {}
}
