import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Design = 'editorial' | 'focus';
export type Theme = 'light' | 'dark';

export const DESIGNS: { id: Design; label: string; glyph: string }[] = [
  { id: 'editorial', label: 'Editorial', glyph: '\u{1F4D6}' },
  { id: 'focus', label: 'Focus', glyph: '\u{1F9ED}' },
];

export const DEFAULT_DESIGN: Design = 'focus';

// These keys and the defaults are duplicated in the inline script in index.html,
// which applies them before first paint to avoid a flash of the wrong design.
const DESIGN_KEY = 'vocab-builder-design';
const THEME_KEY = 'vocab-builder-theme';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit only.
  }
}

function isDesign(value: string | null): value is Design {
  return DESIGNS.some(d => d.id === value);
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialDesign(): Design {
  const stored = readStored(DESIGN_KEY);
  return isDesign(stored) ? stored : DEFAULT_DESIGN;
}

function initialTheme(): Theme {
  const stored = readStored(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

interface Appearance {
  design: Design;
  theme: Theme;
  setDesign: (design: Design) => void;
  toggleTheme: () => void;
}

const AppearanceContext = createContext<Appearance | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [design, setDesignState] = useState<Design>(initialDesign);
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.design = design;
  }, [design]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Follow the system theme until the user makes an explicit choice
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(e: MediaQueryListEvent) {
      if (readStored(THEME_KEY) === null) setThemeState(e.matches ? 'dark' : 'light');
    }
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setDesign = useCallback((next: Design) => {
    setDesignState(next);
    writeStored(DESIGN_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    writeStored(THEME_KEY, next);
  }, [theme]);

  const value = useMemo(
    () => ({ design, theme, setDesign, toggleTheme }),
    [design, theme, setDesign, toggleTheme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): Appearance {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used within AppearanceProvider');
  return context;
}
