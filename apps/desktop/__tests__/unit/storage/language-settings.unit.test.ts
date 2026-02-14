/**
 * Unit tests for language settings storage
 *
 * Tests getLanguage/setLanguage in the appSettings repository,
 * including validation, round-trip persistence, and fallback behavior.
 *
 * @module __tests__/unit/storage/language-settings.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3
const mockGet = vi.fn();
const mockRun = vi.fn();
const mockPrepare = vi.fn(() => ({
  get: mockGet,
  run: mockRun,
}));

vi.mock('better-sqlite3', () => {
  class MockDatabase {
    pragma = vi.fn().mockReturnThis();
    prepare = mockPrepare;
    exec = vi.fn();
    transaction = vi.fn((fn: () => unknown) => () => fn());
    close = vi.fn();
  }
  return { default: MockDatabase };
});

vi.mock('@accomplish_ai/agent-core/storage/database', () => ({
  getDatabase: vi.fn(() => ({ prepare: mockPrepare })),
}));

function setAppSettingsRow(overrides: Record<string, unknown> = {}) {
  mockGet.mockReturnValue({
    id: 1,
    debug_mode: 0,
    onboarding_complete: 1,
    selected_model: null,
    ollama_config: null,
    litellm_config: null,
    azure_foundry_config: null,
    language: 'auto',
    lmstudio_config: null,
    openai_base_url: null,
    theme: 'system',
    ...overrides,
  });
}

import {
  getLanguage,
  setLanguage,
  type UILanguage,
} from '@accomplish_ai/agent-core';

describe('Language Settings Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppSettingsRow();
  });

  describe('getLanguage', () => {
    it('should return "auto" as default', () => {
      setAppSettingsRow({ language: 'auto' });
      expect(getLanguage()).toBe('auto');
    });

    it('should return "en" when stored as en', () => {
      setAppSettingsRow({ language: 'en' });
      expect(getLanguage()).toBe('en');
    });

    it('should return "zh-CN" when stored as zh-CN', () => {
      setAppSettingsRow({ language: 'zh-CN' });
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should fall back to "auto" for invalid value', () => {
      setAppSettingsRow({ language: 'invalid' });
      expect(getLanguage()).toBe('auto');
    });

    it('should fall back to "auto" for empty string', () => {
      setAppSettingsRow({ language: '' });
      expect(getLanguage()).toBe('auto');
    });
  });

  describe('setLanguage', () => {
    it('should execute UPDATE SQL with language value', () => {
      setLanguage('zh-CN');
      expect(mockPrepare).toHaveBeenCalledWith(
        'UPDATE app_settings SET language = ? WHERE id = 1'
      );
      expect(mockRun).toHaveBeenCalledWith('zh-CN');
    });

    it('should persist "en"', () => {
      setLanguage('en');
      expect(mockRun).toHaveBeenCalledWith('en');
    });

    it('should persist "auto"', () => {
      setLanguage('auto');
      expect(mockRun).toHaveBeenCalledWith('auto');
    });
  });

  describe('round-trip', () => {
    it('should read back "en" after setting', () => {
      setLanguage('en');
      setAppSettingsRow({ language: 'en' });
      expect(getLanguage()).toBe('en');
    });

    it('should read back "zh-CN" after setting', () => {
      setLanguage('zh-CN');
      setAppSettingsRow({ language: 'zh-CN' });
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should read back "auto" after setting', () => {
      setLanguage('auto');
      setAppSettingsRow({ language: 'auto' });
      expect(getLanguage()).toBe('auto');
    });
  });

  describe('UILanguage type coverage', () => {
    const validLanguages: UILanguage[] = ['en', 'zh-CN', 'auto'];

    for (const lang of validLanguages) {
      it(`should accept "${lang}" as valid UILanguage`, () => {
        setAppSettingsRow({ language: lang });
        expect(getLanguage()).toBe(lang);
      });
    }
  });
});
