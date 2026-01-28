# GitHub Secrets for Translation Automation

## TL;DR - Our Recommendation

✅ **DON'T store API key in GitHub Secrets** (current setup)
- CI validates translations (free, fast)
- Developers translate locally (controlled, reviewed)
- No surprise costs

❌ **Only use GitHub Secrets if:**
- You have budget for automated API calls
- You want auto-translation on main branch only
- You accept the tradeoffs below

## Comparison: Local vs CI Translation

### Current Approach (Recommended) ✅

**CI:**
```yaml
# Runs on every PR (free)
- run: pnpm i18n:validate
```

**Developer:**
```bash
# Runs locally (paid, controlled)
pnpm i18n:sync
git commit -m "i18n: add translations"
```

**Pros:**
- ✅ Zero CI costs
- ✅ Developer reviews translations
- ✅ Controlled API usage
- ✅ No git automation complexity

**Cons:**
- ⚠️ Developer must remember to run sync
- ⚠️ Extra commit needed

### Auto-Translate in CI ❌

**CI:**
```yaml
# Runs on merge to main (paid)
- run: pnpm i18n:sync
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Pros:**
- ✅ Fully automated
- ✅ Developers don't need API key
- ✅ Consistent translation workflow

**Cons:**
- ❌ **API costs on every merge**
- ❌ No human review before translation
- ❌ CI needs write access to repo
- ❌ Creates automated commits
- ❌ Potential for translation spam

## Cost Comparison

### Validation Only (Current)
```
PRs per month: 50
Cost per validation: $0 (no API calls)
Total monthly cost: $0
```

### Auto-Translation in CI
```
PRs per month: 50
Average keys added per PR: 5
Cost per translation: ~$0.05
Total monthly cost: $2.50

Edge case:
Large UI refactor: 100 keys
Cost: $0.50 per language × 2 = $1.00 per PR
```

**Note:** Costs can add up quickly if multiple developers are working on UI text.

## If You REALLY Want Auto-Translation

### Option 1: Main Branch Only (Safest)

Auto-translate only when merging to main:

1. **Add API key to GitHub Secrets:**
   - Go to: `Settings → Secrets and variables → Actions`
   - Click: `New repository secret`
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-your-key-here`

2. **Enable the workflow:**
   ```bash
   mv .github/workflows/auto-translate-on-merge.yml.example \
      .github/workflows/auto-translate-on-merge.yml
   ```

3. **Commit and push:**
   ```bash
   git add .github/workflows/auto-translate-on-merge.yml
   git commit -m "feat: enable auto-translation on main"
   git push
   ```

**How it works:**
1. Developer merges PR to main (without translations)
2. CI detects English file changes
3. CI runs `pnpm i18n:sync` with secret API key
4. CI commits translations back to main
5. Translations are now in main branch

**Pros:**
- Only runs once per merge
- Fewer API calls than PR-based
- Main branch stays complete

**Cons:**
- Still costs money
- Automated commits to main
- No review before translation

### Option 2: PR Comments with Translations (Better)

Instead of auto-committing, post translations as PR comments:

```yaml
# Pseudo-code - would need custom implementation
- run: pnpm i18n:sync --dry-run --output=translations.json
- uses: actions/github-script@v7
  with:
    script: |
      // Post translations as PR comment
      // Developer can review and manually commit
```

**Pros:**
- Developer reviews before committing
- Suggestions, not auto-commits
- Still automated

**Cons:**
- More complex implementation
- Still uses API credits

### Option 3: Scheduled Batch Translation

Run translation sync once per day instead of per-PR:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
```

**Pros:**
- Predictable costs (1 run per day)
- Catches all changes at once
- Less spam

**Cons:**
- Translations delayed up to 24 hours
- Larger batch = larger cost per run

## Security Best Practices

If you do store API key in GitHub Secrets:

### 1. Use Environment Protection

```yaml
jobs:
  translate:
    environment: production  # Requires approval
    steps:
      - run: pnpm i18n:sync
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Restrict to Main Branch Only

```yaml
on:
  push:
    branches:
      - main  # Only on main, not PRs
```

### 3. Use Dependabot Secrets

Keep secrets separate from repository settings:
```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 4. Rotate Keys Regularly

Set reminder to rotate API keys every 90 days.

### 5. Monitor Usage

Check Anthropic dashboard for unexpected usage spikes.

## How to Add GitHub Secret

If you decide to use auto-translation:

1. **Go to Repository Settings**
   ```
   https://github.com/your-org/openwork/settings/secrets/actions
   ```

2. **Click "New repository secret"**

3. **Add Secret:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...` (your API key)
   - Click "Add secret"

4. **Verify Secret:**
   - Secret name should appear in list
   - Value is hidden (shows as `***`)

5. **Use in Workflow:**
   ```yaml
   env:
     ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

## Testing GitHub Secrets

To test without actual API calls:

1. **Add a dummy secret:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `test-key-12345`

2. **Test workflow (will fail translation but won't cost money):**
   ```bash
   git commit --allow-empty -m "test: trigger workflow"
   git push
   ```

3. **Check Actions tab** to see if secret is loaded

4. **Replace with real key** when ready

## Monitoring Costs

If using auto-translation:

### Anthropic Dashboard
- Check: https://console.anthropic.com/settings/usage
- Set up billing alerts
- Monitor daily/monthly usage

### GitHub Actions
- Check: Actions tab → workflow runs
- See how often translations run
- Estimate costs per run

### Cost Alerts
Set up alerts when monthly cost exceeds threshold:
```
Monthly budget: $10
Alert at: $7.50 (75%)
```

## Our Recommendation

**Start with validation-only approach** (current implementation):
- ✅ Zero costs
- ✅ Full control
- ✅ Works great for most teams

**Only add auto-translation if:**
- ✅ You have budget allocation
- ✅ You want to reduce developer friction
- ✅ You understand the tradeoffs
- ✅ You've tested with the example workflow

## Summary Table

| Approach | API Key in Secrets? | Cost | Developer Effort | Review | Best For |
|----------|-------------------|------|------------------|--------|----------|
| **Validation Only** (current) | ❌ No | $0 | Low (one command) | ✅ Yes | Most teams |
| **Auto on Main** | ✅ Yes | ~$2-10/mo | None | ❌ No | High-traffic repos |
| **PR Comments** | ✅ Yes | ~$2-10/mo | Medium (copy/paste) | ✅ Yes | Quality-focused |
| **Scheduled** | ✅ Yes | ~$1-5/mo | None | ❌ No | Low-priority i18n |

## Conclusion

The current validation-only approach is **recommended for most teams** because:
- It's free
- It's secure
- It's simple
- It works reliably

Only add GitHub Secrets if you have a specific need and understand the tradeoffs.

**File included:** `.github/workflows/auto-translate-on-merge.yml.example` (disabled by default)
