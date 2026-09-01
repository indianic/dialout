import React, { createContext, useContext, useMemo } from 'react';
import { Appearance } from 'react-native';
import { light, dark, type Tokens } from './tokens';
import { usePrefs } from '../store/prefs';

const Ctx = createContext<Tokens>(light);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themePref = usePrefs((s) => s.themePref);
  const scheme = Appearance.getColorScheme();
  const tokens = useMemo(() => {
    const resolved = themePref === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : themePref;
    return resolved === 'dark' ? dark : light;
  }, [themePref, scheme]);
  return <Ctx.Provider value={tokens}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
