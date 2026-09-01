'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
  cycle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  // Light is the default everywhere it is not explicitly asked otherwise:
  // the CSS :root block is the light palette, so anything else would render
  // one paint of the wrong theme before hydration catches up.
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('devdash-theme') as Theme | null;
    const t = saved && ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
    setThemeState(t);
    setResolved(resolveTheme(t));
  }, []);

  // Apply theme to <html> and listen for system changes
  useEffect(() => {
    const r = resolveTheme(theme);
    setResolved(r);
    document.documentElement.setAttribute('data-theme', r);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const sys = mq.matches ? 'dark' : 'light';
        setResolved(sys);
        document.documentElement.setAttribute('data-theme', sys);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('devdash-theme', t);
  }, []);

  const cycle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}
