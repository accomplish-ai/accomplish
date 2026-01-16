# AGENTS.md

This file provides guidance for agentic coding agents operating in this repository.

## Project Overview

Openwork is a standalone desktop automation assistant built with Electron. The app hosts a local React UI (bundled via Vite), communicating with the main process through `contextBridge` IPC. The main process spawns the OpenCode CLI (via `node-pty`) to execute user tasks. Users provide their own API key (Anthropic, OpenAI, Google, or Groq) on first launch, stored securely in the OS keychain.

## Build Commands

```bash
# Development
pnpm dev                              # Run desktop app in dev mode (Vite + Electron)
pnpm dev:clean                        # Dev mode with CLEAN_START=1 (clears stored data)

# Building
pnpm build                            # Build all workspaces
pnpm build:desktop                    # Build desktop app only
pnpm build:unpack                     # Build without packaging (outputs to dist/)

# Packaging
pnpm package                          # Build and package for macOS (DMG + ZIP)
pnpm package:mac                      # Build and package for macOS only
pnpm package:linux                    # Build and package for Linux (AppImage)
pnpm release                          # Build and release for macOS (publishes to GitHub)
pnpm release:mac                      # Build and release for macOS only
pnpm release:linux                    # Build and release for Linux (AppImage)

# Download bundled Node.js binaries
cd apps/desktop && pnpm download:nodejs

# Testing
pnpm test                             # Run all tests (unit + integration)
pnpm test:unit                        # Run unit tests only
pnpm test:integration                 # Run integration tests only
pnpm test:coverage                    # Run tests with coverage report
pnpm test:watch                       # Run tests in watch mode
pnpm test:e2e                         # Playwright E2E tests
pnpm test:e2e:ui                      # E2E tests with Playwright UI
pnpm test:e2e:debug                   # E2E tests in debug mode

# Single test file
pnpm vitest run apps/desktop/__tests__/unit/main/opencode/adapter.unit.test.ts

# Linting and Type Checking
pnpm lint                             # TypeScript type checking (via tsc --noEmit)
pnpm typecheck                        # Same as lint

# Cleanup
pnpm clean                            # Clean build outputs and node_modules
```

## Architecture

### Monorepo Layout
```
apps/desktop/     # Electron app (main/preload/renderer)
packages/shared/  # Shared TypeScript types
```

### Desktop App Structure (`apps/desktop/src/`)

**Main Process** (`main/`):
- `index.ts` - Electron bootstrap, single-instance enforcement, `accomplish://` protocol handler
- `ipc/handlers.ts` - IPC handlers for task lifecycle, settings, onboarding, API keys
- `opencode/adapter.ts` - OpenCode CLI wrapper using `node-pty`, streams output and handles permissions
- `store/secureStorage.ts` - API key storage via `keytar` (OS keychain)
- `store/appSettings.ts` - App settings via `electron-store` (debug mode, onboarding state)
- `store/taskHistory.ts` - Task history persistence
- `utils/bundled-node.ts` - Bundled Node.js paths for MCP servers
- `utils/system-path.ts` - macOS PATH extension for Node.js version managers

**Preload** (`preload/index.ts`):
- Exposes `window.accomplish` API via `contextBridge`
- Provides typed IPC methods for task operations, settings, events

**Renderer** (`renderer/`):
- `main.tsx` - React entry with HashRouter
- `App.tsx` - Main routing + onboarding gate
- `pages/` - Home, Execution, History, Settings pages
- `stores/taskStore.ts` - Zustand store for task/UI state
- `lib/accomplish.ts` - Typed wrapper for the IPC API

### IPC Communication Flow
```
Renderer (React)
    ↓ window.accomplish.* calls
Preload (contextBridge)
    ↓ ipcRenderer.invoke
Main Process
    ↓ Native APIs (keytar, node-pty, electron-store)
    ↑ IPC events
Preload
    ↑ ipcRenderer.on callbacks
Renderer
```

## Code Style Guidelines

### TypeScript
- Use TypeScript for all application logic (no JavaScript for app code)
- Enable `strict: true` in tsconfig
- Prefer explicit types over type inference for function parameters and public APIs
- Use `zod` for runtime validation of IPC messages and external data

### Imports and Module Organization
- Use ES module syntax (`import`/`export`)
- Group imports: external packages → internal modules → relative imports
- Use absolute imports with workspace aliases (`@accomplish/shared`)
- Use barrel exports (`index.ts`) for public APIs

