import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '@/hooks/useTheme';

// Mock lib/theme so we can track applyTheme calls without the real DOM/IPC side effects
vi.mock('@/lib/theme', () => ({
  applyTheme: vi.fn(),
  initTheme: vi.fn(),
  cleanupTheme: vi.fn(),
}));

// Mock getAccomplish
const mockGetTheme = vi.fn(() => Promise.resolve('system'));
const mockSetTheme = vi.fn(() => Promise.resolve());
const mockOnThemeChange = vi.fn(() => () => {});

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    getTheme: mockGetTheme,
    setTheme: mockSetTheme,
    onThemeChange: mockOnThemeChange,
  }),
}));

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// A helper to set up matchMedia so we can toggle system preference in tests.
function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mql = {
    matches: prefersDark,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners.push(fn);
    },
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) {
        listeners.splice(idx, 1);
      }
    },
    _changeMatches: (newVal: boolean) => {
      (mql as { matches: boolean }).matches = newVal;
      listeners.forEach((fn) => {
        fn({ matches: newVal } as MediaQueryListEvent);
      });
    },
  };
  vi.stubGlobal('matchMedia', (_query: string) => mql);
  return mql;
}

describe('useTheme hook', () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    document.documentElement.classList.remove('dark');
    mockGetTheme.mockResolvedValue('system');
    mockSetTheme.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Flush async effects (e.g. accomplish.getTheme().then()) so state updates
  // triggered by resolved promises are wrapped in act().
  async function renderThemeHook() {
    const hook = renderHook(() => useTheme());
    await act(async () => {});
    return hook;
  }

  describe('initial theme detection', () => {
    it('should default isDark=false when no saved preference and system is light', async () => {
      mockMatchMedia(false);

      const { result } = await renderThemeHook();

      expect(result.current.isDark).toBe(false);
      expect(result.current.theme).toBe('system');
    });

    it('should default isDark=true when no saved preference and system is dark', async () => {
      mockMatchMedia(true);

      const { result } = await renderThemeHook();

      expect(result.current.isDark).toBe(true);
      expect(result.current.theme).toBe('system');
    });

    it('should use saved light preference over system dark preference', async () => {
      mockMatchMedia(true);
      mockGetTheme.mockResolvedValue('light');
      localStorageMock.setItem('theme', 'light');

      const { result } = await renderThemeHook();

      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it('should use saved dark preference over system light preference', async () => {
      mockMatchMedia(false);
      mockGetTheme.mockResolvedValue('dark');
      localStorageMock.setItem('theme', 'dark');

      const { result } = await renderThemeHook();

      expect(result.current.theme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });
  });

  describe('toggleTheme()', () => {
    it('should switch from light to dark (isDark=false → isDark=true)', async () => {
      mockMatchMedia(false);

      const { result } = await renderThemeHook();
      expect(result.current.isDark).toBe(false);

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.isDark).toBe(true);
      expect(result.current.theme).toBe('dark');
    });

    it('should switch from dark to light (isDark=true → isDark=false)', async () => {
      mockMatchMedia(true);

      const { result } = await renderThemeHook();
      expect(result.current.isDark).toBe(true);

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.isDark).toBe(false);
      expect(result.current.theme).toBe('light');
    });

    it('should call accomplish.setTheme with the new preference after toggle', async () => {
      mockMatchMedia(false);

      const { result } = await renderThemeHook();

      await act(async () => {
        result.current.toggleTheme();
      });

      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  describe('setTheme()', () => {
    it('should set explicit system preference', async () => {
      mockMatchMedia(false);

      const { result } = await renderThemeHook();

      await act(async () => {
        result.current.setTheme('system');
      });

      expect(result.current.theme).toBe('system');
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  describe('system preference changes', () => {
    it('should react to OS dark mode change when preference is system', async () => {
      const mql = mockMatchMedia(false);

      const { result } = await renderThemeHook();
      expect(result.current.isDark).toBe(false);

      act(() => {
        mql._changeMatches(true);
      });

      expect(result.current.isDark).toBe(true);
    });

    it('should ignore OS changes after user sets an explicit light/dark preference', async () => {
      const mql = mockMatchMedia(false);

      const { result } = await renderThemeHook();

      act(() => {
        result.current.toggleTheme(); // user chose dark
      });

      act(() => {
        mql._changeMatches(false); // system goes back to light
      });

      // Should still be dark because user made an explicit choice
      expect(result.current.isDark).toBe(true);
    });
  });
});
