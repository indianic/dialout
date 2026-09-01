import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_THEME_ID } from '../../components/terminal-themes';
import {
  getSavedThemeId, saveThemeId, getSavedKeys, saveKeys,
  getCursorBlink, saveCursorBlink, getFullscreenHintSeen, setFullscreenHintSeen,
  getFontFamily, saveFontFamily, DEFAULT_FONT_FAMILY, TERMINAL_FONTS,
} from '../../components/mobile-term-prefs';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  });
});

describe('terminal-prefs', () => {
  it('theme id defaults and round-trips, rejects unknown ids', () => {
    expect(getSavedThemeId()).toBe(DEFAULT_THEME_ID);
    saveThemeId('dracula');
    expect(getSavedThemeId()).toBe('dracula');
    saveThemeId('not-a-theme');
    expect(getSavedThemeId()).toBe(DEFAULT_THEME_ID); // invalid rejected on read/write
  });

  it('keys default to the default-enabled set and round-trip', () => {
    const def = getSavedKeys();
    expect(typeof def).toBe('object');
    expect(def.esc).toBe(true);
    saveKeys({ ...def, esc: false });
    expect(getSavedKeys().esc).toBe(false);
  });

  it('cursor blink defaults true and round-trips', () => {
    expect(getCursorBlink()).toBe(true);
    saveCursorBlink(false);
    expect(getCursorBlink()).toBe(false);
  });

  it('fullscreen hint is one-shot', () => {
    expect(getFullscreenHintSeen()).toBe(false);
    setFullscreenHintSeen();
    expect(getFullscreenHintSeen()).toBe(true);
  });

  it('corrupt localStorage falls back safely', () => {
    window.localStorage.setItem('devdash-terminal-keys', '{bad json');
    expect(getSavedKeys().esc).toBe(true); // no throw, defaults
  });

  it('font family defaults to the current xterm default and round-trips', () => {
    expect(DEFAULT_FONT_FAMILY).toBe(TERMINAL_FONTS[0].css);
    expect(getFontFamily()).toBe(DEFAULT_FONT_FAMILY);
    const other = TERMINAL_FONTS[1].css;
    saveFontFamily(other);
    expect(getFontFamily()).toBe(other);
  });

  it('font family rejects an unknown/invalid saved value', () => {
    saveFontFamily(TERMINAL_FONTS[1].css);
    expect(getFontFamily()).toBe(TERMINAL_FONTS[1].css);
    saveFontFamily('Comic Sans MS, cursive'); // not in the curated list
    expect(getFontFamily()).toBe(DEFAULT_FONT_FAMILY); // invalid rejected on write
    window.localStorage.setItem('devdash-terminal-fontfamily', 'not-a-real-font');
    expect(getFontFamily()).toBe(DEFAULT_FONT_FAMILY); // invalid rejected on read
  });

  it('font family survives a corrupt localStorage getItem', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('boom'); },
        setItem: (k: string, v: string) => {},
        removeItem: (k: string) => {},
      },
    });
    expect(getFontFamily()).toBe(DEFAULT_FONT_FAMILY); // no throw, defaults
  });
});
