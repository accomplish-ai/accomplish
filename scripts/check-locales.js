#!/usr/bin/env node
/**
 * Locale alignment checker.
 * Validates that all locale files have the same keys as the reference (en) locale.
 * Exits with code 1 if any mismatches are found.
 */

'use strict';

const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const LOCALES_DIR = join(__dirname, '..', 'apps', 'web', 'locales');
const REFERENCE_LOCALE = 'en';

/**
 * Recursively collect all dot-notation key paths from an object.
 * e.g. { a: { b: 1 } } → ['a.b']
 */
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// Discover locales and namespaces
const allLocales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const referenceDir = join(LOCALES_DIR, REFERENCE_LOCALE);
const namespaces = readdirSync(referenceDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));

const otherLocales = allLocales.filter((l) => l !== REFERENCE_LOCALE);

let totalErrors = 0;
const missingFiles = [];

for (const namespace of namespaces) {
  const refFile = join(referenceDir, `${namespace}.json`);
  const refData = loadJson(refFile);
  const refKeys = new Set(collectKeys(refData));

  for (const locale of otherLocales) {
    const localeFile = join(LOCALES_DIR, locale, `${namespace}.json`);

    let localeData;
    try {
      localeData = loadJson(localeFile);
    } catch (e) {
      missingFiles.push({ locale, namespace });
      continue;
    }

    const localeKeys = new Set(collectKeys(localeData));

    const missing = [...refKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !refKeys.has(k));

    if (missing.length > 0 || extra.length > 0) {
      console.error(`\n[locales] Mismatch in ${locale}/${namespace}.json:`);
      if (missing.length > 0) {
        console.error(`  Missing keys (${missing.length}):`);
        missing.forEach((k) => console.error(`    - ${k}`));
      }
      if (extra.length > 0) {
        console.error(`  Extra keys not in ${REFERENCE_LOCALE} (${extra.length}):`);
        extra.forEach((k) => console.error(`    + ${k}`));
      }
      totalErrors += missing.length + extra.length;
    }
  }
}

if (missingFiles.length > 0) {
  console.error(`\n[locales] Missing namespace files (${missingFiles.length}):`);
  missingFiles.forEach(({ locale, namespace }) => console.error(`  - ${locale}/${namespace}.json`));
}

if (missingFiles.length > 0 || totalErrors > 0) {
  if (totalErrors > 0) {
    console.error(
      `\n[locales] Found ${totalErrors} key mismatch(es) across locale files. Fix before pushing.`,
    );
  }
  process.exit(1);
} else {
  console.log(
    `[locales] All locale files are aligned (${otherLocales.length} locales × ${namespaces.length} namespaces checked).`,
  );
}
