import { create } from 'zustand';
import { Appearance } from 'react-native';
import { storageGet, storageSet } from '../storage';

export type ThemePref = 'system' | 'light' | 'dark';

const THEME_KEY = 'devdash-theme';
const KEYS_KEY = 'devdash-ai-function-keys';
const INTRO_KEY = 'devdash-intro-seen';

interface PrefsState {
  ready: boolean;
  themePref: ThemePref;
  keysVisible: boolean;
  introSeen: boolean;
  hydrate: () => Promise<void>;
  setThemePref: (p: ThemePref) => Promise<void>;
  setKeysVisible: (on: boolean) => Promise<void>;
  markIntroSeen: () => Promise<void>;
  resolved: () => 'light' | 'dark';
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ready: false,
  themePref: 'system',
  keysVisible: false,
  introSeen: false,
  hydrate: async () => {
    try {
      const [theme, keys, intro] = await Promise.all([
        storageGet(THEME_KEY),
        storageGet(KEYS_KEY),
        storageGet(INTRO_KEY),
      ]);
      set({
        ready: true,
        themePref: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
        keysVisible: keys === '1',
        introSeen: intro === '1',
      });
    } catch {
      set({ ready: true });
    }
  },
  setThemePref: async (p) => {
    set({ themePref: p });
    await storageSet(THEME_KEY, p);
  },
  setKeysVisible: async (on) => {
    set({ keysVisible: on });
    await storageSet(KEYS_KEY, on ? '1' : '0');
  },
  markIntroSeen: async () => {
    set({ introSeen: true });
    await storageSet(INTRO_KEY, '1');
  },
  resolved: () => {
    const p = get().themePref;
    if (p === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
    return p;
  },
}));
