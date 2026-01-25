# Sanity Tests Infrastructure Design

## Overview

Run 4 real-world tasks against 3 models to validate agent health with no mocks.

- **Models**: Claude Opus 4.5, GPT-5 Codex, Gemini 3 Pro
- **Test Matrix**: 4 tasks × 3 models = 12 test runs
- **Location**: `apps/desktop/sanity-tests/`
- **Output Directory**: `~/openwork-sanity-output/`

## Test Tasks

### Test 1: Web Scraping → CSV Export
- **Prompt**: "Go to Hacker News, get the top 5 stories (title, URL, points), and save them to ~/openwork-sanity-output/hn-top5.csv"
- **Validates**: Browser navigation, data extraction, file creation
- **Pass Criteria**: CSV exists, has 5+ rows, contains "title,url,points" header

### Test 2: File Download from Web
- **Prompt**: "Download the PDF from https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf and save it to ~/openwork-sanity-output/downloaded.pdf"
- **Validates**: Browser download handling, file system write
- **Pass Criteria**: PDF exists, file size > 1KB

### Test 3: Local File Read → Analysis → Write
- **Setup**: Create `~/openwork-sanity-output/input.txt` with sample text before test
- **Prompt**: "Read the file ~/openwork-sanity-output/input.txt, count the words and lines, and write a summary to ~/openwork-sanity-output/analysis.txt"
- **Validates**: Local file read, processing, file write
- **Pass Criteria**: analysis.txt exists, contains word/line counts

### Test 4: Visual Comparison + Report
- **Prompt**: "Take screenshots of https://example.com and https://example.org, compare them visually, and save a comparison report to ~/openwork-sanity-output/comparison.md"
- **Validates**: Multi-page browser work, screenshot capture, markdown generation
- **Pass Criteria**: comparison.md exists, mentions both URLs

## File Structure

```
apps/desktop/sanity-tests/
├── playwright.sanity.config.ts    # Sanity-specific Playwright config
├── fixtures/
│   └── sanity-app.ts              # Extended Electron fixture with real API keys
├── tests/
│   ├── web-scraping.sanity.ts     # Test 1: HN → CSV
│   ├── file-download.sanity.ts    # Test 2: PDF download
│   ├── file-analysis.sanity.ts    # Test 3: Read → Analyze → Write
│   └── visual-compare.sanity.ts   # Test 4: Screenshot comparison
├── utils/
│   ├── validators.ts              # File existence & content checks
│   ├── setup.ts                   # Create output dir, seed input files
│   └── models.ts                  # Model configs (Opus, GPT-5, Gemini)
├── page-objects/
│   └── ExecutionPage.ts           # Reuse/extend existing POM
└── README.md                      # How to run, env vars needed
```

## Test Execution Flow

### Before All Tests
1. Validate required env vars exist (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`)
2. Clean/create output directory `~/openwork-sanity-output/`
3. Seed input files (e.g., `input.txt` for Test 3)

### Per Test
1. Launch Electron app (visible Chrome)
2. Inject API key for current model into app's keychain
3. Set active provider/model via IPC
4. Navigate to home page
5. Enter task prompt
6. Submit and wait for execution page
7. Wait for task completion (up to 5 min timeout)
8. Validate: agent status === 'completed' (no error)
9. Validate: expected output files exist with correct content
10. Close app

### After All Tests
- Generate summary report: `sanity-report.json` with pass/fail per model/task

## Configuration

### Playwright Config Differences from E2E
- Longer timeout: 5 minutes per test (real agent work)
- No mocks: `E2E_MOCK_TASK_EVENTS` NOT set
- Real API keys injected via environment
- Chrome visible: `headless: false`
- Serial execution: 1 worker (agent tasks can't parallelize)

### Test Parameterization
```typescript
const models = [
  { provider: 'anthropic', model: 'claude-opus-4-5-20250101' },
  { provider: 'openai', model: 'gpt-5-codex' },
  { provider: 'google', model: 'gemini-3-pro' },
];

for (const model of models) {
  test(`Task 1 - Web Scraping [${model.provider}]`, async ({ electronApp }) => {
    // ... test logic
  });
}
```

## Scripts

Add to `apps/desktop/package.json`:

```json
{
  "scripts": {
    "test:sanity": "playwright test --config=sanity-tests/playwright.sanity.config.ts",
    "test:sanity:opus": "MODEL_FILTER=anthropic pnpm test:sanity",
    "test:sanity:openai": "MODEL_FILTER=openai pnpm test:sanity",
    "test:sanity:google": "MODEL_FILTER=google pnpm test:sanity",
    "test:sanity:quick": "MODEL_FILTER=anthropic TASK_FILTER=web-scraping pnpm test:sanity"
  }
}
```

## Environment Variables

### Required
```bash
# .env.sanity (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

### Optional Filters
```bash
MODEL_FILTER=anthropic    # Run only with one provider
TASK_FILTER=web-scraping  # Run only one task type
SANITY_TIMEOUT=300000     # Override 5-min default (ms)
SANITY_HEADLESS=true      # Run headless (CI mode)
```

## Success Criteria

Each test validates:
1. **Agent Status**: Task completed without errors
2. **File Existence**: Expected output files created
3. **Content Validation**: Files contain expected patterns/data

## Future: CI Integration

- GitHub Actions workflow for nightly runs
- API keys stored as repository secrets
- Report uploaded as artifact
- Slack/email notification on failures
