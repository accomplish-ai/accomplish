---
name: browser
description: Browser automation via MCP tools. Use these tools for ANY web task.
---

# Browser Automation

## CRITICAL: No Shell Commands

**NEVER use bash/shell commands to open browsers or URLs.** This includes `open`, `xdg-open`, `start`, Python `webbrowser`.

## Tools

**Navigation:**
- `browser_open(url, wait?, page_name?)` - Navigate to URL
- `browser_back()` / `browser_forward()` / `browser_reload()`

**Snapshot & Interaction:**
- `browser_snapshot(interactive?, compact?)` - Get ARIA tree with refs like `[ref=e5]`
- `browser_click(ref|selector)` - Click element
- `browser_type(ref|selector, text, clear?)` - Type into input
- `browser_fill(ref|selector, value)` - Fill input (faster)
- `browser_press(key)` - Press key (Enter, Tab, Ctrl+a)
- `browser_hover(ref|selector)` - Hover over element
- `browser_select(ref|selector, value)` - Select dropdown option

**Content:**
- `browser_screenshot(full?, selector?)` - Take screenshot
- `browser_get(ref|selector, attr?)` - Get text/value/attribute

**Other:**
- `browser_wait(selector?, text?, url?, timeout?)` - Wait for condition
- `browser_evaluate(script)` - Run JavaScript
- `browser_tabs(action)` - List or close pages

## Workflow

1. `browser_open("google.com")`
2. `browser_snapshot()` - find refs like `[ref=e12]`
3. `browser_type(ref="e12", text="search query")` then `browser_press(key="Enter")`
4. `browser_screenshot()` to verify

## Using Refs

Refs from `browser_snapshot` can be used as: `e5`, `@e5`, or `ref=e5`

## Login Pages

When you reach a login page, ASK the user to log in manually, then continue.
