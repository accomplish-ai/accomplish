---
name: dev-browser
description: Browser automation via MCP tools. ALWAYS use these tools for ANY web task - navigating sites, clicking, typing, filling forms, taking screenshots, or extracting data. This is the ONLY way to control the browser.
---

# Dev Browser

Browser automation using MCP tools. Use these tools directly for all web automation tasks.

## CRITICAL: No Shell Commands for Browser

**NEVER use bash/shell commands to open browsers or URLs.** This includes:
- `open` (macOS)
- `xdg-open` (Linux)
- `start` (Windows)
- Python `subprocess`, `webbrowser`, or similar
- Any script that launches a browser process

Shell commands open the user's **default browser** (Safari, Arc, Firefox, etc.), not the automation-controlled Chrome instance. This breaks the workflow because you cannot interact with pages opened via shell commands.

**ALL browser automation MUST use the browser_* MCP tools below.**

## Tools

**browser_navigate(url, page_name?)** - Navigate to a URL
- url: The URL to visit (e.g., "google.com" or "https://example.com")
- page_name: Optional name for the page (default: "main")

**browser_snapshot(page_name?, interactive_only?)** - Get the page's accessibility tree
- Returns YAML with element refs like [ref=e5]
- Use these refs with browser_click and browser_type
- **interactive_only=true**: Show only clickable/typeable elements (recommended!)

**browser_click(x?, y?, ref?, selector?, page_name?)** - Click on the page
- x, y: Pixel coordinates (default method)
- ref: Element ref from browser_snapshot (alternative)
- selector: CSS selector (alternative)

**browser_type(ref?, selector?, text, press_enter?, page_name?)** - Type into an input
- ref: Element ref from browser_snapshot (preferred)
- selector: CSS selector as fallback
- text: The text to type
- press_enter: Set to true to press Enter after typing

**browser_screenshot(page_name?, full_page?)** - Take a screenshot
- Returns the image for visual inspection
- full_page: Set to true for full scrollable page

**browser_evaluate(script, page_name?)** - Run custom JavaScript
- script: Plain JavaScript code (no TypeScript)

**browser_pages(action, page_name?)** - Manage pages
- action: "list" to see all pages, "close" to close a page

**browser_keyboard(text?, key?, page_name?)** - Type to the focused element
- text: Text to type (uses real keyboard events)
- key: Special key like "Enter", "Tab", "Escape", or combos like "Control+a"
- USE THIS for complex editors like Google Docs, Monaco, etc. that don't have simple input refs
- Workflow: first click to focus the editor area, then use browser_keyboard to type

**browser_sequence(actions, page_name?)** - Execute multiple actions efficiently
- actions: Array of {action, ref?, selector?, x?, y?, text?, press_enter?, timeout?}
- Supported actions: "click", "type", "snapshot", "screenshot", "wait"
- Use for multi-step operations like form filling

**browser_get_text(ref?, selector?, page_name?)** - Get text content of element
- Returns the text content of the element
- Use to verify text was entered or content appeared

**browser_is_visible(ref?, selector?, page_name?)** - Check if element is visible
- Returns true/false
- Use to verify elements appeared after actions

**browser_is_enabled(ref?, selector?, page_name?)** - Check if element is enabled
- Returns true/false
- Use to verify buttons/inputs are clickable

**browser_is_checked(ref?, selector?, page_name?)** - Check if checkbox/radio is checked
- Returns true/false
- Use to verify form state

## Workflow

1. **Navigate**: `browser_navigate("google.com")`
2. **Discover elements**: `browser_snapshot()` - find refs like [ref=e5]
3. **Interact**: `browser_click(ref="e5")` or `browser_type(ref="e3", text="search query", press_enter=true)`
4. **Verify**: `browser_screenshot()` to see the result

## CRITICAL: Verification-Driven Workflow

**After EVERY action, verify it succeeded before proceeding:**

1. **Navigate** → Take snapshot to confirm page loaded
2. **Click** → Take snapshot OR use browser_is_visible to confirm expected change
3. **Type** → Use browser_get_text to confirm text was entered
4. **Form actions** → Use browser_is_checked to confirm checkbox state

**Example verification flow:**

```
# Click a submit button
browser_click(ref="e5")

# VERIFY: Check if success message appeared
browser_is_visible(selector=".success-message")
# Output: true

# If false, the action may have failed - investigate before proceeding
browser_snapshot()  # See what actually happened
```

**Why this matters:**
- Pages change dynamically - refs become stale
- Actions can fail silently (overlays, loading states)
- Verification tells you WHEN to proceed vs retry
- Without verification, agents assume success and give up when things go wrong

**When verification fails:**
1. Take a fresh snapshot to see current page state
2. Look for error messages, loading indicators, or overlays
3. Address the blocker (dismiss modal, wait for load, etc.)
4. Retry the original action
5. Verify again

## Error Recovery

When actions fail, the error message will tell you what to do:

| Error | What it means | What to do |
|-------|---------------|------------|
| "Element blocked by overlay" | Modal/popup covering element | Find close button, press Escape, or click outside |
| "Element not found" | Page changed, ref is stale | Run browser_snapshot() to get updated refs |
| "Multiple elements match" | Selector too broad | Use more specific ref from snapshot |
| "Element not visible" | Element exists but hidden | Scroll into view or wait for it to appear |
| "Page closed" | Tab was closed | Use browser_tabs(action="list") to find correct tab |

**Never give up on first failure.** Take a snapshot, understand what happened, then adapt.

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

## Examples

### Google Search

1. browser_navigate(url="google.com")
2. browser_snapshot() -> find search box [ref=e12]
3. browser_type(ref="e12", text="cute animals", press_enter=true)
4. browser_screenshot() -> see search results

### Google Docs

**IMPORTANT**: For Google Docs/Sheets/Slides, ALWAYS navigate directly - don't click through Drive UI (new tabs don't work well):

1. browser_navigate(url="docs.google.com/document/create") -> creates new doc directly
2. browser_click(x=640, y=300) -> click on document area to focus the editor
3. browser_keyboard(text="Hello, this is my document") -> type with real keyboard events
4. browser_keyboard(key="Enter") -> press Enter for new line
5. browser_keyboard(text="Second paragraph")
6. browser_screenshot() -> verify text was typed

Direct URLs to remember:
- New Doc: docs.google.com/document/create
- New Sheet: docs.google.com/spreadsheets/create
- New Slide: docs.google.com/presentation/create

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

## Filesystem

For saving/downloading content:
- Use browser's native download (click download buttons, Save As)
- Chrome handles downloads with its own permissions
- For text/data, copy to clipboard so users can paste where they want
