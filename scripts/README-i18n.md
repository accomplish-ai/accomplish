# Internationalization (i18n) Translation Scripts

This directory contains automated translation scripts for Openwork's internationalization support.

## Overview

The `sync-translations.ts` script automatically translates missing UI strings from English to other languages using Claude API.

**Supported Languages:**
- English (en) - Source language
- Simplified Chinese (zh-CN)
- Hebrew (he)

## Setup

### Option 1: Using .env File (Recommended)

This is the most secure and convenient method:

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Anthropic API key:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
   ```

3. The `.env` file is already in `.gitignore` so your key won't be committed

### Option 2: Environment Variable

Pass the key directly (useful for CI/CD):

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm i18n:sync
```

### Option 3: Use Your Existing Openwork API Key

If you're already using Openwork with an Anthropic API key, you can retrieve it from the app's keychain:

```bash
# macOS
security find-generic-password -s "openwork-api-key" -w
```

Then use that key with Option 1 or 2.

## Usage

### Validate Translations (No API Key Required)

Before syncing, you can validate that all translations are complete:

```bash
pnpm i18n:validate
```

This will:
- Check that all translation files are valid JSON
- Verify that target languages have all keys from English
- Report missing or extra keys
- Exit with error code if validation fails

**Use in CI:** This command doesn't require an API key, making it perfect for CI/CD pipelines to ensure translations are complete before merging PRs.

### Sync All Languages

```bash
pnpm i18n:sync
```

This will:
1. Read all English translation files (source of truth)
2. Compare with Chinese and Hebrew translation files
3. Find missing keys in each language
4. Translate missing keys using Claude API
5. Merge translations back into the language files

### Sync Specific Language

```bash
# Sync only Chinese
pnpm i18n:sync:zh

# Sync only Hebrew
pnpm i18n:sync:he
```

## How It Works

1. **Source of Truth**: English translation files in `apps/desktop/locales/en/`
2. **Detection**: Script compares English keys with target language keys
3. **Translation**: Missing keys are translated using Claude 3.5 Sonnet
4. **Preservation**: Existing translations are never overwritten
5. **Structure**: JSON structure and {{placeholders}} are preserved exactly

## Adding New Translations

When you add new UI text to the codebase:

1. Update the English translation files in `apps/desktop/locales/en/`
2. Use the translation key in your React components:
   ```tsx
   const { t } = useTranslation('namespace');
   <div>{t('new.key')}</div>
   ```
3. Run `pnpm i18n:sync` to automatically translate to other languages

## Adding a New Language

Want to add support for a new language (e.g., Spanish 'es')? Here's the complete process:

### Total Time: ~15 minutes + ~$0.15 per language

### 1. Create Translation Files (5 minutes)

```bash
# Create the language directory
mkdir -p apps/desktop/locales/es

# Copy English files as template
cp apps/desktop/locales/en/*.json apps/desktop/locales/es/
```

### 2. Update Renderer Type Definitions (2 minutes)

Edit `apps/desktop/src/renderer/i18n/index.ts`:

```typescript
// Add 'es' to the Language type
export type Language = 'en' | 'zh-CN' | 'he' | 'es';  // ← Add 'es'

// Add 'es' to supported languages array
export const SUPPORTED_LANGUAGES: Language[] = ['en', 'zh-CN', 'he', 'es'];  // ← Add 'es'

// If the language is RTL (Right-to-Left), update the function
function updateDocumentDirection(language: string): void {
  const isRTL = language === 'he' || language === 'ar' || language.startsWith('ar');
  // Spanish is LTR (Left-to-Right), so no change needed
}
```

### 3. Update Main Process (2 minutes)

Edit `apps/desktop/src/main/i18n/index.ts`:

```typescript
// Add 'es' to the Language type
export type Language = 'en' | 'zh-CN' | 'he' | 'es';  // ← Add 'es'

// Add 'es' to supported languages array
export const SUPPORTED_LANGUAGES: Language[] = ['en', 'zh-CN', 'he', 'es'];  // ← Add 'es'

// Add automatic language detection for system locale
const systemLocale = app.getLocale();
if (systemLocale.startsWith('zh')) {
  currentLanguage = 'zh-CN';
} else if (systemLocale.startsWith('he')) {
  currentLanguage = 'he';
} else if (systemLocale.startsWith('es')) {  // ← Add this block
  currentLanguage = 'es';
} else {
  currentLanguage = 'en';
}
```

### 4. Add UI Option in Settings (2 minutes)

Edit `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`:

```typescript
// Add the option to the language selector
// IMPORTANT: Use native language names (not translated)
<select value={language} onChange={(e) => handleLanguageChange(e.target.value as Language)}>
  <option value="auto">{t('language.auto')}</option>
  <option value="en">English</option>
  <option value="zh-CN">简体中文</option>
  <option value="he">עברית</option>
  <option value="es">Español</option>  {/* ← Add this in Spanish */}
</select>
```

### 5. Update Language Section Title Translation (Optional)

