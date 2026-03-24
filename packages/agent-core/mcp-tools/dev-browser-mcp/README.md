# dev-browser-mcp

An MCP (Model Context Protocol) server for browser automation using Playwright.

## Installation

```bash
npm install
```

## Connection Modes

The server supports two connection modes, determined by the `CDP_ENDPOINT` environment variable.

### Builtin mode (default)

Connects to the dev-browser HTTP server, which manages browser lifecycle and page routing. This is how the Accomplish desktop app uses it.

```bash
# Uses http://localhost:9224 by default
npx tsx src/index.ts

# Custom port
DEV_BROWSER_PORT=5555 npx tsx src/index.ts
```

### Remote CDP mode

Connects directly to any Chrome DevTools Protocol endpoint — no dev-browser HTTP server needed. Pages are managed in a local in-memory registry.

```bash
# Local headless Chromium
CDP_ENDPOINT=http://localhost:9222 npx tsx src/index.ts

# Remote browser with auth
CDP_ENDPOINT=ws://remote-browser:9222 CDP_SECRET=my-token npx tsx src/index.ts
```

### Environment variables

| Variable             | Mode    | Description                                                   |
| -------------------- | ------- | ------------------------------------------------------------- |
| `CDP_ENDPOINT`       | remote  | CDP endpoint URL (http or ws). When set, enables remote mode. |
| `CDP_SECRET`         | remote  | Sent as `X-CDP-Secret` header for authenticated endpoints.    |
| `DEV_BROWSER_PORT`   | builtin | Port for the dev-browser HTTP server (default: `9224`).       |
| `ACCOMPLISH_TASK_ID` | both    | Task ID for page name isolation (default: `default`).         |

### Launching a headless browser for remote mode

```bash
# Start headless Chromium with a CDP port
chromium --headless --no-sandbox --remote-debugging-port=9222

# Verify it's running
curl http://localhost:9222/json/version

# Connect the MCP server
CDP_ENDPOINT=http://localhost:9222 npx tsx src/index.ts
```

All `browser_*` tools (navigate, snapshot, click, type, evaluate, screenshot, tabs, etc.) work identically in both modes.

## browser_snapshot Parameters

| Parameter        | Type    | Default | Description                         |
| ---------------- | ------- | ------- | ----------------------------------- |
| page_name        | string  | "main"  | Name of the page to snapshot        |
| interactive_only | boolean | true    | Only include interactive elements   |
| full_snapshot    | boolean | false   | Bypass all limits (escape hatch)    |
| max_elements     | number  | 300     | Maximum elements (1-1000)           |
| max_tokens       | number  | 8000    | Token budget (1000-50000)           |
| viewport_only    | boolean | false   | Filter to viewport-visible elements |
| include_history  | boolean | true    | Include navigation history          |

### Token Optimization

The snapshot tool automatically optimizes output using a 3-tier system:

1. **Element Filtering** - Prioritizes interactive elements by role (buttons > textboxes > links)
2. **Token Budget** - Truncates when approaching token limit
3. **Context Management** - Tracks session navigation history

When truncated, output includes metadata header:

```yaml
# Elements: 300 of 5538 (truncated: element limit)
# Tokens: ~4500
# Navigation: Home → Search → Results
```
