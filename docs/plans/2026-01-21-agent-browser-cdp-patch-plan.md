# Agent-Browser CDP Patch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Patch agent-browser to connect to our dev-browser's CDP endpoint instead of launching its own browser, preserving anti-detection.

**Architecture:** Patch agent-browser's `browser.ts` with a `connectToCDP()` method and `daemon.ts` to check `AGENT_BROWSER_CDP_ENDPOINT` env var. Use `patch-package` to maintain patches cleanly. Set env var in task-manager.ts when dev-browser starts.

**Tech Stack:** agent-browser (npm), patch-package, playwright-core (connectOverCDP), dev-browser server (rebrowser-playwright)

---

## Task 1: Add patch-package Dependency

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add patch-package to devDependencies**

In `apps/desktop/package.json`, add to `devDependencies` (alphabetically):

```json
"patch-package": "^8.0.0",
```

**Step 2: Update postinstall script**

Change line 9 from:
```json
"postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install",
```

To:
```json
"postinstall": "patch-package && electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install",
```

**Step 3: Install dependencies**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && pnpm install`
Expected: patch-package installed, no errors

**Step 4: Verify patch-package installed**

Run: `ls /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/patch-package/`
Expected: Shows package contents (index.js, etc.)

**Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
build: add patch-package for agent-browser patches

Will be used to patch agent-browser to support CDP connection.
EOF
)"
```

---

## Task 2: Patch browser.ts - Add connectToCDP Method

**Files:**
- Modify: `apps/desktop/node_modules/agent-browser/src/browser.ts`

**Step 1: Read the current file to find insertion point**

Run: `grep -n "async close" /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/agent-browser/src/browser.ts`
Expected: Shows line number for close() method (should be around line 598)

**Step 2: Add connectToCDP method before close() method**

Insert the following method before the `close()` method:

```typescript
  /**
   * Connect to an existing browser via CDP endpoint
   * Used when connecting to an external browser (e.g., dev-browser with anti-detection)
   */
  async connectToCDP(wsEndpoint: string): Promise<void> {
    if (this.browser) {
      return;
    }

    try {
      // Connect to existing browser via CDP
      this.browser = await chromium.connectOverCDP(wsEndpoint);
    } catch (error) {
      throw new Error(
        `Failed to connect to CDP endpoint ${wsEndpoint}. ` +
        `Ensure dev-browser server is running. Original error: ${error}`
      );
    }

    // Get existing contexts and pages
    const contexts = this.browser.contexts();
    if (contexts.length > 0) {
      this.contexts.push(contexts[0]);
      const pages = contexts[0].pages();
      if (pages.length > 0) {
        this.pages.push(pages[0]);
        this.setupPageTracking(pages[0]);
      } else {
        // No existing page, create one
        const page = await contexts[0].newPage();
        this.pages.push(page);
        this.setupPageTracking(page);
      }
    } else {
      // No existing context, create one
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      context.setDefaultTimeout(10000);
      this.contexts.push(context);
      const page = await context.newPage();
      this.pages.push(page);
      this.setupPageTracking(page);
    }

    this.activePageIndex = 0;
  }

```

**Step 3: Verify syntax by checking TypeScript**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/agent-browser && npx tsc --noEmit src/browser.ts 2>&1 | head -20`
Expected: No errors (or only unrelated warnings)

---

## Task 3: Patch daemon.ts - Use CDP Endpoint if Available

**Files:**
- Modify: `apps/desktop/node_modules/agent-browser/src/daemon.ts`

**Step 1: Read current auto-launch logic**

Run: `grep -n -A5 "Auto-launch browser" /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/agent-browser/src/daemon.ts`
Expected: Shows the auto-launch block around line 108-115

**Step 2: Replace the auto-launch block**

Find this block (around lines 108-115):
```typescript
          // Auto-launch browser if not already launched and this isn't a launch command
          if (
            !browser.isLaunched() &&
            parseResult.command.action !== 'launch' &&
            parseResult.command.action !== 'close'
          ) {
            await browser.launch({ id: 'auto', action: 'launch', headless: true });
          }
```

Replace with:
```typescript
          // Auto-launch browser if not already launched and this isn't a launch command
          if (
            !browser.isLaunched() &&
            parseResult.command.action !== 'launch' &&
            parseResult.command.action !== 'close'
          ) {
            // Check for external CDP endpoint (e.g., dev-browser with anti-detection)
            const cdpEndpoint = process.env.AGENT_BROWSER_CDP_ENDPOINT;
            if (cdpEndpoint) {
              await browser.connectToCDP(cdpEndpoint);
            } else {
              await browser.launch({ id: 'auto', action: 'launch', headless: true });
            }
          }