```typescript
// External packages first
import { useState, useCallback } from 'react';
import { app } from 'electron';
import path from 'path';

// Internal packages
import { TaskState } from '@accomplish/shared';

// Relative imports last
import { HandlerContext } from './types.js';
```

### File Naming
- TypeScript files: `kebab-case.ts`
- Test files: `*.unit.test.ts`, `*.integration.test.ts`
- Config files: `*.config.ts`, `vitest.*.config.ts`

### Naming Conventions
- **Variables/functions**: `camelCase` (e.g., `taskHistory`, `getBundledNodePaths`)
- **Constants**: `UPPER_SNAKE_CASE` for global constants (e.g., `NODE_VERSION`)
- **Classes/Components**: `PascalCase` (e.g., `TaskStore`, `MainWindow`)
- **Types/Interfaces**: `PascalCase` with `Type` suffix for unions (e.g., `TaskType`)
- **Booleans**: Prefix with `is`, `has`, `should` (e.g., `isRunning`, `hasPermission`)

### Error Handling
- Use `try/catch` with async/await for operations that may throw
- Log errors with context using the established format: `[ComponentName] Error description: <error>`
- Propagate errors through IPC with typed error responses
- Never expose sensitive information in error messages (API keys, paths)

```typescript
try {
  await performOperation();
} catch (err) {
  console.error('[Handler] Failed to perform operation:', err);
  throw new Error('Operation failed');
}
```

### React Components
- Use functional components with hooks
- Use `.tsx` extension for components
- Colocate component styles with the component
- Use Zustand for global state, React hooks for local state

### Electron Best Practices
- **Never** set `nodeIntegration: true` in BrowserWindow
- **Always** use `contextIsolation: true` with a preload script
- Use `shell.openExternal()` for external URLs (never trust user input)
- Use `ipcMain.handle()` for request/response IPC (not `ipcRenderer.sendSync`)

### Spawning Processes
When spawning `npx` or `node` in the main process, you MUST add the bundled Node.js bin directory to PATH:

```typescript
import { spawn } from 'child_process';
import { getNpxPath, getBundledNodePaths } from '../utils/bundled-node';

const npxPath = getNpxPath();
const bundledPaths = getBundledNodePaths();

let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
if (bundledPaths) {
  const delimiter = process.platform === 'win32' ? ';' : ':';
  spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
}

spawn(npxPath, ['-y', 'some-package@latest'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: spawnEnv,
});
```

### Image Assets in Renderer
Always use ES module imports for images in the renderer, never absolute paths:

```typescript
// CORRECT - Use ES imports
import logoImage from '/assets/logo.png';
<img src={logoImage} alt="Logo" />

// WRONG - Absolute paths break in packaged app
<img src="/assets/logo.png" alt="Logo" />
```

Static assets go in `apps/desktop/public/assets/`.

### Testing
- Unit tests: Mock Electron APIs using `vitest` with `happy-dom`
- Integration tests: Test real IPC communication
- E2E tests: Use Playwright with serial execution (Electron requirement)
- Place tests in `__tests__/unit/` or `__tests__/integration/` alongside source files

## Key Dependencies
- `node-pty` - PTY for OpenCode CLI spawning
- `keytar` - Secure API key storage (OS keychain)
- `electron-store` - Local settings/preferences
- `opencode-ai` - Bundled OpenCode CLI (multi-provider: Anthropic, OpenAI, Google, Groq)

## Environment Variables
- `CLEAN_START=1` - Clear all stored data on app start
- `E2E_SKIP_AUTH=1` - Skip onboarding flow (for testing)

## Bundled Node.js
The app bundles standalone Node.js v20.18.1 binaries for MCP servers. Key files:
- `src/main/utils/bundled-node.ts` - Utility to get bundled node/npm/npx paths
- `scripts/download-nodejs.cjs` - Downloads Node.js binaries for all platforms
- `scripts/after-pack.cjs` - Copies correct binary into app bundle during build

## Key Behaviors
- Single-instance enforcement - second instance focuses existing window
- API keys stored in OS keychain (macOS Keychain, Windows Credential Vault, Linux Secret Service)
- API key validation via test request to respective provider API
- OpenCode CLI permissions are bridged to UI via IPC `permission:request` / `permission:respond`
- Task output streams through `task:update` and `task:progress` IPC events
