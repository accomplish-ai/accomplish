import type { Appearance } from '@accomplish/shared';
import { getAccomplish } from './accomplish';

const prefersDark = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const getMediaQuery = (): MediaQueryList | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)');
};

export const applyTheme = (appearance: Appearance) => {
  if (typeof document === 'undefined') {
    return;
  }

  const isDark = appearance === 'dark' || (appearance === 'system' && prefersDark());

  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
};

const handleSystemThemeChange = async () => {
  const accomplish = getAccomplish();
  const appearance = await accomplish.getAppearance();
  if (appearance === 'system') {
    applyTheme('system');
  }
};

export async function initializeTheme(): Promise<() => void> {
  const accomplish = getAccomplish();
  const appearance = await accomplish.getAppearance();
  applyTheme(appearance);

  const mediaQuery = getMediaQuery();
  if (!mediaQuery) {
    return () => undefined;
  }

  const listener = () => {
    void handleSystemThemeChange();
  };

  mediaQuery.addEventListener('change', listener);

  return () => {
    mediaQuery.removeEventListener('change', listener);
  };
}
