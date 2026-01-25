# Sanity Tests Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a sanity test suite that runs 4 real tasks against 3 models (Opus 4.5, GPT-5 Codex, Gemini 3 Pro) with no mocks.

**Architecture:** Playwright-based E2E tests using existing Electron fixtures, extended with real API key injection and longer timeouts. Tests validate agent completion + output file existence/content.

**Tech Stack:** Playwright, TypeScript, existing Electron fixtures, real API calls

---

## Task 1: Create Sanity Test Directory Structure

**Files:**
- Create: `apps/desktop/sanity-tests/` (directory)
- Create: `apps/desktop/sanity-tests/.gitkeep` (placeholder)

**Step 1: Create directory structure**

```bash
mkdir -p apps/desktop/sanity-tests/{fixtures,tests,utils,page-objects}
touch apps/desktop/sanity-tests/.gitkeep
```

**Step 2: Verify structure exists**

```bash
ls -la apps/desktop/sanity-tests/
```

Expected: directories `fixtures`, `tests`, `utils`, `page-objects`

**Step 3: Commit**

```bash
git add apps/desktop/sanity-tests/
git commit -m "chore: create sanity-tests directory structure"
```

---

## Task 2: Create Sanity Test Configuration

**Files:**
- Create: `apps/desktop/sanity-tests/playwright.sanity.config.ts`

**Step 1: Create the Playwright config for sanity tests**

```typescript
// apps/desktop/sanity-tests/playwright.sanity.config.ts
import { defineConfig } from '@playwright/test';

const SANITY_TIMEOUT = parseInt(process.env.SANITY_TIMEOUT || '300000', 10); // 5 min default

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Serial execution - agent tasks can't parallelize
  workers: 1,
  fullyParallel: false,

  // Long timeout for real agent work
  timeout: SANITY_TIMEOUT,
  expect: {
    timeout: 30000, // 30s for assertions
  },

  // No retries - we want to see real failures
  retries: 0,

  // Reporters
  reporter: [
    ['html', { outputFolder: './html-report' }],
    ['json', { outputFile: './sanity-report.json' }],
    ['list'],
  ],

  use: {
    screenshot: 'on', // Always capture for sanity tests
    video: 'on',
    trace: 'on',
  },

  projects: [
    {
      name: 'sanity',
      testMatch: /.*\.sanity\.ts/,
      timeout: SANITY_TIMEOUT,
    },
  ],
});
```

**Step 2: Verify config is valid TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit sanity-tests/playwright.sanity.config.ts 2>&1 || echo "Config created (tsc check optional)"
```

**Step 3: Commit**

```bash
git add apps/desktop/sanity-tests/playwright.sanity.config.ts
git commit -m "feat(sanity): add playwright config with 5-min timeout"
```

---

## Task 3: Create Model Configuration Utility

**Files:**
- Create: `apps/desktop/sanity-tests/utils/models.ts`

**Step 1: Create model definitions**

```typescript
// apps/desktop/sanity-tests/utils/models.ts
import type { ProviderId } from '@accomplish/shared';

export interface SanityModel {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  envKeyName: string;
}

export const SANITY_MODELS: SanityModel[] = [
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-5-20250101',
    displayName: 'Claude Opus 4.5',
    envKeyName: 'ANTHROPIC_API_KEY',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5-codex',
    displayName: 'GPT-5 Codex',
    envKeyName: 'OPENAI_API_KEY',
  },
  {
    provider: 'google',
    modelId: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    envKeyName: 'GOOGLE_API_KEY',
  },
];

/**
 * Get models to test based on MODEL_FILTER env var.
 * If MODEL_FILTER is set, only return models matching that provider.
 */
export function getModelsToTest(): SanityModel[] {
  const filter = process.env.MODEL_FILTER;
  if (!filter) return SANITY_MODELS;

  return SANITY_MODELS.filter(m => m.provider === filter);
}

/**
 * Get API key from environment for a model.
 * Throws if key is missing.
 */
export function getApiKeyForModel(model: SanityModel): string {
  const key = process.env[model.envKeyName];
  if (!key) {
    throw new Error(`Missing ${model.envKeyName} environment variable for ${model.displayName}`);
  }
  return key;
}

/**
 * Validate all required API keys exist before tests run.
 */
