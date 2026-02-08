#!/usr/bin/env tsx
/**
 * Automated Translation Sync Script
 *
 * This script:
 * 1. Reads English translation files (source of truth)
 * 2. Compares with target language files (zh-CN)
 * 3. Finds missing keys
 * 4. Uses Claude API to translate missing keys
 * 5. Merges translations back into target files
 *
 * Usage:
 *   # Using .env file (recommended):
 *   pnpm i18n:sync
 *
 *   # Using environment variable:
 *   ANTHROPIC_API_KEY=sk-... pnpm i18n:sync
 *
 *   # Translate specific language:
 *   pnpm i18n:sync:zh
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file if it exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Language configuration
const LANGUAGE_CONFIGS: Record<string, { name: string; direction: 'ltr' | 'rtl' }> = {
  'zh-CN': { name: 'Simplified Chinese', direction: 'ltr' },
};

const LOCALES_DIR = path.join(__dirname, '../apps/desktop/locales');
const SOURCE_LANG = 'en';

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Deep merge two objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

/**
 * Find missing keys by comparing source with target
 */
function findMissingKeys(source: any, target: any): any {
  const missing: any = {};

  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      // Nested object - recurse
      const nestedMissing = findMissingKeys(source[key], target[key] || {});
      if (Object.keys(nestedMissing).length > 0) {
        missing[key] = nestedMissing;
      }
    } else if (!(key in (target || {}))) {
      // Missing key
      missing[key] = source[key];
    }
  }

  return missing;
}

/**
 * Count total keys in an object (recursively)
 */
function countKeys(obj: any): number {
  let count = 0;

  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      count += countKeys(obj[key]);
    } else {
      count++;
    }
  }

  return count;
}

/**
 * Translate missing keys using Claude API
 */
async function translateWithAI(data: any, targetLang: string): Promise<any> {
  const langConfig = LANGUAGE_CONFIGS[targetLang];

  if (!langConfig) {
    throw new Error(`Unsupported language: ${targetLang}`);
  }

  const prompt = `Translate this UI text from English to ${langConfig.name}.

CRITICAL RULES:
- Keep the exact same JSON structure with identical keys
- Only translate the VALUES, never the keys
- Keep {{variables}}, {{count}}, and <tags> UNCHANGED
- Maintain placeholder syntax exactly: "{{provider}} API Key" → "${langConfig.name} translation with {{provider}}"
- Use natural, native phrasing appropriate for UI elements
- Keep technical terms consistent (API, URL, etc.)
- For UI buttons and actions, use imperative/action form
English JSON to translate:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Return ONLY the translated JSON with no explanation, wrapped in \`\`\`json code block.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Extract JSON from code block
    const text = content.text;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Error translating with AI:', error);
    throw error;
  }
}

/**
 * Sync translations for a specific language
 */
async function syncLanguage(targetLang: string): Promise<void> {
  console.log(`\n📝 Syncing translations for ${LANGUAGE_CONFIGS[targetLang].name} (${targetLang})...`);

  const sourceDir = path.join(LOCALES_DIR, SOURCE_LANG);
  const targetDir = path.join(LOCALES_DIR, targetLang);

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`   Created directory: ${targetDir}`);
  }

  // Get all namespace files from source
  const namespaceFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));

  let totalMissing = 0;
  let totalTranslated = 0;

  for (const file of namespaceFiles) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    // Read source (English) content
    const sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

    // Read target content (or empty object if doesn't exist)
    const targetContent = fs.existsSync(targetPath)
      ? JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
      : {};

    // Find missing keys
    const missing = findMissingKeys(sourceContent, targetContent);
    const missingCount = countKeys(missing);

    if (missingCount > 0) {
      totalMissing += missingCount;
      console.log(`   ${file}: ${missingCount} missing keys`);
      console.log(`   Translating...`);

      // Translate missing keys
      const translated = await translateWithAI(missing, targetLang);

      // Merge with existing translations
      const merged = deepMerge(targetContent, translated);

      // Write back to file
      fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n');

      totalTranslated += missingCount;
      console.log(`   ✓ Translated ${missingCount} keys`);
    } else {
      console.log(`   ${file}: ✓ Up to date`);
    }
  }

  if (totalTranslated > 0) {
    console.log(`\n✅ ${LANGUAGE_CONFIGS[targetLang].name}: Translated ${totalTranslated} keys`);
  } else {
    console.log(`\n✅ ${LANGUAGE_CONFIGS[targetLang].name}: All translations up to date`);
  }
}

/**
 * Main execution
 */
async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('');
    console.error('   Option 1 (Recommended): Create a .env file');
    console.error('   $ cp .env.example .env');
    console.error('   $ # Edit .env and add your API key');
    console.error('   $ pnpm i18n:sync');
    console.error('');
    console.error('   Option 2: Use environment variable');
    console.error('   $ ANTHROPIC_API_KEY=sk-... pnpm i18n:sync');
    process.exit(1);
  }

  // Check if specific language was requested
  const targetLangs = process.argv.slice(2);
  const langsToSync = targetLangs.length > 0
    ? targetLangs.filter(lang => lang in LANGUAGE_CONFIGS)
    : Object.keys(LANGUAGE_CONFIGS);

  if (langsToSync.length === 0) {
    console.error('❌ Error: No valid languages specified');
    console.error(`   Supported languages: ${Object.keys(LANGUAGE_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log('🌍 Translation Sync Starting...');
  console.log(`   Source: ${SOURCE_LANG}`);
  console.log(`   Targets: ${langsToSync.join(', ')}`);

  try {
    // Sync each language sequentially (to avoid rate limits)
    for (const lang of langsToSync) {
      await syncLanguage(lang);
    }

    console.log('\n🎉 Translation sync complete!');
  } catch (error) {
    console.error('\n❌ Error during translation sync:', error);
    process.exit(1);
  }
}

main();
