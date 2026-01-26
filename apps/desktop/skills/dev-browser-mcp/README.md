# dev-browser-mcp

An MCP (Model Context Protocol) server for browser automation using Playwright.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

## browser_snapshot Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page_name | string | "main" | Name of the page to snapshot |
| interactive_only | boolean | true | Only include interactive elements |
| full_snapshot | boolean | false | Bypass all limits (escape hatch) |
| max_elements | number | 300 | Maximum elements (1-1000) |
| max_tokens | number | 8000 | Token budget (1000-50000) |
| viewport_only | boolean | false | Filter to viewport-visible elements |
| include_history | boolean | true | Include navigation history |

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
