'use client';

import { useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { TERMINAL_THEMES } from './terminal-themes';
import { MIN_FONT, MAX_FONT, DEFAULT_FONT, clampFont, TERMINAL_FONTS } from './mobile-term-prefs';
import { KEY_CHIPS } from './terminal-keys';

interface TerminalSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 'sheet' (default) = mobile bottom sheet, unchanged. 'panel' = desktop
   *  top-right popover restyle (same sections/a11y/focus-trap; haptics row
   *  omitted since haptics is mobile-only). */
  variant?: 'sheet' | 'panel';
  fontSize: number;
  onFontSize: (px: number) => void; // live-apply + persist handled by parent
  themeId: string;
  onThemeId: (id: string) => void;
  fontFamily: string; // current css font-family value (live-apply + persist handled by parent)
  onFontFamily: (css: string) => void;
  enabledKeys: Record<string, boolean>;
  onToggleKey: (id: string, on: boolean) => void;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  wakeOn: boolean;
  onToggleWake: () => void;
  cursorBlink: boolean;
  onToggleCursorBlink: (v: boolean) => void;
  haptics: boolean;
  onToggleHaptics: (v: boolean) => void;
}

// Label chips shown in the settings drawer (mockup image 3) — excludes the
// ctrl-<letter> power chips and paste, which aren't user-toggleable here.
const SETTINGS_KEY_IDS = [
  'esc', 'tab', 'ctrl',
  'up', 'down', 'left', 'right',
  'pipe', 'slash', 'tilde', 'dash',
  'home', 'end', 'pgup', 'pgdn',
];

