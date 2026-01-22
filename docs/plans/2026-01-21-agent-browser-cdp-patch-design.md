# Agent-Browser CDP Patch Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Patch `agent-browser` to connect to our dev-browser's CDP endpoint instead of launching its own browser, preserving anti-detection while simplifying the codebase.

**Tech Stack:** agent-browser (npm), patch-package, dev-browser server (rebrowser-playwright), Electron

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenCode Agent                          │
│                                                             │
│   Bash: agent-browser open "https://google.com"            │
│   Bash: agent-browser snapshot -i                          │
│   Bash: agent-browser click @e1                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              agent-browser CLI (patched)                    │
│                                                             │
│   daemon.ts: Check AGENT_BROWSER_CDP_ENDPOINT env var      │
│   browser.ts: connectToCDP() instead of launch()           │
└─────────────────────┬───────────────────────────────────────┘
                      │ CDP WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   dev-browser server                        │
│                                                             │
│   rebrowser-playwright + system Chrome                     │
│   CDP on ws://localhost:9225                               │
│   Anti-detection enabled                                   │
└─────────────────────────────────────────────────────────────┘
```

**Key points:**
- dev-browser server stays unchanged (already exposes CDP on port 9225)
- agent-browser gets patched to connect via CDP instead of launching
- Environment variable `AGENT_BROWSER_CDP_ENDPOINT` controls the behavior
- Patches managed via `patch-package` for clean maintenance

---

## Task 1: Add patch-package Dependency

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1:** Add patch-package to devDependencies

```json
"patch-package": "^8.0.0"
```

**Step 2:** Update postinstall script to run patch-package

Change the postinstall script to include `patch-package` at the beginning:
```json
"postinstall": "patch-package && electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install"
```

**Step 3:** Install dependencies

Run: `cd apps/desktop && pnpm install`

**Step 4:** Verify patch-package installed

Run: `ls apps/desktop/node_modules/patch-package/`

---

## Task 2: Patch browser.ts - Add connectToCDP Method

**Files:**
- Modify: `apps/desktop/node_modules/agent-browser/src/browser.ts`

**Step 1:** Add connectToCDP method after the launch() method (around line 466)

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

**Step 2:** Verify the file is syntactically correct

Run: `cd apps/desktop && node -e "require('typescript').createProgram(['node_modules/agent-browser/src/browser.ts'], {}).getSemanticDiagnostics()"`

Or just check it compiles when we rebuild in Task 4.

---

## Task 3: Patch daemon.ts - Use CDP Endpoint if Available

**Files:**
- Modify: `apps/desktop/node_modules/agent-browser/src/daemon.ts`

**Step 1:** Modify the auto-launch logic in startDaemon() (around line 109)

Find this block:
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

---

## Task 4: Rebuild agent-browser and Create Patch

**Files:**
- Create: `apps/desktop/patches/agent-browser+0.1.3.patch`

**Step 1:** Rebuild agent-browser TypeScript

Run: `cd apps/desktop/node_modules/agent-browser && npm run build`

**Step 2:** Create the patch file

Run: `cd apps/desktop && npx patch-package agent-browser`

**Step 3:** Verify patch file created

Run: `cat apps/desktop/patches/agent-browser+0.1.3.patch | head -50`

**Step 4:** Commit the patch

```bash
git add apps/desktop/patches/
git commit -m "$(cat <<'EOF'
feat: patch agent-browser to support CDP connection

Add connectToCDP() method and AGENT_BROWSER_CDP_ENDPOINT env var support.
This allows agent-browser CLI to connect to our dev-browser server
instead of launching its own browser, preserving anti-detection.
EOF
)"
```

---

## Task 5: Update task-manager.ts - Set CDP Endpoint

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1:** Remove the connectAgentBrowser function (lines ~176-231)

Delete the entire `connectAgentBrowser()` function that was added previously.

**Step 2:** Remove the connectAgentBrowser call in ensureDevBrowserServer

Remove these lines (around line 311-313):
```typescript
// Connect agent-browser to the dev-browser CDP endpoint
console.log('[TaskManager] Connecting agent-browser to dev-browser...');
await connectAgentBrowser();
```

**Step 3:** Add CDP endpoint environment variable setup

In `ensureDevBrowserServer()`, after the server spawn is initiated (around line 245), add:

```typescript
// Set CDP endpoint for agent-browser CLI commands
// The agent runs commands via Bash which inherits this environment
process.env.AGENT_BROWSER_CDP_ENDPOINT = `ws://localhost:${DEV_BROWSER_PORT + 1}`;
console.log('[TaskManager] Set AGENT_BROWSER_CDP_ENDPOINT for agent-browser CLI');
```

Note: DEV_BROWSER_PORT is 9224 (HTTP), CDP is on 9225 (DEV_BROWSER_PORT + 1).

**Step 4:** Verify TypeScript compiles

Run: `cd apps/desktop && pnpm typecheck`

**Step 5:** Commit

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "$(cat <<'EOF'
refactor: use env var for agent-browser CDP connection

Replace connectAgentBrowser() function with simpler env var approach.
AGENT_BROWSER_CDP_ENDPOINT is inherited by Bash commands the agent runs.
EOF
)"
```

---

## Task 6: Update package.json Scripts

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1:** Ensure postinstall runs patch-package

The postinstall script should already be updated from Task 1. Verify it includes `patch-package &&` at the beginning.

**Step 2:** Commit if any changes

```bash
git add apps/desktop/package.json
git commit -m "$(cat <<'EOF'
build: add patch-package to postinstall

Ensures agent-browser patches are applied on install.
EOF
)"
```

---

## Task 7: Test the Integration

**Step 1:** Kill any running processes

Run: `pkill -f "electron" 2>/dev/null; pkill -f "vite" 2>/dev/null`

**Step 2:** Reinstall to apply patches

Run: `cd apps/desktop && pnpm install`

**Step 3:** Start dev mode with clean state

Run: `cd apps/desktop && CLEAN_START=1 pnpm dev`

**Step 4:** Test a browser task

In the app, run: "Go to google.com and search for 'hello world'"

Expected:
- Agent uses `agent-browser open`, `agent-browser snapshot`, `agent-browser fill`, etc.
- Chrome window appears (system Chrome via dev-browser, NOT new Playwright Chromium)
- No "Installing Playwright browsers" message

**Step 5:** Test anti-detection

Run task: "Go to https://bot-detector.rebrowser.net/ and tell me the results"

Expected: Should pass most/all bot detection tests.

---

## Task 8: Final Cleanup

**Step 1:** Run typecheck

Run: `cd apps/desktop && pnpm typecheck`

**Step 2:** Run lint

Run: `cd apps/desktop && pnpm lint`

**Step 3:** Verify git status

Run: `git status`

Expected: All changes committed, working tree clean.

---

## Summary of Changes

| File | Action |
|------|--------|
| `package.json` | Add patch-package, update postinstall |
| `patches/agent-browser+0.1.3.patch` | New - CDP connection patches |
| `task-manager.ts` | Remove connectAgentBrowser(), add env var |

## Rollback

To revert this migration:
```bash
rm -rf apps/desktop/patches/
# Remove patch-package from package.json postinstall
pnpm install  # Restores vanilla agent-browser
git revert <commits>
```