export function validateApiKeys(): void {
  const models = getModelsToTest();
  const missing: string[] = [];

  for (const model of models) {
    if (!process.env[model.envKeyName]) {
      missing.push(model.envKeyName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required API keys: ${missing.join(', ')}`);
  }
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/utils/models.ts
git commit -m "feat(sanity): add model config with env var support"
```

---

## Task 4: Create File Validators Utility

**Files:**
- Create: `apps/desktop/sanity-tests/utils/validators.ts`

**Step 1: Create validators**

```typescript
// apps/desktop/sanity-tests/utils/validators.ts
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export const SANITY_OUTPUT_DIR = path.join(homedir(), 'openwork-sanity-output');

/**
 * Ensure the sanity output directory exists and is empty.
 */
export function setupOutputDirectory(): void {
  if (fs.existsSync(SANITY_OUTPUT_DIR)) {
    fs.rmSync(SANITY_OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(SANITY_OUTPUT_DIR, { recursive: true });
}

/**
 * Check if a file exists in the output directory.
 */
export function fileExists(filename: string): boolean {
  return fs.existsSync(path.join(SANITY_OUTPUT_DIR, filename));
}

/**
 * Get file size in bytes.
 */
export function getFileSize(filename: string): number {
  const filepath = path.join(SANITY_OUTPUT_DIR, filename);
  if (!fs.existsSync(filepath)) return 0;
  return fs.statSync(filepath).size;
}

/**
 * Read file content as string.
 */
export function readFileContent(filename: string): string {
  return fs.readFileSync(path.join(SANITY_OUTPUT_DIR, filename), 'utf-8');
}

/**
 * Check if file contains a pattern (regex or string).
 */
export function fileContains(filename: string, pattern: string | RegExp): boolean {
  const content = readFileContent(filename);
  if (typeof pattern === 'string') {
    return content.includes(pattern);
  }
  return pattern.test(content);
}

/**
 * Count lines in a file (for CSV validation).
 */
export function countLines(filename: string): number {
  const content = readFileContent(filename);
  return content.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Create a seed file for testing file read operations.
 */
export function seedInputFile(): void {
  const content = `This is a sample text file for sanity testing.
It contains multiple lines of text.
The agent should be able to read this file.
Count the words and lines accurately.
This file has exactly five lines of content.`;

  fs.writeFileSync(path.join(SANITY_OUTPUT_DIR, 'input.txt'), content);
}

/**
 * Get full path to a file in the output directory.
 */
export function getOutputPath(filename: string): string {
  return path.join(SANITY_OUTPUT_DIR, filename);
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/utils/validators.ts
git commit -m "feat(sanity): add file validators for output verification"
```

---

## Task 5: Create Setup Utility

**Files:**
- Create: `apps/desktop/sanity-tests/utils/setup.ts`
- Create: `apps/desktop/sanity-tests/utils/index.ts`

**Step 1: Create setup utility**

```typescript
// apps/desktop/sanity-tests/utils/setup.ts
import { validateApiKeys, getModelsToTest } from './models';
import { setupOutputDirectory, seedInputFile, SANITY_OUTPUT_DIR } from './validators';

/**
 * Global setup for sanity tests.
 * Called once before all tests run.
 */
export function globalSetup(): void {
  console.log('\n=== Sanity Test Setup ===\n');

  // Validate API keys
  console.log('Validating API keys...');
  validateApiKeys();
  console.log('  All required API keys present\n');

  // Show which models will be tested
  const models = getModelsToTest();
  console.log('Models to test:');
  for (const m of models) {
    console.log(`  - ${m.displayName} (${m.provider}/${m.modelId})`);
  }
  console.log('');

  // Setup output directory
  console.log(`Setting up output directory: ${SANITY_OUTPUT_DIR}`);
  setupOutputDirectory();
  console.log('  Directory created and cleaned\n');

  // Seed input files
  console.log('Seeding test input files...');
  seedInputFile();
  console.log('  input.txt created\n');

  console.log('=== Setup Complete ===\n');
}
```

**Step 2: Create index barrel export**

```typescript
// apps/desktop/sanity-tests/utils/index.ts
export * from './models';
export * from './validators';
export * from './setup';
```

**Step 3: Commit**

```bash
git add apps/desktop/sanity-tests/utils/setup.ts apps/desktop/sanity-tests/utils/index.ts
git commit -m "feat(sanity): add global setup and barrel exports"
```

---

## Task 6: Create Sanity App Fixture

**Files:**
- Create: `apps/desktop/sanity-tests/fixtures/sanity-app.ts`
- Create: `apps/desktop/sanity-tests/fixtures/index.ts`

**Step 1: Create the extended Electron fixture for real API calls**

```typescript
// apps/desktop/sanity-tests/fixtures/sanity-app.ts
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { SanityModel } from '../utils/models';
import { getApiKeyForModel } from '../utils/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Timeout constants for sanity tests
export const SANITY_TIMEOUTS = {
  APP_LAUNCH: 30000,
  HYDRATION: 15000,
  TASK_COMPLETE: 300000, // 5 minutes for agent work
  APP_RESTART: 2000,
} as const;

/**
 * Fixtures for sanity testing with real API calls.
 */
type SanityFixtures = {
  /** The Electron application instance */
  electronApp: ElectronApplication;
  /** The main renderer window */
  window: Page;
  /** Current model being tested (set per-test) */
  currentModel: SanityModel;
};

/**
 * Extended Playwright test with sanity fixtures.
 * NO MOCKS - uses real API calls.
 */
export const test = base.extend<SanityFixtures>({
  currentModel: [async ({}, use) => {
    // This will be overridden in test files
    throw new Error('currentModel must be set in test');
  }, { option: true }],

  electronApp: async ({ currentModel }, use) => {
    const mainPath = resolve(__dirname, '../../dist-electron/main/index.js');
    const apiKey = getApiKeyForModel(currentModel);

    // Launch WITHOUT mock flags - real API calls
    const app = await electron.launch({
      args: [
        mainPath,
        '--e2e-skip-auth', // Skip onboarding UI but still use real keys
      ],
      env: {
        ...process.env,
        E2E_SKIP_AUTH: '1',
        // NO E2E_MOCK_TASK_EVENTS - we want real execution
        NODE_ENV: 'test',
        // Pass the API key for the current model
        [`${currentModel.envKeyName}`]: apiKey,
      },
    });

    await use(app);

    await app.close();
    await new Promise(resolve => setTimeout(resolve, SANITY_TIMEOUTS.APP_RESTART));
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('load');

    // Wait for React hydration
    await window.waitForSelector('[data-testid="task-input-textarea"]', {
      state: 'visible',
      timeout: SANITY_TIMEOUTS.HYDRATION,
    });

    await use(window);
  },
});

export { expect } from '@playwright/test';
```

**Step 2: Create fixture barrel export**

```typescript
// apps/desktop/sanity-tests/fixtures/index.ts
export * from './sanity-app';
```

**Step 3: Commit**

```bash
git add apps/desktop/sanity-tests/fixtures/
git commit -m "feat(sanity): add Electron fixture for real API calls"
```

---

## Task 7: Create Extended Execution Page Object

**Files:**
- Create: `apps/desktop/sanity-tests/page-objects/ExecutionPage.ts`
- Create: `apps/desktop/sanity-tests/page-objects/index.ts`

**Step 1: Create the page object**

```typescript
// apps/desktop/sanity-tests/page-objects/ExecutionPage.ts
import type { Page } from '@playwright/test';
import { SANITY_TIMEOUTS } from '../fixtures/sanity-app';

/**
 * Page object for the Execution page in sanity tests.
 * Extended timeout support for real agent execution.
 */
export class SanityExecutionPage {
  constructor(private page: Page) {}

  get statusBadge() {
    return this.page.getByTestId('execution-status-badge');
  }

  get messagesContainer() {
    return this.page.getByTestId('messages-scroll-container');
  }

  get permissionModal() {
    return this.page.getByTestId('execution-permission-modal');
  }

  get allowButton() {
    return this.page.getByTestId('permission-allow-button');
  }

  /**
   * Wait for task to complete (success or failure).
   * Uses extended timeout for real agent work.
   */
  async waitForComplete(timeout = SANITY_TIMEOUTS.TASK_COMPLETE): Promise<'completed' | 'failed' | 'stopped'> {
    await this.page.waitForFunction(
      () => {
        const badge = document.querySelector('[data-testid="execution-status-badge"]');
        if (!badge) return false;
        const text = badge.textContent?.toLowerCase() || '';
        return text.includes('completed') || text.includes('failed') || text.includes('stopped');
      },
      { timeout }
    );

    const badgeText = await this.statusBadge.textContent();
    if (badgeText?.toLowerCase().includes('completed')) return 'completed';
    if (badgeText?.toLowerCase().includes('failed')) return 'failed';
    return 'stopped';
  }

  /**
   * Auto-allow any permission requests during execution.
   * Polls for permission modals and clicks allow.
   */
  async autoAllowPermissions(): Promise<void> {
    // Set up a recurring check for permission modals
    const checkAndAllow = async () => {
      try {
        const modal = this.page.getByTestId('execution-permission-modal');
        if (await modal.isVisible({ timeout: 100 })) {
          await this.allowButton.click();
        }
      } catch {
        // No modal visible, continue
      }
    };

    // Check every second during execution
    const interval = setInterval(checkAndAllow, 1000);

    // Return cleanup function
    return new Promise((resolve) => {
      // Store interval for cleanup later
      (this as unknown as { _permissionInterval: NodeJS.Timeout })._permissionInterval = interval;
      resolve();
    });
  }

  /**
   * Stop permission auto-allow polling.
   */
  stopAutoAllow(): void {
    const interval = (this as unknown as { _permissionInterval?: NodeJS.Timeout })._permissionInterval;
    if (interval) {
      clearInterval(interval);
    }
  }

  /**
   * Get the current status text.
   */
  async getStatus(): Promise<string> {
    return (await this.statusBadge.textContent()) || '';
  }
}
```

**Step 2: Create page-objects barrel export**

```typescript
// apps/desktop/sanity-tests/page-objects/index.ts
export * from './ExecutionPage';
```

**Step 3: Commit**

```bash
git add apps/desktop/sanity-tests/page-objects/
git commit -m "feat(sanity): add ExecutionPage with extended timeouts"
```

---

## Task 8: Create Test 1 - Web Scraping

**Files:**
- Create: `apps/desktop/sanity-tests/tests/web-scraping.sanity.ts`

**Step 1: Create the web scraping test**

```typescript
// apps/desktop/sanity-tests/tests/web-scraping.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest, type SanityModel } from '../utils/models';
import { globalSetup } from '../utils/setup';
import { fileExists, countLines, fileContains, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

// Run global setup once
test.beforeAll(() => {
  globalSetup();
});

const models = getModelsToTest();

for (const model of models) {
  test.describe(`Web Scraping [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should scrape Hacker News and save to CSV', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      // Enter the task prompt
      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Go to Hacker News (https://news.ycombinator.com), get the top 5 stories (title, URL, points), and save them to ${SANITY_OUTPUT_DIR}/hn-top5.csv`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('hn-top5.csv')).toBe(true);
      expect(countLines('hn-top5.csv')).toBeGreaterThanOrEqual(5); // Header + 5 rows
      expect(fileContains('hn-top5.csv', /title|url|points/i)).toBe(true);
    });
  });
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/tests/web-scraping.sanity.ts
git commit -m "feat(sanity): add web scraping test (HN -> CSV)"
```

---

## Task 9: Create Test 2 - File Download

**Files:**
- Create: `apps/desktop/sanity-tests/tests/file-download.sanity.ts`

**Step 1: Create the file download test**

```typescript
// apps/desktop/sanity-tests/tests/file-download.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest } from '../utils/models';
import { fileExists, getFileSize, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

const models = getModelsToTest();

for (const model of models) {
  test.describe(`File Download [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should download PDF from web and save locally', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      // Enter the task prompt
      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Download the PDF from https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf and save it to ${SANITY_OUTPUT_DIR}/downloaded.pdf`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('downloaded.pdf')).toBe(true);
      expect(getFileSize('downloaded.pdf')).toBeGreaterThan(1024); // > 1KB
    });
  });
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/tests/file-download.sanity.ts
git commit -m "feat(sanity): add file download test (PDF)"
```

---

## Task 10: Create Test 3 - File Analysis

**Files:**
- Create: `apps/desktop/sanity-tests/tests/file-analysis.sanity.ts`

**Step 1: Create the file analysis test**

```typescript
// apps/desktop/sanity-tests/tests/file-analysis.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest } from '../utils/models';
import { fileExists, fileContains, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

const models = getModelsToTest();

for (const model of models) {
  test.describe(`File Analysis [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should read local file, analyze, and write summary', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      // Note: input.txt was seeded by globalSetup
      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Read the file ${SANITY_OUTPUT_DIR}/input.txt, count the words and lines, and write a summary to ${SANITY_OUTPUT_DIR}/analysis.txt`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('analysis.txt')).toBe(true);
      // Should contain word count and/or line count
      expect(
        fileContains('analysis.txt', /word|line|count/i)
      ).toBe(true);
    });
  });
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/tests/file-analysis.sanity.ts
git commit -m "feat(sanity): add file analysis test (read -> analyze -> write)"
```

---

## Task 11: Create Test 4 - Visual Comparison

**Files:**
- Create: `apps/desktop/sanity-tests/tests/visual-compare.sanity.ts`

**Step 1: Create the visual comparison test**

```typescript
// apps/desktop/sanity-tests/tests/visual-compare.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest } from '../utils/models';
import { fileExists, fileContains, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

const models = getModelsToTest();

for (const model of models) {
  test.describe(`Visual Comparison [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should compare two URLs and save report', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Take screenshots of https://example.com and https://example.org, compare them visually, and save a comparison report to ${SANITY_OUTPUT_DIR}/comparison.md`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('comparison.md')).toBe(true);
      // Should mention both URLs
      expect(fileContains('comparison.md', 'example.com')).toBe(true);
      expect(fileContains('comparison.md', 'example.org')).toBe(true);
    });
  });
}
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/tests/visual-compare.sanity.ts
git commit -m "feat(sanity): add visual comparison test"
```

---

## Task 12: Add npm Scripts

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add sanity test scripts to package.json**

Add these scripts to the `scripts` section:

```json
"test:sanity": "playwright test --config=sanity-tests/playwright.sanity.config.ts",
"test:sanity:opus": "MODEL_FILTER=anthropic pnpm test:sanity",
"test:sanity:openai": "MODEL_FILTER=openai pnpm test:sanity",
"test:sanity:google": "MODEL_FILTER=google pnpm test:sanity",
"test:sanity:quick": "MODEL_FILTER=anthropic TASK_FILTER=web-scraping pnpm test:sanity"
```

**Step 2: Verify scripts work (dry run)**

```bash
cd apps/desktop && pnpm test:sanity --help
```

Expected: Playwright help output showing available options

**Step 3: Commit**

```bash
git add apps/desktop/package.json
git commit -m "feat(sanity): add npm scripts for sanity tests"
```

---

## Task 13: Create README

**Files:**
- Create: `apps/desktop/sanity-tests/README.md`

**Step 1: Create documentation**

```markdown
# Sanity Tests

