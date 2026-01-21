# Tab Switching Fix Design

## Problem

When clicking links that open new tabs, the agent:
1. Detects the new tab correctly with `browser_tabs(action="list")`
2. Switches to it with `browser_tabs(action="switch", index=N)`
3. But then `browser_snapshot()` returns content from the **old tab**

### Root Cause

The `getPage()` function in `dev-browser-mcp/src/index.ts` always queries the dev-browser server by page name, which returns the original page. The `browser_tabs` switch action calls `bringToFront()` but doesn't update any state that tells `getPage()` to use the new page.

## Solution

Add an `activePageOverride` variable in the MCP server that `getPage()` checks first before querying the dev-browser server. When `browser_tabs(action="switch")` is called, it sets this override.

## Implementation

### File 1: `apps/desktop/skills/dev-browser-mcp/src/index.ts`

#### 1. Add state variable (near line 35, with other browser state)

```typescript
// Active page override for tab switching (dev-browser server doesn't track this)
let activePageOverride: Page | null = null;
```

#### 2. Modify `getPage()` to check override first (around line 154)

```typescript
async function getPage(pageName?: string): Promise<Page> {
  // If we have an active page override from tab switching, use it
  if (activePageOverride) {
    if (!activePageOverride.isClosed()) {
      return activePageOverride;
    }
    // Page closed, clear override
    activePageOverride = null;
  }
  // ... rest of existing getPage() logic unchanged
}
```

#### 3. Update `browser_tabs` switch action (around line 2766)

```typescript
const targetPage = allPages[index]!;
await targetPage.bringToFront();
activePageOverride = targetPage;  // Set the override
return {
  content: [{ type: 'text', text: `Switched to tab ${index}: ${targetPage.url()}\n\nNow use browser_snapshot() to see the content of this tab.` }],
};
```

#### 4. Update `browser_tabs` list action to add hint (around line 2744)

When multiple tabs are detected, append a helpful hint:

```typescript
if (action === 'list') {
  const allPages = b.contexts().flatMap((ctx) => ctx.pages());
  const pageList = allPages.map((p, i) => `${i}: ${p.url()}`).join('\n');
  let output = `Open tabs (${allPages.length}):\n${pageList}`;
  if (allPages.length > 1) {
    output += `\n\nMultiple tabs detected! Use browser_tabs(action="switch", index=N) to switch to another tab.`;
  }
  return {
    content: [{ type: 'text', text: output }],
  };
}
```

### File 2: `apps/desktop/skills/dev-browser/SKILL.md`

Add the following section after the "## Workflow" section:

```markdown
## CRITICAL: Tab Awareness After Clicks

**ALWAYS check for new tabs after clicking links or buttons.**

Many websites open content in new tabs. If you click something and the page seems unchanged, a new tab likely opened.

**Workflow after clicking:**
1. `browser_click(ref="e5")` - Click the element
2. `browser_tabs(action="list")` - Check if new tabs opened
3. If new tab exists: `browser_tabs(action="switch", index=N)` - Switch to it
4. `browser_snapshot()` - Get content from correct tab

**Example:**

```
# Click a link that might open new tab
browser_click(ref="e3")

# Check tabs - ALWAYS do this after clicking!
browser_tabs(action="list")
# Output: Open tabs (2):
# 0: https://original.com
# 1: https://newpage.com
#
# Multiple tabs detected! Use browser_tabs(action="switch", index=N) to switch to another tab.

# New tab opened! Switch to it
browser_tabs(action="switch", index=1)
# Output: Switched to tab 1: https://newpage.com
#
# Now use browser_snapshot() to see the content of this tab.

# Now snapshot the new tab
browser_snapshot()
```

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

1. `apps/desktop/skills/dev-browser-mcp/src/index.ts` - Add `activePageOverride`, update `getPage()`, update `browser_tabs`
2. `apps/desktop/skills/dev-browser/SKILL.md` - Add tab awareness documentation
