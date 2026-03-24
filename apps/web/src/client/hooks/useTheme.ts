import { useState, useEffect, useRef } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { applyTheme as applyLibTheme } from '@/lib/theme';

type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';

function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (privacy mode, SSR)
  }
  return 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
  if (preference === 'dark') {
    return true;
  }
  if (preference === 'light') {
    return false;
  }
  try {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference);
  const [isDark, setIsDark] = useState(() => resolveIsDark(getStoredPreference()));
  // Guard: prevents async bootstrap from overwriting a user toggle that happened before it resolves
  const hasLocalOverrideRef = useRef(false);

  // Sync from Electron backend on mount and subscribe to host-driven changes
  useEffect(() => {
    const accomplish = getAccomplish();
    accomplish
      .getTheme()
      .then((theme) => {
        // Skip if the user already made a choice before this async call resolved
        if (hasLocalOverrideRef.current) return;
        if (theme === 'light' || theme === 'dark' || theme === 'system') {
          setPreference(theme);
          setIsDark(resolveIsDark(theme));
        }
      })
      .catch(() => {
        // fall back to locally stored preference
      });

    if (accomplish.onThemeChange) {
      const cleanup = accomplish.onThemeChange(({ theme, resolved }) => {
        if (theme === 'light' || theme === 'dark' || theme === 'system') {
          setPreference(theme);
        }
        setIsDark(resolved === 'dark');
      });
      return cleanup;
    }
    return undefined;
  }, []);

  // Follow OS theme changes when preference is 'system'
  useEffect(() => {
    if (preference !== 'system') {
      return undefined;
    }
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };
      mq.addEventListener('change', handler);
      return () => {
        mq.removeEventListener('change', handler);
      };
    } catch {
      return undefined;
    }
  }, [preference]);

  const setTheme = (newPreference: ThemePreference) => {
    hasLocalOverrideRef.current = true;
    setPreference(newPreference);
    setIsDark(resolveIsDark(newPreference));
    applyLibTheme(newPreference);
    getAccomplish()
      .setTheme(newPreference)
      .catch(() => {
        // ignore
      });
  };

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return { theme: preference, isDark, toggleTheme, setTheme };
}