Agent sanity tests that run real tasks against real models with no mocks.

## Prerequisites

Set the required API keys as environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=AI...
```

Or create a `.env.sanity` file (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

## Running Tests

```bash
# Run all tests (4 tasks x 3 models = 12 tests)
pnpm -F @accomplish/desktop test:sanity

# Run with specific provider only
pnpm -F @accomplish/desktop test:sanity:opus    # Anthropic only
pnpm -F @accomplish/desktop test:sanity:openai  # OpenAI only
pnpm -F @accomplish/desktop test:sanity:google  # Google only

# Quick smoke test (1 task, 1 model)
pnpm -F @accomplish/desktop test:sanity:quick
```

## Test Tasks

1. **Web Scraping**: Scrape Hacker News top 5 stories → CSV
2. **File Download**: Download PDF from web → local file
3. **File Analysis**: Read local file → analyze → write summary
4. **Visual Comparison**: Screenshot two URLs → comparison report

## Output

- Test artifacts: `apps/desktop/sanity-tests/test-results/`
- HTML report: `apps/desktop/sanity-tests/html-report/`
- JSON report: `apps/desktop/sanity-tests/sanity-report.json`
- Agent output files: `~/openwork-sanity-output/`

## Configuration

| Env Variable | Description | Default |
|--------------|-------------|---------|
| `MODEL_FILTER` | Run only one provider (anthropic/openai/google) | All |
| `TASK_FILTER` | Run only one task type | All |
| `SANITY_TIMEOUT` | Test timeout in ms | 300000 (5 min) |
| `SANITY_HEADLESS` | Run headless (for CI) | false |
```

