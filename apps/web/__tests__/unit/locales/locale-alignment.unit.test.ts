import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.resolve(process.cwd(), 'locales');
const REFERENCE_LOCALE = 'en';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, keyPath));
    } else {
      keys.push(keyPath);
    }
  }
  return keys;
}

const allLocales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const referenceDir = path.join(LOCALES_DIR, REFERENCE_LOCALE);
const namespaces = fs
  .readdirSync(referenceDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));

const otherLocales = allLocales.filter((l) => l !== REFERENCE_LOCALE);

describe('Locale file alignment', () => {
  describe('structure', () => {
    it('should have at least one non-reference locale', () => {
      expect(otherLocales.length).toBeGreaterThan(0);
    });

    it('should have all expected namespace files in every locale', () => {
      for (const locale of otherLocales) {
        const localeDir = path.join(LOCALES_DIR, locale);
        const localeFiles = fs
          .readdirSync(localeDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace('.json', ''));

        for (const ns of namespaces) {
          expect(
            localeFiles,
            `Locale "${locale}" is missing namespace file "${ns}.json"`,
          ).toContain(ns);
        }
      }
    });
  });

  for (const namespace of namespaces) {
    describe(`namespace: ${namespace}`, () => {
      const refData = JSON.parse(
        fs.readFileSync(path.join(referenceDir, `${namespace}.json`), 'utf-8'),
      );
      const refKeys = collectKeys(refData);

      for (const locale of otherLocales) {
        it(`${locale}/${namespace}.json has no missing or extra keys vs en`, () => {
          const localeFile = path.join(LOCALES_DIR, locale, `${namespace}.json`);
          expect(
            fs.existsSync(localeFile),
            `Missing namespace file: ${locale}/${namespace}.json`,
          ).toBeTruthy();
          const localeData = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
          const localeKeys = new Set(collectKeys(localeData));
          const refKeySet = new Set(refKeys);

          const missing = refKeys.filter((k) => !localeKeys.has(k));
          const extra = [...localeKeys].filter((k) => !refKeySet.has(k));

          expect(missing, `Missing keys in ${locale}/${namespace}.json`).toEqual([]);
          expect(extra, `Extra keys in ${locale}/${namespace}.json not present in en`).toEqual([]);
        });
      }
    });
  }
});
