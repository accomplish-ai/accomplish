# Tab Switching Solution

## Problem

When clicking links that open new tabs, the agent would:
1. Detect the new tab correctly with `browser_tab(action="list")`
2. Switch to it with `browser_switch_tab(index=N)`
3. But then `browser_snapshot()` would return content from the **old tab**

### Root Cause

The dev-browser server's `/pages` endpoint ignores the `targetId` parameter when updating page mappings:

```typescript
// dev-browser server (POST /pages)
const { name, viewport } = body;  // <-- Only extracts name and viewport, NOT targetId!

let entry = registry.get(name);
if (!entry) {
  // Create new page...
}
// Returns existing page for that name - never updates the mapping
```

So when `browser_switch_tab` tried to tell the server "this task now uses a different page", the server ignored it and kept returning the original page.

## Solution

Instead of relying on the dev-browser server to track which page is active, we maintain our own `activePageOverride` variable in agent-browser-mcp.

### Code Changes

#### 1. Added `activePageOverride` variable

```typescript
// Active page override (for tab switching - dev-browser server doesn't support updating page mapping)
let activePageOverride: Page | null = null;
```

#### 2. Updated `getPage()` to check override first

```typescript
async function getPage(pageName?: string): Promise<Page> {
  // If we have an active page override from tab switching, use it (if still valid)
  if (activePageOverride) {
    try {
      // Check if the page is still connected
      if (!activePageOverride.isClosed()) {
        return activePageOverride;
      }
    } catch {
      // Page is invalid, clear the override
    }
    activePageOverride = null;
    currentFrame = null; // Also reset frame when page changes
  }

  // ... rest of original getPage() logic (query dev-browser server)
}
```

#### 3. Updated `browser_switch_tab` to set the override

```typescript
case 'browser_switch_tab': {
  const { index } = args as any;
  const context = page.context();
  const pages = context.pages();

  if (index === undefined || index < 0 || index >= pages.length) {
    throw new Error(`Invalid tab index: ${index}. Available tabs: 0-${pages.length - 1}`);
  }
  const targetPage = pages[index];
  await targetPage.bringToFront();

  // Set the active page override so subsequent calls use this page
  activePageOverride = targetPage;
  currentFrame = null; // Reset frame context when switching pages

  // Setup listeners on the new page
  setupPageListeners(targetPage);

  return { content: [{ type: 'text', text: `Switched to tab ${index}: ${targetPage.url()}\n\nNow use browser_snapshot() to see the content of this tab.` }] };
}
```

### Tool Changes

Added a dedicated `browser_switch_tab` tool (separate from `browser_tab`) to make the action more explicit:

```typescript
{
  name: 'browser_switch_tab',
  description: 'Switch to a different browser tab by index. ALWAYS use this after browser_tab(action="list") shows multiple tabs!',
  inputSchema: {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Tab index to switch to (from browser_tab list)' },
    },
    required: ['index'],
  },
}
```

### Helpful Hints in Responses

When `browser_tab(action="list")` returns multiple tabs:
```
Multiple tabs detected! Use browser_switch_tab(index=N) to switch to another tab.
```

When `browser_switch_tab` completes:
```
Switched to tab 1: https://example.com

Now use browser_snapshot() to see the content of this tab.
```

## SKILL.md Documentation

Added to `apps/desktop/skills/agent-browser-mcp/SKILL.md`:

```markdown
## CRITICAL: Tab Awareness After Clicks

**ALWAYS check for new tabs after clicking links or buttons.**

Many websites open content in new tabs. If you click something and the page seems unchanged or you can't find expected content, a new tab likely opened.

**Workflow after clicking:**
1. `browser_click(ref="e5")` - Click the element
2. `browser_tab(action="list")` - Check if new tabs opened
3. If new tab exists: `browser_switch_tab(index=N)` - Switch to it
4. `browser_snapshot()` - Get content from correct tab

**Example:**

# Click a link that might open new tab
browser_click(ref="e3")

# Check tabs - ALWAYS do this after clicking!
browser_tab(action="list")
# Output: [{ index: 0, url: "original.com", active: true },
#          { index: 1, url: "newpage.com", active: false }]
#
# Multiple tabs detected! Use browser_switch_tab(index=N) to switch to another tab.

# New tab opened! Switch to it
browser_switch_tab(index=1)
# Output: Switched to tab 1: newpage.com
#
# Now use browser_snapshot() to see the content of this tab.

# Now snapshot the new tab
browser_snapshot()

**Signs you might be on the wrong tab:**
- Page content hasn't changed after clicking a link
- Expected elements not found in snapshot
- URL is still the old URL after navigation

**When to check tabs:**
- After clicking any link
- After clicking "Open", "View", "Details" buttons
- After clicking external links
- When page content doesn't match expectations
```

## Files Modified

1. `apps/desktop/skills/agent-browser-mcp/src/index.ts` - Added `activePageOverride`, updated `getPage()`, updated `browser_switch_tab`
2. `apps/desktop/skills/agent-browser-mcp/SKILL.md` - Added tab awareness documentation
3. `apps/desktop/src/main/opencode/config-generator.ts` - Added `browser_switch_tab` to tools list
