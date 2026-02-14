/**
 * Unit tests for main process i18n module
 *
 * Source: apps/desktop/src/main/i18n/index.ts
 *
 * @module __tests__/unit/main/i18n/index.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// Mock electron — i18n uses app.getAppPath() for locale files and app.getLocale() for system language
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/mock/desktop'),
    getLocale: vi.fn(() => 'en-US'),
  },
}));

// Mock fs — translations are loaded synchronously from JSON files on disk
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

import { app } from 'electron';
import {
  initializeI18n,
  getLanguage,
  setLanguage,
  t,
  getTranslations,
  getAllTranslations,
  clearTranslationCache,
  SUPPORTED_LANGUAGES,
  NAMESPACES,
} from '@main/i18n';

/**
 * Helper: set up fs mocks so multiple locale files can be "read" by the i18n module.
 */
function mockMultipleLocaleFiles(files: Array<{ lang: string; ns: string; data: Record<string, unknown> }>) {
  const fileMap = new Map<string, string>();
  for (const { lang, ns, data } of files) {
    fileMap.set(path.join('/mock/desktop', 'locales', lang, `${ns}.json`), JSON.stringify(data));
  }

  mockExistsSync.mockImplementation((p: string) => fileMap.has(p));
  mockReadFileSync.mockImplementation((p: string) => {
    const content = fileMap.get(p);
    if (content) { return content; }
    throw new Error(`ENOENT: ${p}`);
  });
}

