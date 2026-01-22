# Agent-Browser Task Isolation Design

**Date:** 2026-01-21
**Status:** Approved

## Problem

Multiple concurrent tasks share one agent-browser daemon, causing them to fight over the same browser tab. When Task A navigates to google.com and Task B navigates to facebook.com, they overwrite each other's work.

## Solution

Use agent-browser's built-in session support combined with a modified `connectToCDP()` that creates dedicated pages per task.

### Architecture

```
Task A (taskId: task_123)          Task B (taskId: task_456)
         |                                  |
         v                                  v
  AGENT_BROWSER_SESSION=task_123    AGENT_BROWSER_SESSION=task_456
         |                                  |
         v                                  v
   Daemon A (socket: task_123)       Daemon B (socket: task_456)
         |                                  |
         +------ connectToCDP() ------------+
                      |
                      v
              Shared Browser Context
             (cookies, login state)
                /            \
               v              v
           Page A          Page B
        (Task 123)       (Task 456)
```

### Key Behaviors

1. **Shared context** - All tasks share one browser context (cookies, login state preserved)
2. **Separate pages** - Each task gets its own dedicated page/tab
3. **Session isolation** - Each task's daemon runs independently via socket path
4. **Pages persist** - Tabs stay open after task completes so users can review

## Changes Required

### 1. task-manager.ts

Set `AGENT_BROWSER_SESSION` environment variable to task ID before spawning:

```typescript
// In ensureDevBrowserServer() or before spawning OpenCode CLI
process.env.AGENT_BROWSER_SESSION = taskId;
```

### 2. Patch browser.ts - connectToCDP()

Modify the existing patch to always create a new page instead of reusing existing ones:

```typescript
async connectToCDP(wsEndpoint: string): Promise<void> {
  if (this.browser) {
    return;
  }

  try {
    this.browser = await chromium.connectOverCDP(wsEndpoint);
  } catch (error) {
    throw new Error(
      `Failed to connect to CDP endpoint ${wsEndpoint}. ` +
      `Ensure dev-browser server is running. Original error: ${error}`
    );
  }

  // Get existing context (preserves cookies/login) or create new one
  const contexts = this.browser.contexts();
  let context: BrowserContext;

  if (contexts.length > 0) {
    context = contexts[0];
  } else {
    context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    context.setDefaultTimeout(10000);
  }
  this.contexts.push(context);

  // ALWAYS create a new page for this session (task isolation)
  const page = await context.newPage();
  this.pages.push(page);
  this.setupPageTracking(page);
  this.activePageIndex = 0;
}
```

### 3. Update pnpm patch

After modifying node_modules, regenerate the patch file.

## Testing

1. Start app with `pnpm dev`
2. Run two browser tasks concurrently (e.g., "go to google.com" and "go to facebook.com")
3. Verify each task operates in its own tab
4. Verify both tabs remain open after tasks complete
5. Verify login state is shared (log into a site in one task, should be logged in for next task)

## Rollback

Revert the patch changes and remove `AGENT_BROWSER_SESSION` from task-manager.ts.
