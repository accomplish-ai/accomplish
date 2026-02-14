/**
 * Unit tests for renderer i18n module
 *
 * Tests initialization, language changing, fallback when IPC is unavailable,
 * and document direction updates.
 *
 * Source: apps/desktop/src/renderer/i18n/index.ts
 *
 * @vitest-environment jsdom
 * @module __tests__/unit/renderer/i18n/index.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock window.accomplish.i18n API (provided by preload bridge)
const mockGetTranslations = vi.fn();
const mockSetLanguage = vi.fn();
const mockGetLanguage = vi.fn();
const mockGetResolvedLanguage = vi.fn();
const mockOnLanguageChange = vi.fn();

function setupWindowAPI() {
  (window as Record<string, unknown>).accomplish = {
    i18n: {
      getLanguage: mockGetLanguage.mockResolvedValue('en'),
      setLanguage: mockSetLanguage.mockResolvedValue(undefined),
      getTranslations: mockGetTranslations.mockResolvedValue({
        language: 'en',
        translations: {
          common: { key: 'value' },
          settings: { title: 'Settings' },
        },
      }),
      getSupportedLanguages: vi.fn().mockResolvedValue(['en', 'zh-CN']),
      getResolvedLanguage: mockGetResolvedLanguage.mockResolvedValue('en'),
      onLanguageChange: mockOnLanguageChange.mockReturnValue(() => {}),
    },
  };
}

function clearWindowAPI() {
  delete (window as Record<string, unknown>).accomplish;
}

async function getI18nModule() {
  const mod = await import('@/i18n');
  return mod;
}

describe('Renderer i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWindowAPI();
  });

  afterEach(() => {
    clearWindowAPI();
  });

  describe('constants', () => {
    it('should export supported languages', async () => {
      const { SUPPORTED_LANGUAGES } = await getI18nModule();
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('zh-CN');
    });

    it('should export all namespaces', async () => {
      const { NAMESPACES } = await getI18nModule();
      expect(NAMESPACES).toContain('common');
      expect(NAMESPACES).toContain('settings');
      expect(NAMESPACES).toContain('execution');
      expect(NAMESPACES).toContain('history');
      expect(NAMESPACES).toContain('home');
      expect(NAMESPACES).toContain('errors');
      expect(NAMESPACES).toContain('sidebar');
    });
  });

  describe('changeLanguage', () => {
    it('should call main process setLanguage when API available', async () => {
      setupWindowAPI();
      const { changeLanguage } = await getI18nModule();

      await changeLanguage('zh-CN');
      expect(mockSetLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should resolve auto to en when API not available', async () => {
      clearWindowAPI();
      const mod = await getI18nModule();

      await mod.changeLanguage('auto');
      expect(mod.default.language).toBe('en');
    });

    it('should change i18next language directly without API', async () => {
      clearWindowAPI();
      const mod = await getI18nModule();

      await mod.changeLanguage('zh-CN');
      expect(mod.default.language).toBe('zh-CN');

      // Reset
      await mod.changeLanguage('en');
    });

    it('should set document lang attribute', async () => {
      clearWindowAPI();
      const mod = await getI18nModule();

      await mod.changeLanguage('zh-CN');
      expect(document.documentElement.lang).toBe('zh-CN');

      // Reset
      await mod.changeLanguage('en');
    });
  });

  describe('getLanguagePreference', () => {
    it('should return language from main process when API available', async () => {
      setupWindowAPI();
      mockGetLanguage.mockResolvedValue('zh-CN');
      const { getLanguagePreference } = await getI18nModule();

      const result = await getLanguagePreference();
      expect(result).toBe('zh-CN');
    });

    it('should return auto when API not available', async () => {
      clearWindowAPI();
      const { getLanguagePreference } = await getI18nModule();

      const result = await getLanguagePreference();
      expect(result).toBe('auto');
    });
  });

  describe('i18n instance', () => {
    it('should export a default i18n instance', async () => {
      const mod = await getI18nModule();
      expect(mod.default).toBeDefined();
      expect(mod.default.t).toBeDefined();
    });

    it('should have English as fallback language', async () => {
      const mod = await getI18nModule();
      expect(mod.default.options.fallbackLng).toContain('en');
    });

    it('should have common as default namespace', async () => {
      const mod = await getI18nModule();
      expect(mod.default.options.defaultNS).toBe('common');
    });
  });
});
