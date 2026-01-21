# Agent-Browser Migration Design

## Overview

Replace the current `dev-browser` and `dev-browser-mcp` implementation with agent-browser's cleaner architecture while maintaining the same session model.

**Motivation:** Performance, reliability, features, and maintenance improvements.

## Decisions

| Decision | Choice |
|----------|--------|
| Integration approach | Import as library |
| Tool API | Adopt agent-browser's design (breaking change) |
| Session isolation | Single browser process, shared profile (like today) |
| Package structure | Keep two packages (browser + browser-mcp) |
| Migration strategy | Big bang replacement |
| Profile persistence | Persistent (logins preserved across tasks) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  browser/ package                                                │
│  ─────────────────────────────────────────────────────────────  │
│  HTTP Server (port 9224)                                        │
│    └── BrowserManager                                           │
│          └── Single Chromium process                            │
│                └── Shared profile (.browser-data/)              │
└─────────────────────────────────────────────────────────────────┘
          ▲ CDP connections
          │
    ┌─────┴─────┐
    │           │
┌───┴───┐   ┌───┴───┐
│ MCP A │   │ MCP B │  (browser-mcp instances per task)
│ abc   │   │ xyz   │
└───────┘   └───────┘
    │           │
 Task A      Task B
```

Same as today: shared browser, page isolation via `${TASK_ID}-pagename` naming.

## MCP Tool API

### Navigation & Pages

| Tool | Parameters | Notes |
|------|------------|-------|
| `browser_open` | `url`, `wait?` | Navigate. Wait: `load`, `domcontentloaded`, `networkidle` |
| `browser_back` | - | Go back |
| `browser_forward` | - | Go forward |
| `browser_reload` | - | Reload page |
| `browser_tabs` | `action`, `id?` | `list`, `close`, `switch` |

### Snapshot & Interaction

| Tool | Parameters | Notes |
|------|------------|-------|
| `browser_snapshot` | `interactive?`, `compact?`, `selector?` | ARIA tree with refs (`@e1`) |
| `browser_click` | `ref`\|`selector`, `button?`, `count?` | Click element |
| `browser_type` | `ref`\|`selector`, `text`, `clear?` | Type into input |
| `browser_fill` | `ref`\|`selector`, `value` | Set input value directly |
| `browser_press` | `key` | Press key (Enter, Tab, Ctrl+a, etc.) |
| `browser_hover` | `ref`\|`selector` | Hover over element |
| `browser_select` | `ref`\|`selector`, `value` | Select dropdown option |

### Screenshots & Content

| Tool | Parameters | Notes |
|------|------------|-------|
| `browser_screenshot` | `full?`, `selector?` | Capture image |
| `browser_pdf` | `path` | Export PDF |
| `browser_get` | `ref`\|`selector`, `attr?` | Get text, value, or attribute |

### Advanced

| Tool | Parameters | Notes |
|------|------------|-------|
| `browser_wait` | `selector?`, `text?`, `url?`, `timeout?` | Wait for conditions |
| `browser_evaluate` | `script` | Run JavaScript |
| `browser_route` | `url`, `action`, `body?` | Network interception (`abort`, `mock`) |

## Snapshot System

Replace custom inline JS (~800 lines) with agent-browser's approach (~200 lines):

```typescript
// Uses Playwright's native ariaSnapshot() API
const ariaTree = await page.locator(':root').ariaSnapshot();

// Stores selector descriptors, not DOM refs
refs['e1'] = {
  selector: "getByRole('button', { name: \"Submit\", exact: true })",
  role: 'button',
  name: 'Submit',
  nth: 0  // Only when duplicates exist
};

// To interact: reconstruct locator
const locator = page.getByRole('button', { name: 'Submit', exact: true });
await locator.click();
```

**Benefits:**
- Simpler: Leverages Playwright built-ins
- Robust: Locators re-query DOM at action time
- Smaller: Interactive-only mode filters output
- Clean: `.nth()` only when duplicates exist

## Package Structure

```
apps/desktop/skills/
├── browser/                    # Renamed from dev-browser
│   ├── src/
│   │   ├── index.ts           # HTTP server + BrowserManager
│   │   ├── snapshot.ts        # From agent-browser
│   │   ├── actions.ts         # From agent-browser, adapted
│   │   └── types.ts
│   └── package.json
└── browser-mcp/                # Renamed from dev-browser-mcp
    ├── src/
    │   └── index.ts           # MCP tools
    └── package.json
```

## Migration Steps

### Phase 1: Import agent-browser modules
- Copy `snapshot.ts` from agent-browser (465 lines, minimal changes)
- Adapt `actions.ts` for HTTP server context
- Merge browser management into `index.ts`

### Phase 2: Rewrite browser-mcp
- New MCP tools using agent-browser's API design
- Connect to browser server same as today (CDP over HTTP)

### Phase 3: Update integration points
- `config-generator.ts` - New tool names in system prompt
- `SKILL.md` - New tool documentation
- `task-manager.ts` - Update paths if renamed

### Phase 4: Delete old code
- Remove/replace `dev-browser/` and `dev-browser-mcp/`

### Estimated scope
- ~500 lines new/copied
- ~3100 lines deleted
- Net: ~2600 lines removed

## Files to Copy from agent-browser

| Source | Destination | Changes |
|--------|-------------|---------|
| `src/snapshot.ts` | `browser/src/snapshot.ts` | Minimal |
| `src/actions.ts` (partial) | `browser/src/actions.ts` | Adapt to server |
| `src/browser.ts` (partial) | `browser/src/index.ts` | Merge with HTTP |

## Testing

### Manual checklist
- [ ] Navigate, snapshot, click by ref
- [ ] Fill multi-field form
- [ ] Login persists after task ends
- [ ] Parallel tasks on different sites
- [ ] Parallel tasks on same site (shared cookies)
- [ ] Screenshot (viewport + full page)
- [ ] Keyboard input (Google Docs)
- [ ] Re-snapshot after page change

### E2E tests
```typescript
test('snapshot returns refs for interactive elements');
test('click by ref works');
test('type into input by ref works');
test('cookies persist across tasks');
test('parallel tasks get isolated pages');
```

### Rollout
- Version bump to 0.4.0 (breaking change)
- Changelog documents new tool API
- No feature flag (big bang)
