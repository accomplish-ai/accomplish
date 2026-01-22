# Agent-Browser Migration Design

**Date:** 2026-01-21
**Status:** Pending Approval

## Overview

Replace `dev-browser-mcp` with a new `agent-browser-mcp` that exposes agent-browser's 36-tool API while keeping the existing anti-detection infrastructure (rebrowser-playwright, system Chrome preference).

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Anti-detection | Keep rebrowser-playwright | Required - cannot lose bot detection protection |
| System Chrome | Keep preference | Required - faster startup, less detectable |
| Browser server | Keep dev-browser | Unchanged - provides CDP endpoint |
| MCP API | Adopt agent-browser's 36 tools | Better API surface, comprehensive docs |
| SKILL.md | Use agent-browser's + tab awareness | Follow their recommended patterns |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    UNCHANGED                            │
│  dev-browser server (rebrowser-playwright + Chrome)    │
│  - Anti-detection patches                               │
│  - System Chrome preference                             │
│  - CDP endpoint on port 9224                            │
└─────────────────────────────────────────────────────────┘
                          ↑ CDP Connection
┌─────────────────────────────────────────────────────────┐
│                    NEW                                  │
│  agent-browser-mcp (replaces dev-browser-mcp)          │
│  - 36 tools matching agent-browser API                  │
│  - Uses rebrowser-playwright to connect via CDP        │
│  - Same SKILL.md as agent-browser + tab awareness      │
└─────────────────────────────────────────────────────────┘
```

## Files to Delete

```
apps/desktop/skills/dev-browser-mcp/       # Replaced by agent-browser-mcp
```

## Files to Create

```
apps/desktop/skills/agent-browser-mcp/
├── package.json
├── src/
│   └── index.ts
└── SKILL.md
```

## Files to Modify

| File | Changes |
|------|---------|
| `apps/desktop/package.json` | Replace dev-browser-mcp with agent-browser-mcp in postinstall/build |
| `apps/desktop/src/main/opencode/config-generator.ts` | Replace MCP config, update system prompt |

## Files Unchanged

```
apps/desktop/skills/dev-browser/           # Keeps rebrowser-playwright, anti-detection
apps/desktop/src/main/opencode/task-manager.ts  # Keeps browser management logic
packages/shared/src/constants.ts           # Keeps DEV_BROWSER_PORT
```

## Implementation Details

### package.json (agent-browser-mcp)

```json
{
  "name": "agent-browser-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "npx tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "npm:rebrowser-playwright@^1.52.0"
  }
}
```

### MCP Server Structure (index.ts)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { chromium, type Browser, type Page } from 'playwright';

const DEV_BROWSER_PORT = 9224;
const TASK_ID = process.env.ACCOMPLISH_TASK_ID || 'default';

// Browser connection (same pattern as current dev-browser-mcp)
let browser: Browser | null = null;

async function ensureConnected(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  const res = await fetch(`http://localhost:${DEV_BROWSER_PORT}`);
  const { wsEndpoint } = await res.json();
  browser = await chromium.connectOverCDP(wsEndpoint);
  return browser;
}

// Ref map for snapshot → interaction workflow
let refMap: Map<string, { role: string; name?: string; nth?: number }> = new Map();

