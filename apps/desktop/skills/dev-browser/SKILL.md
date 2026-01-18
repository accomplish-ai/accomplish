---
name: dev-browser
description: Browser automation with persistent page state. Use when users ask to navigate websites, fill forms, take screenshots, extract web data, test web apps, or automate browser workflows. Trigger phrases include "go to [url]", "click on", "fill out the form", "take a screenshot", "scrape", "automate", "test the website", "log into", or any browser interaction request.
---

# Dev Browser Skill

Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally. Once you've proven out part of a workflow and there is repeated work to be done, you can write a script to do the repeated work in a single execution.

<critical-requirement>
##############################################################################
# MANDATORY: Browser scripts must use .mts extension to enable ESM mode.
# tsx treats .mts files as ES modules, enabling top-level await.
#
# CORRECT (always do this - two steps):
#   1. Write script to temp file with .mts extension:
#      cat > /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
#      import { connect } from "@/client.js";
#      ...
#      EOF
#
#   2. Run from dev-browser directory with bundled Node:
#      cd {{SKILLS_PATH}}/dev-browser && PATH="${NODE_BIN_PATH}:$PATH" npx tsx /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts
#
# WRONG (will fail - .ts files in /tmp default to CJS mode):
#   cat > /tmp/script.ts <<'EOF'
#   import { connect } from "@/client.js";  # Top-level await won't work!
#   EOF
#
# ALWAYS use .mts extension for temp scripts!
##############################################################################
</critical-requirement>

## Choosing Your Approach

- **Local/source-available sites**: Read the source code first to write selectors directly
- **Unknown page layouts**: Use `getAISnapshot()` to discover elements and `selectSnapshotRef()` to interact with them
- **Visual feedback**: Take screenshots to see what the user sees

## Setup

The dev-browser server is automatically started when you begin a task. Before your first browser script, verify it's ready:

```bash
curl -s http://localhost:9224
```

If it returns JSON with a `wsEndpoint`, proceed with browser automation. If connection is refused, the server is still starting - wait 2-3 seconds and check again.

