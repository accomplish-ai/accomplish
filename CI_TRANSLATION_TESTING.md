# CI Translation Testing Guide

## Overview

The i18n system includes automated validation that can run in CI/CD pipelines to ensure translations are always complete.

## Available Scripts

### 1. `pnpm i18n:validate` (No API Key Required)

**Purpose:** Validates that all translation files are complete and properly formatted.

**What it checks:**
- ✅ All translation files are valid JSON
- ✅ Target languages (Chinese, Hebrew) have all keys from English
- ✅ No syntax errors in translation files
- ❌ Reports missing translations
- ⚠️ Reports extra keys (keys in target but not in source)

**Exit codes:**
- `0` - All translations valid
- `1` - Validation failed (missing translations or invalid JSON)

**Example output (success):**
```bash
$ pnpm i18n:validate

🔍 Validating translations...

📂 Source language (en):
  ✓ common.json: Valid JSON
  ✓ settings.json: Valid JSON
  ✓ execution.json: Valid JSON

📂 Target language (zh-CN):
  ✓ common.json: All keys present
  ✓ settings.json: All keys present
  ✓ execution.json: All keys present

📂 Target language (he):
  ✓ common.json: All keys present
  ✓ settings.json: All keys present
  ✓ execution.json: All keys present

============================================================

✅ All translations are valid!
```

**Example output (failure):**
```bash
$ pnpm i18n:validate

🔍 Validating translations...

📂 Source language (en):
  ✓ common.json: Valid JSON

📂 Target language (zh-CN):
  ❌ common.json:
     - Missing 3 translation(s)
     Missing keys:
       • buttons.newButton
       • nav.newPage
       • status.newStatus

============================================================

❌ Validation failed with 1 error(s)

To fix missing translations, run:
  pnpm i18n:sync
```

### 2. `pnpm i18n:sync` (Requires API Key)

**Purpose:** Automatically translates missing keys using Claude API.

**What it does:**
- Reads English translation files (source of truth)
- Compares with target languages
- Translates missing keys using AI
- Updates translation files

**When to run:**
- Locally after adding new UI text in English
- NOT in CI (requires API key and modifies files)

## CI/CD Integration

### GitHub Actions (Included)

The project includes a GitHub Actions workflow at:
```
.github/workflows/validate-translations.yml
```

**Triggers:**
- Pull requests that modify translation files or source code
- Pushes to main branch with translation changes

**What it does:**
1. Checks out code
2. Installs dependencies
3. Runs `pnpm i18n:validate`
4. Comments on PR with results
5. Fails build if translations incomplete

### Testing the CI Workflow Locally

You can simulate the CI validation locally:

```bash
# 1. Clean install (like CI does)
pnpm install --frozen-lockfile

# 2. Run validation
pnpm i18n:validate

# 3. Check exit code
echo $?  # Should be 0 for success
```

### Manual CI Testing

#### Test 1: Add New English Key (Should Fail)

1. Add a new key to English:
   ```bash
   # Add to locales/en/common.json
   {
     "buttons": {
       "testButton": "Test Button"
     }
   }
   ```

2. Run validation:
   ```bash
   pnpm i18n:validate
   ```
   **Expected:** ❌ Fails with "Missing translation(s)"

3. Fix translations:
   ```bash
   pnpm i18n:sync
   ```

4. Validate again:
   ```bash
   pnpm i18n:validate
   ```
   **Expected:** ✅ Passes

#### Test 2: Invalid JSON (Should Fail)

1. Break a translation file:
   ```bash
   # Add syntax error to locales/zh-CN/common.json
   {
     "buttons": {
       "save": "保存",  # <- Extra comma
     }
   }
   ```

2. Run validation:
   ```bash
   pnpm i18n:validate
   ```
   **Expected:** ❌ Fails with "Invalid JSON"

3. Fix the syntax error and validate again.

#### Test 3: All Translations Valid (Should Pass)

```bash
pnpm i18n:validate
```
**Expected:** ✅ Passes with "All translations are valid!"

## Integration Examples

### GitHub Actions
```yaml
- name: Validate translations
  run: pnpm i18n:validate
```

### GitLab CI
```yaml
validate-translations:
  stage: test
  script:
    - pnpm install --frozen-lockfile
    - pnpm i18n:validate
```

### CircleCI
```yaml
- run:
    name: Validate translations
    command: pnpm i18n:validate
```

### Azure Pipelines
```yaml
- script: pnpm i18n:validate
  displayName: 'Validate translations'
```

## Workflow Best Practices

### For Developers:

1. **Add new UI text in English first**
   ```json
   // locales/en/common.json
   {
     "buttons": {
       "newFeature": "New Feature"
     }
   }
   ```

2. **Use translation in code**
   ```tsx
   const { t } = useTranslation('common');
   <button>{t('buttons.newFeature')}</button>
   ```

3. **Generate translations locally**
   ```bash
   pnpm i18n:sync
   ```

4. **Validate before committing**
   ```bash
   pnpm i18n:validate
   ```

5. **Commit all changes**
   ```bash
   git add apps/desktop/locales
   git commit -m "feat: add new feature button with translations"
   ```

### For CI/CD:

1. **Run validation on every PR**
   - Catches missing translations early
   - Prevents merging incomplete translations

2. **Don't run `i18n:sync` in CI**
   - Requires API key
   - Should be run locally by developers
   - CI should only validate, not modify

3. **Block PR merges if validation fails**
   - Ensures translations are always complete
   - Maintains translation quality

## Cost Considerations

- **Validation (`i18n:validate`):** FREE ✅
  - No API calls
  - Pure file comparison
  - Fast (<1 second)
  - Run as many times as needed in CI

- **Sync (`i18n:sync`):** PAID 💰
  - Uses Claude API
  - ~$0.10-0.50 per full translation
  - Run locally only
  - Only pay when adding new text

## Troubleshooting

### Validation passes locally but fails in CI

**Cause:** Git might not have committed all translation files.

**Fix:**
```bash
git status
git add apps/desktop/locales
git commit --amend
```

### Validation fails but translations look complete

**Cause:** Possible JSON syntax error or encoding issue.

**Fix:**
```bash
# Check for syntax errors
pnpm i18n:validate

# Look at the detailed error message
# Fix the specific file mentioned
```

### Want to skip validation temporarily

**Not recommended**, but if needed:
```yaml
# GitHub Actions
- name: Validate translations
  run: pnpm i18n:validate
  continue-on-error: true  # Allows build to continue
```

## Summary

✅ **Use `pnpm i18n:validate` in CI** - Fast, free, catches issues early
✅ **Use `pnpm i18n:sync` locally** - Generates translations before committing
✅ **Block PRs with validation failures** - Ensures quality
❌ **Don't run `i18n:sync` in CI** - Requires API key, modifies files

The validation system ensures that your internationalization is always complete and correct! 🌍