describe('Main Process i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTranslationCache();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    initializeI18n('en');
  });

  describe('constants', () => {
    it('should list exactly en and zh-CN', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
      expect(SUPPORTED_LANGUAGES).toContain('zh-CN');
      expect(SUPPORTED_LANGUAGES).toHaveLength(2);
    });

    it('should list all 7 namespaces', () => {
      expect(NAMESPACES).toEqual([
        'common', 'home', 'execution', 'settings', 'history', 'errors', 'sidebar',
      ]);
    });
  });

  describe('initializeI18n', () => {
    it('should use valid stored preference zh-CN', () => {
      initializeI18n('zh-CN');
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should use valid stored preference en', () => {
      initializeI18n('en');
      expect(getLanguage()).toBe('en');
    });

    it('should ignore invalid stored value and detect system locale', () => {
      (app.getLocale as ReturnType<typeof vi.fn>).mockReturnValue('en-US');
      initializeI18n('invalid-lang');
      expect(getLanguage()).toBe('en');
    });

    it('should detect zh-CN system locale', () => {
      (app.getLocale as ReturnType<typeof vi.fn>).mockReturnValue('zh-CN');
      initializeI18n(null);
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should map zh-TW to zh-CN', () => {
      (app.getLocale as ReturnType<typeof vi.fn>).mockReturnValue('zh-TW');
      initializeI18n(null);
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should default to en for non-Chinese locale', () => {
      (app.getLocale as ReturnType<typeof vi.fn>).mockReturnValue('fr-FR');
      initializeI18n(null);
      expect(getLanguage()).toBe('en');
    });

    it('should default to en for unsupported Japanese locale', () => {
      (app.getLocale as ReturnType<typeof vi.fn>).mockReturnValue('ja-JP');
      initializeI18n(null);
      expect(getLanguage()).toBe('en');
    });
  });

  describe('setLanguage', () => {
    it('should update active language to zh-CN', () => {
      setLanguage('zh-CN');
      expect(getLanguage()).toBe('zh-CN');
    });

    it('should ignore unsupported language codes', () => {
      setLanguage('en');
      // @ts-expect-error testing invalid input at runtime
      setLanguage('fr-FR');
      expect(getLanguage()).toBe('en');
    });
  });

  describe('t() — namespace parsing', () => {
    it('should default to common namespace', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { greeting: 'Hello' } },
      ]);
      initializeI18n('en');

      expect(t('greeting')).toBe('Hello');
    });

    it('should split on ":" to extract namespace', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'errors', data: { timeout: 'Request timed out' } },
      ]);
      initializeI18n('en');

      expect(t('errors:timeout')).toBe('Request timed out');
    });

    it('should combine namespace with dot-notation key', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'errors', data: { api: { timeout: 'API timed out' } } },
      ]);
      initializeI18n('en');

      expect(t('errors:api.timeout')).toBe('API timed out');
    });

    it('should return raw key for unrecognized namespace prefix', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { key: 'from common' } },
      ]);
      initializeI18n('en');

      expect(t('nonexistent:key')).toBe('nonexistent:key');
    });
  });

  describe('t() — nested key resolution', () => {
    beforeEach(() => {
      mockMultipleLocaleFiles([
        {
          lang: 'en', ns: 'common', data: {
            simple: 'Simple value',
            level1: {
              level2: {
                level3: 'Deep value',
              },
            },
            obj: { not: { a: { string: { deep: 42 } } } },
          },
        },
      ]);
      initializeI18n('en');
    });

    it('should resolve a flat top-level key', () => {
      expect(t('simple')).toBe('Simple value');
    });

    it('should walk 3 levels deep', () => {
      expect(t('level1.level2.level3')).toBe('Deep value');
    });

    it('should return raw key when path leads nowhere', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should return raw key when leaf is not a string', () => {
      expect(t('obj.not.a.string.deep')).toBe('obj.not.a.string.deep');
    });

    it('should return raw key when intermediate segment is missing', () => {
      expect(t('level1.missing.key')).toBe('level1.missing.key');
    });
  });

  describe('t() — interpolation', () => {
    beforeEach(() => {
      mockMultipleLocaleFiles([
        {
          lang: 'en', ns: 'common', data: {
            hello: 'Hello {{name}}',
            count: '{{count}} items',
            multi: '{{a}} and {{b}}',
            noVar: 'No variables here',
            partial: 'Hello {{name}}, you have {{count}} messages',
          },
        },
      ]);
      initializeI18n('en');
    });

    it('should replace a single placeholder', () => {
      expect(t('hello', { name: 'World' })).toBe('Hello World');
    });

    it('should coerce numeric values to strings', () => {
      expect(t('count', { count: 42 })).toBe('42 items');
    });

    it('should replace multiple placeholders', () => {
      expect(t('multi', { a: 'X', b: 'Y' })).toBe('X and Y');
    });

    it('should leave placeholder when variable is missing', () => {
      expect(t('hello', {})).toBe('Hello {{name}}');
    });

    it('should return string unchanged with no variables', () => {
      expect(t('noVar')).toBe('No variables here');
    });

    it('should replace only provided variables', () => {
      expect(t('partial', { name: 'Alice' })).toBe('Hello Alice, you have {{count}} messages');
    });

    it('should treat 0 as a valid value', () => {
      expect(t('count', { count: 0 })).toBe('0 items');
    });
  });

  describe('t() — English fallback', () => {
    it('should fall back to English when key missing from zh-CN', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { exists: 'English value' } },
        { lang: 'zh-CN', ns: 'common', data: {} },
      ]);
      initializeI18n('zh-CN');

      expect(t('exists')).toBe('English value');
    });

    it('should prefer Chinese value when present', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { greeting: 'Hello' } },
        { lang: 'zh-CN', ns: 'common', data: { greeting: '你好' } },
      ]);
      initializeI18n('zh-CN');

      expect(t('greeting')).toBe('你好');
    });

    it('should return raw key when missing from both languages', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: {} },
        { lang: 'zh-CN', ns: 'common', data: {} },
      ]);
      initializeI18n('zh-CN');

      expect(t('nonexistent')).toBe('nonexistent');
    });

    it('should not attempt redundant fallback when already English', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: {} },
      ]);
      initializeI18n('en');

      expect(t('missing')).toBe('missing');
    });
  });

  describe('caching', () => {
    it('should read locale file from disk only once', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { key: 'value' } },
      ]);
      initializeI18n('en');

      expect(t('key')).toBe('value');
      expect(t('key')).toBe('value');

      const commonCalls = mockReadFileSync.mock.calls.filter(
        (call) => (call[0] as string).includes('common.json')
      );
      expect(commonCalls).toHaveLength(1);
    });

    it('should re-read after clearTranslationCache()', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { key: 'value' } },
      ]);
      initializeI18n('en');

      t('key');
      clearTranslationCache();
      t('key');

      const commonCalls = mockReadFileSync.mock.calls.filter(
        (call) => (call[0] as string).includes('common.json')
      );
      expect(commonCalls).toHaveLength(2);
    });
  });

  describe('getTranslations', () => {
    it('should return full JSON object for a namespace', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'settings', data: { title: 'Settings' } },
      ]);

      const result = getTranslations('en', 'settings');
      expect(result).toEqual({ title: 'Settings' });
    });

    it('should return empty object when file does not exist', () => {
      const result = getTranslations('en', 'settings');
      expect(result).toEqual({});
    });
  });

  describe('getAllTranslations', () => {
    it('should return all namespaces, empty for missing files', () => {
      mockMultipleLocaleFiles([
        { lang: 'en', ns: 'common', data: { key: 'common' } },
        { lang: 'en', ns: 'settings', data: { key: 'settings' } },
      ]);

      const result = getAllTranslations('en');
      expect(result.common).toEqual({ key: 'common' });
      expect(result.settings).toEqual({ key: 'settings' });
      expect(result.home).toEqual({});
    });
  });
});
