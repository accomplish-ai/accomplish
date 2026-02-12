# @accomplish_ai/agent-core

## 0.3.2

### Patch Changes

- 3ae6718: feat(dev-browser-mcp): improve browser interaction reliability with coordinate fallbacks

  - Add canvas app detection (Google Docs, Figma, etc.) with automatic coordinate-based interactions
  - Add coordinate fallback for click, type, and hover when DOM interactions fail
  - Add ARIA tree pruning to remove useless wrapper nodes and reduce snapshot noise
  - Add configurable bounding box annotations in snapshot output (includeBoundingBoxes option)
  - Fix Playwright silently hijacking downloads by resetting Browser.setDownloadBehavior
  - Fix 0x0 viewport detection with window.innerWidth/innerHeight fallback
  - Set default 1280x720 viewport for new pages

## 0.3.1

### Patch Changes

- 7ab95c7: Auto-detect MCP entry point by checking if source files exist on disk instead of relying on ACCOMPLISH_BUNDLED_MCP env var

## 0.3.0

### Minor Changes

- ed82a03: Add `BrowserConfig` option to config-generator with three modes: `builtin` (default, existing behavior), `remote` (connect to any CDP endpoint), and `none` (disable browser tools). Extract connection logic from dev-browser-mcp into a dedicated module with switchable strategies.

## 0.2.2

### Patch Changes

- 0287432: Include server.cjs launcher files in published npm package by adding `mcp-tools/*/*.cjs` to the files field

## 0.2.1

### Patch Changes

- 32795a5: Clean up public API surface and improve encapsulation

  - Replace wildcard barrel exports with explicit named exports
  - Internalize message batching and proxy lifecycle into TaskManager
  - Remove raw database repository functions from public API (use createStorage factory)
  - Move better-sqlite3 and node-pty to optional peer dependencies
  - Add StorageAPI and SkillsManagerAPI JSDoc documentation
  - Fix SpeechServiceOptions.storage type from unknown to SecureStorageAPI
  - Remove dead code (unused interfaces, empty functions)
  - Add README.md and npm metadata (homepage, bugs, keywords)
  - Remove raw TypeScript source and build configs from published files

## 0.2.0

### Minor Changes

- 4405211: Enable npm publishing for @accomplish_ai/agent-core package

  - Package now published to npm as @accomplish_ai/agent-core
  - Added changesets for version management
  - Added automated release workflows