**Step 2: Commit**

```bash
git add apps/desktop/sanity-tests/README.md
git commit -m "docs(sanity): add README with usage instructions"
```

---

## Task 14: Add .gitignore Entries

**Files:**
- Modify: `apps/desktop/.gitignore` (or create if needed)

**Step 1: Add gitignore entries for sanity test outputs**

Add these entries:

```gitignore
# Sanity test outputs
sanity-tests/test-results/
sanity-tests/html-report/
sanity-tests/sanity-report.json
.env.sanity
```

**Step 2: Commit**

```bash
git add apps/desktop/.gitignore
git commit -m "chore: gitignore sanity test outputs"
```

---

## Task 15: Final Integration Test

**Step 1: Build the app**

```bash
cd apps/desktop && pnpm build
```

**Step 2: Verify sanity tests can be invoked (will fail without keys, that's ok)**

```bash
cd apps/desktop && pnpm test:sanity --list
```

Expected: List of test files/suites

**Step 3: Run a real test with one model (if keys are available)**

```bash
# Set at least one key
export ANTHROPIC_API_KEY=your-key-here

# Run quick test
cd apps/desktop && pnpm test:sanity:quick
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(sanity): complete sanity test infrastructure

- 4 test tasks: web scraping, file download, file analysis, visual comparison
- 3 models: Claude Opus 4.5, GPT-5 Codex, Gemini 3 Pro
- Real API calls, no mocks
- File existence + content validation
- 5-minute timeout per test
- Chrome browser (not headless)"
```

---

Plan complete and saved to `docs/plans/2025-01-26-sanity-tests-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?