The language dropdown shows names in their native scripts (English, 简体中文, עברית), so you don't need to add translated language names. The only translation you might want to update is the section title:

Edit `apps/desktop/locales/en/settings.json` (optional - title only):

```json
{
  "language": {
    "title": "Language",  // This gets translated
    "auto": "Auto (System)"  // This gets translated
    // Language names themselves appear in native scripts in the UI
  }
}
```

### 6. Run Automated Translation (1 minute + ~$0.15)

```bash
# Automatically translates all 300+ keys to Spanish
pnpm i18n:sync es

# Or sync all languages at once (if you've updated multiple)
pnpm i18n:sync
```

### 7. Validate Translations (instant)

```bash
# Confirms all translations are complete
pnpm i18n:validate
```

### Notes

- **RTL Languages**: If you're adding a Right-to-Left language (Arabic, Hebrew, Urdu, etc.), make sure to add it to the RTL check in `updateDocumentDirection()`
- **Language Codes**: Use standard ISO 639-1 codes (`es`, `fr`, `de`) or BCP 47 codes for variants (`zh-CN`, `pt-BR`)
- **Translation Quality**: The automated translations are powered by Claude Sonnet 4, providing high-quality, natural-sounding UI text
- **Cost**: Each language translation costs approximately $0.15 for all 300+ UI strings

### Example: Adding French

```bash
# 1. Create files
mkdir -p apps/desktop/locales/fr
cp apps/desktop/locales/en/*.json apps/desktop/locales/fr/

# 2-4. Update TypeScript files (add 'fr' to types)
# Add 'fr' to Language type in renderer and main i18n files
# Add 'fr' to SUPPORTED_LANGUAGES arrays
# Add locale detection: if (systemLocale.startsWith('fr'))

# 5. Add to UI dropdown with native name
# In SettingsDialog.tsx: <option value="fr">Français</option>

# 6. Translate
pnpm i18n:sync fr

# 7. Validate
pnpm i18n:validate
```

That's it! The language is now fully supported in the app.

## Translation Quality

The script uses Claude 3.5 Sonnet with specific instructions to:
- Maintain consistent terminology
- Use natural, native phrasing appropriate for UI
- Preserve technical terms (API, URL, etc.)
- Keep placeholder syntax intact ({{variable}})
- Use proper text direction for RTL languages (Hebrew)

## Cost Estimation

Translation costs depend on the number of missing keys:
- Typical full translation: ~$0.10-0.50 per language
- Incremental updates: ~$0.01-0.05 per run

The script processes translations efficiently by only translating missing keys.

## Security Notes

- ✅ `.env` file is in `.gitignore` - your API key won't be committed
- ✅ API key is only used locally, never sent to any service except Anthropic
- ✅ Script can be audited - it's plain TypeScript
- ⚠️ Don't commit your `.env` file
- ⚠️ Don't share your API key in issues or PRs

## Troubleshooting

### "ANTHROPIC_API_KEY is required"

Make sure you've created a `.env` file with your API key, or pass it as an environment variable.

### "Failed to translate with AI"

Check:
- Your API key is valid
- You have sufficient API credits
- Your network connection is working
- Anthropic API is not experiencing issues

### Missing translations after running script

- Check the console output for errors
- Verify the English source files have the keys you expect
- Make sure the target language directory exists: `apps/desktop/locales/{lang}/`

## Manual Translation

If you prefer not to use AI translation, you can manually edit the translation files:

```bash
# Edit Chinese translations
apps/desktop/locales/zh-CN/common.json

# Edit Hebrew translations
apps/desktop/locales/he/common.json
```

The app will use English as a fallback for any missing keys.

## CI/CD Integration

### GitHub Actions

A GitHub Actions workflow is included at `.github/workflows/validate-translations.yml` that:

1. **Runs on Pull Requests** that modify:
   - Translation files (`apps/desktop/locales/**`)
   - Source code files (`apps/desktop/src/**/*.tsx`, `*.ts`)

2. **Validates** all translation files:
   - Checks JSON validity
   - Verifies all keys are present
   - Reports missing translations

3. **Comments on PR** with validation results

4. **Fails the build** if translations are incomplete

### Adding to Your CI Pipeline

You can add translation validation to any CI system:

```yaml
# Example for GitHub Actions
- name: Validate translations
  run: pnpm i18n:validate

# Example for GitLab CI
validate-translations:
  script:
    - pnpm i18n:validate

# Example for CircleCI
- run:
    name: Validate translations
    command: pnpm i18n:validate
```

### Pre-commit Hook (Optional)

You can add a pre-commit hook to validate translations locally:

```bash
# .husky/pre-commit
#!/bin/sh
pnpm i18n:validate
```

This ensures translations are always complete before committing.

### Workflow Example

1. Developer adds new UI text in English (`locales/en/common.json`)
2. Developer commits and pushes to PR
3. **CI validation fails** (missing translations detected)
4. Developer runs `pnpm i18n:sync` locally
5. Auto-generated translations are committed
6. **CI validation passes** ✅
7. PR can be merged
