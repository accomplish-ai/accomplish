/**
 * Unit tests for locale file key parity
 *
 * Reads actual JSON locale files from disk and validates structural consistency:
 * file existence, valid JSON, key parity between EN and zh-CN, and interpolation
 * variable parity.
 *
 * Source: apps/desktop/locales/{en,zh-CN}/*.json
 *
 * @module __tests__/unit/i18n/locale-parity.unit.test
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.resolve(__dirname, '../../../locales');
const NAMESPACES = ['common', 'errors', 'execution', 'history', 'home', 'settings', 'sidebar'];
const LANGUAGES = ['en', 'zh-CN'];

/** Recursively extract all leaf key paths from a nested object (e.g. "level1.level2.leaf"). */
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function loadLocaleFile(language: string, namespace: string): Record<string, unknown> {
  const filePath = path.join(LOCALES_DIR, language, `${namespace}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

describe('Locale file parity', () => {
  describe('file existence', () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        it(`should have ${lang}/${ns}.json`, () => {
          const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
          expect(fs.existsSync(filePath)).toBe(true);
        });
      }
    }
  });

  describe('valid JSON', () => {
    for (const lang of LANGUAGES) {
      for (const ns of NAMESPACES) {
        it(`${lang}/${ns}.json should be valid JSON`, () => {
          const filePath = path.join(LOCALES_DIR, lang, `${ns}.json`);
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(() => JSON.parse(content)).not.toThrow();
        });
      }
    }
  });

  describe('key parity (EN -> zh-CN)', () => {
    for (const ns of NAMESPACES) {
      it(`zh-CN/${ns}.json should have all keys from en/${ns}.json`, () => {
        const enData = loadLocaleFile('en', ns);
        const zhData = loadLocaleFile('zh-CN', ns);

        const enKeys = getAllKeys(enData);
        const zhKeys = new Set(getAllKeys(zhData));

        const missingInZh = enKeys.filter((key) => !zhKeys.has(key));
        if (missingInZh.length > 0) {
          throw new Error(
            `zh-CN/${ns}.json is missing ${missingInZh.length} key(s) from en/${ns}.json:\n` +
            missingInZh.map((k) => `  - ${k}`).join('\n')
          );
        }
      });
    }
  });

  describe('key parity (zh-CN -> EN)', () => {
    for (const ns of NAMESPACES) {
      it(`en/${ns}.json should have all keys from zh-CN/${ns}.json`, () => {
        const enData = loadLocaleFile('en', ns);
        const zhData = loadLocaleFile('zh-CN', ns);

        const enKeys = new Set(getAllKeys(enData));
        const zhKeys = getAllKeys(zhData);

        const extraInZh = zhKeys.filter((key) => !enKeys.has(key));
        if (extraInZh.length > 0) {
          throw new Error(
            `zh-CN/${ns}.json has ${extraInZh.length} extra key(s) not in en/${ns}.json:\n` +
            extraInZh.map((k) => `  - ${k}`).join('\n')
          );
        }
      });
    }
  });

  describe('interpolation variable parity', () => {
    const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

    function extractVariables(text: string): string[] {
      const vars: string[] = [];
      let match;
      while ((match = VARIABLE_REGEX.exec(text)) !== null) {
        vars.push(match[1]);
      }
      return vars.sort();
    }

    function getLeafValues(
      obj: Record<string, unknown>,
      prefix = ''
    ): Array<{ key: string; value: string }> {
      const results: Array<{ key: string; value: string }> = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          results.push(...getLeafValues(value as Record<string, unknown>, fullKey));
        } else if (typeof value === 'string' && value.includes('{{')) {
          results.push({ key: fullKey, value });
        }
      }
      return results;
    }

    for (const ns of NAMESPACES) {
      it(`${ns}: interpolation variables should match between EN and zh-CN`, () => {
        const enData = loadLocaleFile('en', ns);
        const zhData = loadLocaleFile('zh-CN', ns);

        const enEntries = getLeafValues(enData);
        const zhFlat = new Map<string, string>();
        for (const { key, value } of getLeafValues(zhData)) {
          zhFlat.set(key, value);
        }

        const mismatches: string[] = [];
        for (const { key, value: enValue } of enEntries) {
          const zhValue = zhFlat.get(key);
          if (zhValue) {
            const enVars = extractVariables(enValue);
            const zhVars = extractVariables(zhValue);
            if (JSON.stringify(enVars) !== JSON.stringify(zhVars)) {
              mismatches.push(
                `  ${key}: EN has {{${enVars.join(', ')}}}, zh-CN has {{${zhVars.join(', ')}}}`
              );
            }
          }
        }

        if (mismatches.length > 0) {
          throw new Error(
            `${ns}: interpolation variable mismatch:\n${mismatches.join('\n')}`
          );
        }
      });
    }
  });
});
