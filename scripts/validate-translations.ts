#!/usr/bin/env tsx
/**
 * Translation Validation Script
 *
 * This script validates that all translation files are:
 * 1. Valid JSON
 * 2. Have matching keys with the English source
 * 3. No missing translations
 * 4. Proper structure
 * 5. Tool name translations are handled at runtime (not in locale files)
 *
 * Usage:
 *   pnpm tsx scripts/validate-translations.ts
 *   pnpm validate:translations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../apps/desktop/locales');
const SOURCE_LANG = 'en';
const TARGET_LANGS = ['zh-CN'];

interface ValidationResult {
  language: string;
  namespace: string;
  errors: string[];
  warnings: string[];
  missingKeys: string[];
  extraKeys: string[];
}

let hasErrors = false;

/**
 * Get all keys from an object recursively
 */
function getAllKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Validate a single translation file
 */
function validateTranslationFile(
  language: string,
  namespace: string,
  sourceData: any,
  targetData: any
): ValidationResult {
  const result: ValidationResult = {
    language,
    namespace,
    errors: [],
    warnings: [],
    missingKeys: [],
    extraKeys: [],
  };

  // Get all keys
  const sourceKeys = getAllKeys(sourceData);
  const targetKeys = getAllKeys(targetData);

  // Find missing keys
  const missingKeys = sourceKeys.filter(key => !targetKeys.includes(key));
  if (missingKeys.length > 0) {
    result.missingKeys = missingKeys;
    result.errors.push(`Missing ${missingKeys.length} translation(s)`);
  }

  // Find extra keys (keys in target but not in source)
  const extraKeys = targetKeys.filter(key => !sourceKeys.includes(key));
  if (extraKeys.length > 0) {
    result.extraKeys = extraKeys;
    result.warnings.push(`${extraKeys.length} extra key(s) not in source`);
  }

  return result;
}

/**
 * Validate JSON structure
 */
function validateJSON(filePath: string): { valid: boolean; error?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Tool name translations are handled at runtime via TOOL_DISPLAY_NAMES in task-callbacks.ts
// and dynamic translation for unknown tools. No locale file validation needed.

/**
 * Main validation
 */
function main() {
  console.log('🔍 Validating translations...\n');

  const sourceDir = path.join(LOCALES_DIR, SOURCE_LANG);
  const namespaceFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));

  let totalErrors = 0;
  let totalWarnings = 0;

  // Validate source files first
  console.log(`📂 Source language (${SOURCE_LANG}):`);
  for (const file of namespaceFiles) {
    const filePath = path.join(sourceDir, file);
    const jsonValidation = validateJSON(filePath);

    if (!jsonValidation.valid) {
      console.log(`  ❌ ${file}: Invalid JSON - ${jsonValidation.error}`);
      hasErrors = true;
      totalErrors++;
    } else {
      console.log(`  ✓ ${file}: Valid JSON`);
    }
  }

  // Validate target languages
  for (const targetLang of TARGET_LANGS) {
    console.log(`\n📂 Target language (${targetLang}):`);

    const targetDir = path.join(LOCALES_DIR, targetLang);

    // Check if target directory exists
    if (!fs.existsSync(targetDir)) {
      console.log(`  ❌ Directory does not exist`);
      hasErrors = true;
      totalErrors++;
      continue;
    }

    for (const file of namespaceFiles) {
      const namespace = file.replace('.json', '');
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);

      // Check if target file exists
      if (!fs.existsSync(targetPath)) {
        console.log(`  ❌ ${file}: File does not exist`);
        hasErrors = true;
        totalErrors++;
        continue;
      }

      // Validate JSON structure
      const jsonValidation = validateJSON(targetPath);
      if (!jsonValidation.valid) {
        console.log(`  ❌ ${file}: Invalid JSON - ${jsonValidation.error}`);
        hasErrors = true;
        totalErrors++;
        continue;
      }

      // Load and compare keys
      const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
      const targetData = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

      const result = validateTranslationFile(targetLang, namespace, sourceData, targetData);

      // Report results
      if (result.errors.length > 0) {
        console.log(`  ❌ ${file}:`);
        result.errors.forEach(error => console.log(`     - ${error}`));

        if (result.missingKeys.length > 0 && result.missingKeys.length <= 10) {
          console.log(`     Missing keys:`);
          result.missingKeys.forEach(key => console.log(`       • ${key}`));
        } else if (result.missingKeys.length > 10) {
          console.log(`     Missing keys: (showing first 10)`);
          result.missingKeys.slice(0, 10).forEach(key => console.log(`       • ${key}`));
          console.log(`       ... and ${result.missingKeys.length - 10} more`);
        }

        hasErrors = true;
        totalErrors += result.errors.length;
      } else if (result.warnings.length > 0) {
        console.log(`  ⚠️  ${file}:`);
        result.warnings.forEach(warning => console.log(`     - ${warning}`));
        totalWarnings += result.warnings.length;
      } else {
        console.log(`  ✓ ${file}: All keys present`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (hasErrors) {
    console.log(`\n❌ Validation failed with ${totalErrors} error(s)`);
    if (totalWarnings > 0) {
      console.log(`⚠️  ${totalWarnings} warning(s)`);
    }
    console.log('\nTo fix missing translations, run:');
    console.log('  pnpm i18n:sync');
    process.exit(1);
  } else {
    console.log('\n✅ All translations are valid!');
    if (totalWarnings > 0) {
      console.log(`⚠️  ${totalWarnings} warning(s) (extra keys that can be cleaned up)`);
    }
    process.exit(0);
  }
}

main();
