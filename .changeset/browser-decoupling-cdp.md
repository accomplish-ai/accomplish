---
"@accomplish_ai/agent-core": minor
---

Add `BrowserConfig` option to config-generator with three modes: `builtin` (default, existing behavior), `remote` (connect to any CDP endpoint), and `none` (disable browser tools). Extract connection logic from dev-browser-mcp into a dedicated module with switchable strategies.
