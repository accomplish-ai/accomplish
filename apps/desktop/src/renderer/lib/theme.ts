import { getAccomplish } from './accomplish';

type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let themeChangeCleanup: (() => void) | null = null;

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyClass(resolved: 'light' | 'dark'): void {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function cleanupSystemListener(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaQuery = null;
    mediaListener = null;
  }
}

function setupSystemListener(): void {
  cleanupSystemListener();
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = (e: MediaQueryListEvent) => {
    applyClass(e.matches ? 'dark' : 'light');
  };
  mediaQuery.addEventListener('change', mediaListener);
}

export function applyTheme(preference: string): void {
  const validated = (['system', 'light', 'dark'].includes(preference)
    ? preference
    : 'system') as ThemePreference;

  localStorage.setItem(THEME_KEY, validated);

  const resolved = resolveTheme(validated);
  applyClass(resolved);

  if (validated === 'system') {
    setupSystemListener();
  } else {
    cleanupSystemListener();
  }
}

export function initTheme(): void {
  const accomplish = getAccomplish();

  accomplish.getTheme().then((preference) => {
    applyTheme(preference);
  });

  if (accomplish.onThemeChange) {
    themeChangeCleanup = accomplish.onThemeChange(({ theme }) => {
      applyTheme(theme);
    });
  }
}

export function cleanupTheme(): void {
  cleanupSystemListener();
  if (themeChangeCleanup) {
    themeChangeCleanup();
    themeChangeCleanup = null;
  }
}
