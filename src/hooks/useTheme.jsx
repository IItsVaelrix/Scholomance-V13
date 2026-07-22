import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Storage } from '../lib/platform/storage';

const ThemeContext = createContext(null);

/** Persistence key for IDE-only light/dark (sun/moon). App chrome stays dark. */
export const IDE_THEME_STORAGE_KEY = 'scholomance-ide-theme';

function getInitialIdeTheme() {
  try {
    // Prefer IDE-scoped key; migrate legacy global theme if present.
    const ideStored = Storage.getItem(IDE_THEME_STORAGE_KEY);
    if (ideStored === 'light' || ideStored === 'dark') return ideStored;
    const legacy = Storage.getItem('scholomance-theme');
    if (legacy === 'light' || legacy === 'dark') return legacy;
  } catch {
    // Ignore storage errors and fallback to default
  }
  return 'dark';
}

/**
 * IDE theme provider. Sun/moon toggles Read/IDE ritual skin only.
 * Document chrome stays on dark `data-theme` so Landing/nav/kits are unaffected.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialIdeTheme);

  useEffect(() => {
    // Keep global app chrome dark — light mode is IDE-scoped via React context
    // and `--ritual-*` injection on `.ide-layout-wrapper`.
    document.documentElement.setAttribute('data-theme', 'dark');
    Storage.setItem(IDE_THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, scope: 'ide' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return { theme: 'dark', toggleTheme: () => {}, scope: 'ide' };
  }
  return context;
}
