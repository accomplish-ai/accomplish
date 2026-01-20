# AGENTS.md - Guide for AI Coding Agents

This file provides guidance for AI coding agents working on the Openwork codebase.

## Project Overview

Openwork is an Electron-based desktop AI assistant with a React UI bundled via Vite. The main process communicates with the renderer through `contextBridge` IPC. The app spawns OpenCode CLI via `node-pty` to execute user tasks.

**Monorepo Structure:**
- `apps/desktop/` - Electron app (main + preload + renderer)
- `packages/shared/` - Shared TypeScript types

## Build, Lint, and Test Commands

### Common Commands (run from root)

```bash
pnpm install              # Install dependencies
pnpm dev                  # Run desktop app in dev mode
pnpm dev:clean            # Dev mode with clean start (CLEAN_START=1)
pnpm build                # Build all workspaces
pnpm build:desktop        # Build desktop app only
pnpm lint                 # TypeScript type checking
pnpm typecheck            # Type validation
pnpm clean                # Clean build outputs
```

### Unit & Integration Tests

```bash
pnpm -F @accomplish/desktop test              # Run all tests (vitest run)
pnpm -F @accomplish/desktop test:unit         # Unit tests only
pnpm -F @accomplish/desktop test:integration  # Integration tests only
pnpm -F @accomplish/desktop test:watch        # Watch mode
pnpm -F @accomplish/desktop test:coverage     # With coverage report
pnpm vitest run src/main/__tests__/my-test.test.ts  # Single test file
```

### E2E Tests (Playwright)

```bash
# Docker (default)
pnpm -F @accomplish/desktop test:e2e
pnpm -F @accomplish/desktop test:e2e:build
pnpm -F @accomplish/desktop test:e2e:report

# Native (for debugging)
pnpm -F @accomplish/desktop test:e2e:native
pnpm -F @accomplish/desktop test:e2e:native:ui
pnpm -F @accomplish/desktop test:e2e:native:fast
```

### Environment Variables

```bash
CLEAN_START=1          # Clear all stored data on app start
E2E_SKIP_AUTH=1        # Skip onboarding flow (testing)
E2E_MOCK_TASK_EVENTS=1 # Mock task execution events
```

## Code Style Guidelines

### TypeScript

- **No `any`**: Never suppress type errors with `as any`, `@ts-ignore`, `@ts-expect-error`
- **Use interfaces for objects**: Prefer `interface` over `type` for object shapes
- **Explicit return types**: Add return types to public functions

### Naming Conventions

- **Files**: `kebab-case` for general files, `PascalCase.tsx` for React components
- **Variables/Functions**: `camelCase` (e.g., `taskId`, `startTask`)
- **Constants**: `SCREAMING_SNAKE_CASE` or `camelCase` for local constants
- **Interfaces**: `PascalCase` with descriptive names (e.g., `TaskConfig`)
- **Private class members**: Prefix with underscore (e.g., `_taskId`)

### Import Patterns

- **Absolute imports** for internal modules (configured aliases):
  - `@` → `src/renderer/`
  - `@main` → `src/main/`
  - `@renderer` → `src/renderer/`
  - `@shared` → `packages/shared/src/`

```typescript
import { TaskConfig } from '@accomplish/shared';
import { useTaskStore } from '../stores/taskStore';
import logoImage from '/assets/logo.png';  // Assets use ES imports
```

### React Components

- **Use `'use client'`** directive at the top of client components
- **Default exports** for page components, **named exports** for UI primitives
- **Use `data-testid`** for E2E test selectors
- **Hooks order**: All hooks at top, then derived values, then early returns

```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import type { TaskConfig } from '@accomplish/shared';

interface Props {
  onSubmit: (config: TaskConfig) => void;
  disabled?: boolean;
}

export default function MyComponent({ onSubmit, disabled = false }: Props) {
  const [value, setValue] = useState('');
  const isValid = value.trim().length > 0;

  if (disabled) return null;

  const handleSubmit = useCallback(() => {
    onSubmit({ prompt: value });
  }, [value, onSubmit]);

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Error & Console Logging

- **Use try/catch** with specific error types
- **Log errors** with context: `console.error('[Module] Action failed:', err)`
- **Never use empty catch blocks**
- **Module prefix**: `[Main]`, `[IPC]`, `[Store]`, etc.

### IPC & State Management

- Wrap IPC handlers with `handle()` utility that catches and normalizes errors
- Use `assertTrustedWindow()` to validate IPC origin
- For Zustand: define state interface, use `create<TaskState>()`, spread state in `set()`

### Tailwind CSS

- Use **shadcn/ui** pattern: Radix UI primitives with Tailwind styling
- **UI components** go in `src/renderer/components/ui/`
- Use `cn()` utility with `clsx` and `tailwind-merge` for conditional classes

### Testing Patterns

- **Unit tests**: `__tests__/**/*.test.{ts,tsx}` in same directory as source
- **Test environment**: `jsdom` for renderer tests, `node` for main process tests
- **Use page objects** for E2E tests in `e2e/pages/`
- **Use `captureForAI()`** for AI-friendly screenshots with metadata

## Critical Notes

### Bundled Node.js

When spawning `node` or `npx` in the main process, add bundled Node.js bin directory to PATH. See `apps/desktop/src/main/utils/bundled-node.ts` for implementation.

### File Paths in Renderer

**Always use ES module imports for images**, never absolute paths:

```typescript
// CORRECT
import logoImage from '/assets/logo.png';
<img src={logoImage} alt="Logo" />;

// WRONG (breaks in packaged app)
<img src="/assets/logo.png" alt="Logo" />;
```
