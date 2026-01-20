---
name: dev-browser
description: Browser automation via MCP tools. ALWAYS use these tools for ANY web task - navigating sites, clicking, typing, filling forms, taking screenshots, or extracting data. This is the ONLY way to control the browser.
---

# Dev Browser

Browser automation using MCP tools. Use these tools directly for all web automation tasks.

## Tools

**browser_navigate(url, page_name?)** - Navigate to a URL
- url: The URL to visit (e.g., "google.com" or "https://example.com")
- page_name: Optional name for the page (default: "main")

**browser_snapshot(page_name?)** - Get the page's accessibility tree
- Returns YAML with element refs like [ref=e5]
- Use these refs with browser_click and browser_type

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

## Workflow

1. **Navigate**: `browser_navigate("google.com")`
2. **Discover elements**: `browser_snapshot()` - find refs like [ref=e5]
3. **Interact**: `browser_click(ref="e5")` or `browser_type(ref="e3", text="search query", press_enter=true)`
4. **Verify**: `browser_screenshot()` to see the result

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