**Fallback** (only if server isn't running after multiple checks):
```bash
cd {{SKILLS_PATH}}/dev-browser && PATH="${NODE_BIN_PATH}:$PATH" ./server.sh &
```

### Standalone Mode (Default)

Launches a new Chromium browser for fresh automation sessions.

```bash
{{SKILLS_PATH}}/dev-browser/server.sh &
```

Add `--headless` flag if user requests it. **Wait for the `Ready` message before running scripts.**

### Extension Mode

Connects to user's existing Chrome browser. Use this when:

- The user is already logged into sites and wants you to do things behind an authed experience that isn't local dev.
- The user asks you to use the extension

**Important**: The core flow is still the same. You create named pages inside of their browser.

**Start the relay server:**

```bash
cd {{SKILLS_PATH}}/dev-browser && npm i && npm run start-extension &
```

Wait for `Waiting for extension to connect...` followed by `Extension connected` in the console. To know that a client has connected and the browser is ready to be controlled.

**Workflow:**

1. Scripts call `client.page("name")` just like the normal mode to create new pages / connect to existing ones.
2. Automation runs on the user's actual browser session

If the extension hasn't connected yet, tell the user to launch and activate it. Download link: https://github.com/SawyerHood/dev-browser/releases

## Writing Scripts

> **Run all scripts from `{{SKILLS_PATH}}/dev-browser/` directory.** The `@/` import alias requires this directory's config.

Write scripts to /tmp with .mts extension, then execute from dev-browser directory:

```bash
cat > /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();
const page = await client.page(`${taskId}-main`);

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
cd {{SKILLS_PATH}}/dev-browser && PATH="${NODE_BIN_PATH}:$PATH" npx tsx /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts
```

**Write to `tmp/` files only when** the script needs reuse, is complex, or user explicitly requests it.

### Key Principles

1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Task-scoped page names**: ALWAYS prefix page names with the task ID from environment:
   ```typescript
   const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
   const page = await client.page(`${taskId}-main`);
   ```
   This ensures parallel tasks don't interfere with each other's browser pages.
4. **Task-scoped screenshot filenames**: ALWAYS prefix screenshot filenames with taskId to prevent parallel tasks from overwriting each other's screenshots:
   ```typescript
   await page.screenshot({ path: `tmp/${taskId}-screenshot.png` });
   ```
5. **Disconnect to exit**: `await client.disconnect()` - pages persist on server
6. **Plain JS in evaluate**: `page.evaluate()` runs in browser - no TypeScript syntax

## Workflow Loop

Follow this pattern for complex tasks:

1. **Write a script** to perform one action
2. **Run it** and observe the output
3. **Evaluate** - did it work? What's the current state?
4. **Decide** - is the task complete or do we need another script?
5. **Repeat** until task is done

### No TypeScript in Browser Context

Code passed to `page.evaluate()` runs in the browser, which doesn't understand TypeScript:

```typescript
// ✅ Correct: plain JavaScript
const text = await page.evaluate(() => {
  return document.body.innerText;
});

// ❌ Wrong: TypeScript syntax will fail at runtime
const text = await page.evaluate(() => {
  const el: HTMLElement = document.body; // Type annotation breaks in browser!
  return el.innerText;
});
```

## Scraping Data

For scraping large datasets, intercept and replay network requests rather than scrolling the DOM. See [references/scraping.md](references/scraping.md) for the complete guide covering request capture, schema discovery, and paginated API replay.

## Client API

```typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();

const page = await client.page(`${taskId}-main`); // Get or create named page
const pageWithSize = await client.page(`${taskId}-main`, { viewport: { width: 1920, height: 1080 } });

const pages = await client.list(); // List all page names
await client.close(`${taskId}-main`); // Close a page
await client.disconnect(); // Disconnect (pages persist)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot(`${taskId}-main`); // Get accessibility tree
const element = await client.selectSnapshotRef(`${taskId}-main`, "e5"); // Get element by ref
```

The `page` object is a standard Playwright Page.

## Waiting

```typescript
import { waitForPageLoad } from "@/client.js";

await waitForPageLoad(page); // After navigation
await page.waitForSelector(".results"); // For specific elements
await page.waitForURL("**/success"); // For specific URL
```

## Inspecting Page State

### Screenshots

IMPORTANT: Always prefix screenshot filenames with taskId to avoid collisions with parallel tasks:

```typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
await page.screenshot({ path: `tmp/${taskId}-screenshot.png` });
await page.screenshot({ path: `tmp/${taskId}-full.png`, fullPage: true });
```

### ARIA Snapshot (Element Discovery)

Use `getAISnapshot()` to discover page elements. Returns YAML-formatted accessibility tree:

```yaml
- banner:
  - link "Hacker News" [ref=e1]
  - navigation:
    - link "new" [ref=e2]
- main:
  - list:
    - listitem:
      - link "Article Title" [ref=e8]
      - link "328 comments" [ref=e9]
- contentinfo:
  - textbox [ref=e10]
    - /placeholder: "Search"
```

**Interpreting refs:**

- `[ref=eN]` - Element reference for interaction (visible, clickable elements only)
- `[checked]`, `[disabled]`, `[expanded]` - Element states
- `[level=N]` - Heading level
- `/url:`, `/placeholder:` - Element properties

**Interacting with refs:**

```typescript
const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const snapshot = await client.getAISnapshot(`${taskId}-main`);
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef(`${taskId}-main`, "e2");
await element.click();
```

## Error Recovery

Page state persists after failures. Debug by reconnecting and taking a screenshot:

```bash
cat > /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts <<'EOF'
import { connect } from "@/client.js";

const taskId = process.env.ACCOMPLISH_TASK_ID || 'default';
const client = await connect();
const page = await client.page(`${taskId}-main`);

await page.screenshot({ path: `tmp/${taskId}-debug.png` });
console.log({ url: page.url(), title: await page.title() });

await client.disconnect();
EOF
cd {{SKILLS_PATH}}/dev-browser && PATH="${NODE_BIN_PATH}:$PATH" npx tsx /tmp/accomplish-${ACCOMPLISH_TASK_ID:-default}.mts
```

## Login Pages

When you encounter a login page (e.g., Google Sign-In, OAuth screens, authentication prompts):
- Do NOT say you cannot log in or suggest alternative approaches
- Instead, ASK the user to log in manually in the browser window
- Take a screenshot to show the user the login page
- Say something like: "I've reached a login page. Please log in to your account in the browser window, then let me know when you're done."
- WAIT for the user to confirm they've logged in before continuing
- After the user confirms login, take another screenshot to verify you're past the login screen
- Then continue with the original task

This interactive login flow is essential because:
- Users expect to authenticate themselves for security
- Many services require human verification (CAPTCHAs, 2FA)
- The agent should not give up on tasks that require authentication

IMPORTANT: After login is complete, resume autonomous execution of the original task.
Do NOT wait for confirmation for non-login navigation or page loads.

## Filesystem

For saving/downloading content:
- Use browser's native download (click download buttons, Save As)
- Chrome handles downloads with its own permissions
- For text/data, copy to clipboard so users can paste where they want