// 36 tool handlers...
```

### Desktop package.json Script Updates

**postinstall:**
```json
"postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/agent-browser-mcp install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install"
```

**build:**
```json
"build": "tsc && vite build && npm --prefix skills/dev-browser install --omit=dev && npm --prefix skills/agent-browser-mcp install --omit=dev && npm --prefix skills/file-permission install --omit=dev && npm --prefix skills/ask-user-question install --omit=dev"
```

### config-generator.ts MCP Config

```typescript
mcp: {
  'file-permission': { /* unchanged */ },
  'ask-user-question': { /* unchanged */ },
  'agent-browser-mcp': {
    type: 'local',
    command: ['npx', 'tsx', path.join(skillsPath, 'agent-browser-mcp', 'src', 'index.ts')],
    enabled: true,
    environment: {
      ACCOMPLISH_TASK_ID: '${TASK_ID}',
    },
    timeout: 30000,
  },
},
```

## MCP Tool Specifications (36 Tools)

### Navigation (2 tools)

**browser_open**
```typescript
{ url: string, headed?: boolean, cdp?: number }
```

**browser_navigate**
```typescript
{ action: "back" | "forward" | "reload" | "close" }
```

### Snapshot (1 tool)

**browser_snapshot**
```typescript
{ interactive_only?: boolean, compact?: boolean, depth?: number, selector?: string, json?: boolean }
```

### Interactions (10 tools)

**browser_click**
```typescript
{ ref?: string, selector?: string, double?: boolean }
```

**browser_fill**
```typescript
{ ref?: string, selector?: string, text: string, clear?: boolean }
```

**browser_press**
```typescript
{ key: string, action?: "press" | "keydown" | "keyup" }
```

**browser_hover**
```typescript
{ ref?: string, selector?: string }
```

**browser_focus**
```typescript
{ ref?: string, selector?: string }
```

**browser_check**
```typescript
{ ref?: string, selector?: string, uncheck?: boolean }
```

**browser_select**
```typescript
{ ref?: string, selector?: string, value: string }
```

**browser_scroll**
```typescript
{ direction?: "up" | "down" | "left" | "right", amount?: number, ref?: string, selector?: string }
```

**browser_drag**
```typescript
{ from_ref: string, to_ref: string }
```

**browser_upload**
```typescript
{ ref?: string, selector?: string, files: string[] }
```

### Information (2 tools)

**browser_get**
```typescript
{ what: "text" | "html" | "value" | "attr" | "title" | "url" | "count" | "box", ref?: string, selector?: string, attr_name?: string, json?: boolean }
```

**browser_is**
```typescript
{ check: "visible" | "enabled" | "checked", ref?: string, selector?: string }
```

### Capture (3 tools)

**browser_screenshot**
```typescript
{ path?: string, full_page?: boolean }
```

**browser_pdf**
```typescript
{ path: string }
```

**browser_record**
```typescript
{ action: "start" | "stop" | "restart", path?: string }
```

### Timing (1 tool)

**browser_wait**
```typescript
{ ref?: string, ms?: number, text?: string, url?: string, load?: "load" | "domcontentloaded" | "networkidle", fn?: string }
```

### Mouse (1 tool)

**browser_mouse**
```typescript
{ action: "move" | "down" | "up" | "wheel", x?: number, y?: number, button?: "left" | "right" | "middle", delta?: number }
```

### Semantic Locators (1 tool)

**browser_find**
```typescript
{ by: "role" | "text" | "label" | "placeholder" | "alt" | "title" | "testid" | "first" | "last" | "nth", value: string, action: "click" | "fill" | "text" | "hover", action_value?: string, name?: string, nth?: number }
```

### Settings (1 tool)

**browser_set**
```typescript
{ setting: "viewport" | "device" | "geo" | "offline" | "headers" | "credentials" | "media", width?: number, height?: number, device_name?: string, lat?: number, lon?: number, enabled?: boolean, headers?: Record<string, string>, user?: string, pass?: string, scheme?: "dark" | "light" }
```

### Storage (2 tools)

**browser_cookies**
```typescript
{ action: "get" | "set" | "clear", name?: string, value?: string }
```

**browser_storage**
```typescript
{ type: "local" | "session", action: "get" | "get_key" | "set" | "clear", key?: string, value?: string }
```

### Network (1 tool)

**browser_network**
```typescript
{ action: "route" | "unroute" | "requests", url?: string, abort?: boolean, body?: string, filter?: string }
```

### Tabs/Windows (2 tools)

**browser_tab**
```typescript
{ action: "list" | "new" | "switch" | "close", url?: string, index?: number }
```

**browser_window**
```typescript
{ action: "new" }
```

### Frames (1 tool)

**browser_frame**
```typescript
{ selector: string }
```

### Dialogs (1 tool)

**browser_dialog**
```typescript
{ action: "accept" | "dismiss", text?: string }
```

### JavaScript (1 tool)

**browser_eval**
```typescript
{ script: string }
```

### Sessions/State (2 tools)

**browser_session**
```typescript
{ action: "list" }
```

**browser_state**
```typescript
{ action: "save" | "load", path: string }
```

### Debugging (4 tools)

**browser_console**
```typescript
{ clear?: boolean }
```

**browser_errors**
```typescript
{ clear?: boolean }
```

**browser_highlight**
```typescript
{ ref?: string, selector?: string }
```

**browser_trace**
```typescript
{ action: "start" | "stop", path?: string }
```

## SKILL.md Content

The SKILL.md will include:
1. agent-browser's official documentation (36 tools)
2. MCP tool syntax (not CLI)
3. **Tab Awareness section** (critical addition)

### Tab Awareness Section

```markdown
## CRITICAL: Tab Awareness After Clicks

**ALWAYS check for new tabs after clicking links or buttons.**

Many websites open content in new tabs. If you click something and the page seems unchanged or you can't find expected content, a new tab likely opened.

**Workflow after clicking:**
1. `browser_click(ref="e5")` - Click the element
2. `browser_tab(action="list")` - Check if new tabs opened
3. If new tab exists: `browser_tab(action="switch", index=N)` - Switch to it
4. `browser_snapshot(interactive_only=true)` - Get content from correct tab

**Example:**

# Click a link that might open new tab
browser_click(ref="e3")

# Check tabs
browser_tab(action="list")
# Output: [{ index: 0, url: "original.com", active: true },
#          { index: 1, url: "newpage.com", active: false }]

# New tab opened! Switch to it
browser_tab(action="switch", index=1)

# Now snapshot the new tab
browser_snapshot(interactive_only=true)

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

## System Prompt Updates

Update `config-generator.ts` system prompt to reference new tools:

```typescript
- Use browser_* MCP tools for all web automation:

  Navigation: browser_open, browser_navigate
  Page Analysis: browser_snapshot
  Interactions: browser_click, browser_fill, browser_press, browser_hover,
                browser_focus, browser_check, browser_select, browser_scroll,
                browser_drag, browser_upload
  Information: browser_get, browser_is
  Capture: browser_screenshot, browser_pdf, browser_record
  Timing: browser_wait
  Mouse: browser_mouse
  Semantic Locators: browser_find
  Settings: browser_set
  Storage: browser_cookies, browser_storage
  Network: browser_network
  Tabs/Windows: browser_tab, browser_window
  Frames: browser_frame
  Dialogs: browser_dialog
  JavaScript: browser_eval
  Sessions: browser_session, browser_state
  Debugging: browser_console, browser_errors, browser_highlight, browser_trace
```

## Testing Plan

1. **Unit tests**: Tool parameter validation, ref parsing
2. **Integration tests**: CDP connection to dev-browser, tool execution
3. **E2E tests**: Full workflows (open → snapshot → click → verify)
4. **Anti-detection verification**: Confirm rebrowser-playwright still active
5. **Tab awareness tests**: Verify new tab detection workflow
6. **Platform tests**: macOS, Windows, Linux
7. **Packaging tests**: Verify in packaged DMG/exe