```

**Step 3: Verify syntax**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/agent-browser && npx tsc --noEmit src/daemon.ts 2>&1 | head -20`
Expected: No errors

---

## Task 4: Rebuild agent-browser and Create Patch

**Files:**
- Create: `apps/desktop/patches/agent-browser+0.1.3.patch`

**Step 1: Rebuild agent-browser TypeScript**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/node_modules/agent-browser && npm run build`
Expected: Build completes successfully

**Step 2: Create patches directory**

Run: `mkdir -p /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/patches`

**Step 3: Create the patch file**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && npx patch-package agent-browser`
Expected: Creates `patches/agent-browser+0.1.3.patch`

**Step 4: Verify patch file created**

Run: `head -50 /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop/patches/agent-browser+0.1.3.patch`
Expected: Shows diff with connectToCDP additions

**Step 5: Commit the patch**

```bash
git add apps/desktop/patches/
git commit -m "$(cat <<'EOF'
feat: patch agent-browser to support CDP connection

Add connectToCDP() method to browser.ts and check AGENT_BROWSER_CDP_ENDPOINT
env var in daemon.ts. This allows agent-browser CLI to connect to our
dev-browser server instead of launching its own browser.
EOF
)"
```

---

## Task 5: Update task-manager.ts - Set CDP Endpoint

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1: Find and remove connectAgentBrowser function**

The function starts around line 176. Delete the entire function (approximately lines 176-231):

```typescript
/**
 * Connect agent-browser CLI to the dev-browser CDP endpoint.
 * This allows agent-browser commands to use our anti-detection browser.
 */
async function connectAgentBrowser(): Promise<void> {
  // ... entire function body ...
}
```

**Step 2: Remove the connectAgentBrowser call**

Find and delete these lines in `ensureDevBrowserServer()` (around lines 253-255):

```typescript
    // Connect agent-browser to the dev-browser CDP endpoint
    console.log('[TaskManager] Connecting agent-browser to dev-browser...');
    await connectAgentBrowser();
```

**Step 3: Add CDP endpoint environment variable**

In `ensureDevBrowserServer()`, after the server spawn (around line 245, after `child.unref();`), add:

```typescript
    // Set CDP endpoint for agent-browser CLI commands
    // The agent runs commands via Bash which inherits this environment
    // DEV_BROWSER_PORT is HTTP (9224), CDP is on port 9225
    process.env.AGENT_BROWSER_CDP_ENDPOINT = `ws://localhost:${DEV_BROWSER_PORT + 1}`;
    console.log('[TaskManager] Set AGENT_BROWSER_CDP_ENDPOINT for agent-browser CLI');
```

**Step 4: Verify TypeScript compiles**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "$(cat <<'EOF'
refactor: use env var for agent-browser CDP connection

Replace connectAgentBrowser() function with simpler env var approach.
AGENT_BROWSER_CDP_ENDPOINT is set when dev-browser starts and inherited
by Bash commands the agent runs.
EOF
)"
```

---

## Task 6: Test the Integration

**Step 1: Kill any running processes**

Run: `pkill -f "electron" 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 2`

**Step 2: Reinstall to apply patches**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && pnpm install`
Expected: See "patch-package" output applying patches

**Step 3: Start dev mode with clean state**

Run in background: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && CLEAN_START=1 pnpm dev`

**Step 4: Wait for app to start**

Wait 15 seconds, then check output for:
- `[Clean Mode] Successfully cleared userData`
- `[Main] Electron app ready`

**Step 5: Manual test**

In the app, run a browser task: "Go to google.com"

Expected:
- Agent uses `agent-browser open "https://google.com"`
- System Chrome window appears (NOT new Playwright Chromium)
- No "Installing Playwright browsers" message
- Page loads successfully

---

## Task 7: Final Verification

**Step 1: Run typecheck**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && pnpm typecheck`
Expected: No errors

**Step 2: Run lint**

Run: `cd /Users/danielscharfstein/openwork.use-agent-browser-instead-of-dev-browser/apps/desktop && pnpm lint`
Expected: No errors

**Step 3: Verify git status**

Run: `git status`
Expected: Working tree clean, all changes committed

---

## Summary of Changes

| File | Action |
|------|--------|
| `package.json` | Add patch-package to devDependencies and postinstall |
| `patches/agent-browser+0.1.3.patch` | New - CDP connection patches |
| `task-manager.ts` | Remove connectAgentBrowser(), add env var setup |

## Rollback

To revert:
```bash
rm -rf apps/desktop/patches/
# Remove "patch-package &&" from postinstall in package.json
pnpm install
git revert <commits>
```