// Selects a near-black or near-white label color from the theme card's own
// background luminance, rather than trusting each theme's `foreground`
// (which can fail AA against its own `background` — e.g. Solarized Light's
// #657b83 on #fdf6e3 is ~4.1:1). Standard WCAG relative-luminance formula.
function relativeLuminance(color: string): number {
  let r = 0, g = 0, b = 0;
  const rgbMatch = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbMatch) {
    r = Number(rgbMatch[1]);
    g = Number(rgbMatch[2]);
    b = Number(rgbMatch[3]);
  } else {
    const hex = color.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    r = parseInt(full.slice(0, 2), 16) || 0;
    g = parseInt(full.slice(2, 4), 16) || 0;
    b = parseInt(full.slice(4, 6), 16) || 0;
  }
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function themeLabelColor(background: string): string {
  return relativeLuminance(background) > 0.45 ? '#0b0b0f' : '#f5f5f7';
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function TerminalSettingsDrawer(props: TerminalSettingsDrawerProps) {
  const { open, onClose, variant = 'sheet' } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Font-family radiogroup: roving-tabindex refs for WAI-ARIA radio-pattern
  // arrow-key nav (Task 9 a11y fix #4).
  const fontFamilyRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Initial focus: move focus into the sheet when it opens.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  // Escape to close + Tab/Shift+Tab focus trap within the sheet.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !sheet.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !sheet.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const swatch = (t: (typeof TERMINAL_THEMES)[number]) =>
    [t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan];

  const settingsKeys = SETTINGS_KEY_IDS
    .map((id) => KEY_CHIPS.find((k) => k.id === id))
    .filter((k): k is (typeof KEY_CHIPS)[number] => !!k);

  // WAI-ARIA radio-pattern keyboard nav for the font-family list: arrow
  // keys move focus AND selection among the options (Home/End jump to the
  // first/last); roving tabIndex below gives the group a single tab stop.
  const onFontFamilyKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const count = TERMINAL_FONTS.length;
    let nextIdx: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (idx + 1) % count;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (idx - 1 + count) % count;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = count - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    props.onFontFamily(TERMINAL_FONTS[nextIdx].css);
    fontFamilyRefs.current[nextIdx]?.focus();
  };

  return (
    <div className={`devdash-tsd-root${variant === 'panel' ? ' panel' : ''}`} role="dialog" aria-modal="true" aria-label="Terminal settings">
      <div className="devdash-tsd-backdrop" onClick={props.onClose} />
      <div className="devdash-tsd-sheet" ref={sheetRef} tabIndex={-1}>
        <div className="devdash-tsd-handle" />
        <div className="devdash-tsd-head">
          <span>Terminal settings</span>
          <button className="devdash-tsd-x" aria-label="Close" onClick={props.onClose} ref={closeBtnRef}>
            <X size={18} />
          </button>
        </div>

        <div className="devdash-tsd-body">
          {/* FONT SIZE */}
          <section className="devdash-tsd-section">
            <h3 className="devdash-tsd-section-title">Font size</h3>
            <div className="devdash-tsd-font-row">
              <button
                type="button"
                className="devdash-tsd-font-btn"
                aria-label="Decrease font size"
                disabled={props.fontSize <= MIN_FONT}
                onClick={() => props.onFontSize(clampFont(props.fontSize - 1))}
              >
                −
              </button>
              <input
                type="range"
                className="devdash-tsd-font-slider"
                min={MIN_FONT}
                max={MAX_FONT}
                step={1}
                value={props.fontSize}
                aria-label="Font size"
                aria-valuemin={MIN_FONT}
                aria-valuemax={MAX_FONT}
                aria-valuenow={props.fontSize}
                onChange={(e) => props.onFontSize(clampFont(Number(e.target.value)))}
              />
              <button
                type="button"
                className="devdash-tsd-font-btn"
                aria-label="Increase font size"
                disabled={props.fontSize >= MAX_FONT}
                onClick={() => props.onFontSize(clampFont(props.fontSize + 1))}
              >
                +
              </button>
              <span className="devdash-tsd-font-value" aria-live="polite">{props.fontSize}px</span>
              <button
                type="button"
                className="devdash-tsd-font-reset"
                aria-label="Reset font size to default"
                onClick={() => props.onFontSize(DEFAULT_FONT)}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </section>

          {/* FONT FAMILY */}
          <section className="devdash-tsd-section">
            <h3 className="devdash-tsd-section-title">Font family</h3>
            <div className="devdash-tsd-fontfamily-list" role="radiogroup" aria-label="Font family">
              {TERMINAL_FONTS.map((f, idx) => {
                const active = f.css === props.fontFamily;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    ref={(el) => { fontFamilyRefs.current[idx] = el; }}
                    className={`devdash-tsd-fontfamily-item${active ? ' active' : ''}`}
                    style={{ fontFamily: f.css }}
                    onClick={() => props.onFontFamily(f.css)}
                    onKeyDown={(e) => onFontFamilyKeyDown(e, idx)}
                  >
                    <span className="devdash-tsd-fontfamily-label">{f.label}</span>
                    {active && <span className="devdash-tsd-fontfamily-check" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* THEME */}
          <section className="devdash-tsd-section">
            <h3 className="devdash-tsd-section-title">Theme</h3>
            <div className="devdash-tsd-theme-grid">
              {TERMINAL_THEMES.map((t) => {
                const active = t.id === props.themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`devdash-tsd-theme-card${active ? ' active' : ''}`}
                    style={{ background: t.background }}
                    aria-pressed={active}
                    onClick={() => props.onThemeId(t.id)}
                  >
                    <div className="devdash-tsd-theme-head">
                      <span className="devdash-tsd-theme-name" style={{ color: themeLabelColor(t.background) }}>
                        {t.name}
                      </span>
                      {active && <span className="devdash-tsd-theme-check" aria-hidden="true">✓</span>}
                    </div>
                    <div className="devdash-tsd-theme-swatches">
                      {swatch(t).map((color, i) => (
                        <span
                          key={i}
                          className="devdash-tsd-swatch"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* KEYBOARD KEYS */}
          <section className="devdash-tsd-section">
            <h3 className="devdash-tsd-section-title">Keyboard keys</h3>
            <div className="devdash-tsd-key-list">
              {settingsKeys.map((k) => {
                const on = !!props.enabledKeys[k.id];
                return (
                  <label key={k.id} className="devdash-tsd-key-row">
                    <span className="devdash-tsd-key-label">{k.label}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={on}
                      checked={on}
                      onChange={(e) => props.onToggleKey(k.id, e.target.checked)}
                      aria-label={`Show ${k.label} key`}
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {/* SCREEN */}
          <section className="devdash-tsd-section">
            <h3 className="devdash-tsd-section-title">Screen</h3>
            <div className="devdash-tsd-toggle-list">
              <label className="devdash-tsd-toggle-row">
                <div className="devdash-tsd-toggle-text">
                  <span className="devdash-tsd-toggle-label">Fullscreen</span>
                  {!props.fullscreenSupported && (
                    <span className="devdash-tsd-toggle-note">
                      Not supported on this browser — Add to Home Screen
                    </span>
                  )}
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={props.isFullscreen}
                  checked={props.isFullscreen}
                  disabled={!props.fullscreenSupported}
                  onChange={() => props.onToggleFullscreen()}
                  aria-label="Fullscreen"
                />
              </label>

              <label className="devdash-tsd-toggle-row">
                <div className="devdash-tsd-toggle-text">
                  <span className="devdash-tsd-toggle-label">Keep screen awake</span>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={props.wakeOn}
                  checked={props.wakeOn}
                  onChange={() => props.onToggleWake()}
                  aria-label="Keep screen awake"
                />
              </label>

              <label className="devdash-tsd-toggle-row">
                <div className="devdash-tsd-toggle-text">
                  <span className="devdash-tsd-toggle-label">Cursor blink</span>
                </div>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={props.cursorBlink}
                  checked={props.cursorBlink}
                  onChange={(e) => props.onToggleCursorBlink(e.target.checked)}
                  aria-label="Cursor blink"
                />
              </label>

              {/* Haptics is a touch-only affordance — omitted from the
                  desktop panel variant (Task 10). */}
              {variant !== 'panel' && (
                <label className="devdash-tsd-toggle-row">
                  <div className="devdash-tsd-toggle-text">
                    <span className="devdash-tsd-toggle-label">Haptics</span>
                  </div>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={props.haptics}
                    checked={props.haptics}
                    onChange={(e) => props.onToggleHaptics(e.target.checked)}
                    aria-label="Haptics"
                  />
                </label>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
