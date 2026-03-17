# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full conventions, workflows, and architecture details are in [AGENTS.md](AGENTS.md) and [docs/architecture.md](docs/architecture.md).

## Monorepo Layout

```
apps/desktop/          # Electron shell: main process, preload, loads web build output
apps/web/              # Standalone React UI (Vite + React Router + Zustand)
packages/agent-core/   # Core business logic, types, storage, MCP tools (@accomplish_ai/agent-core, ESM)
```

## Commands

```bash
# Dev
pnpm dev                                     # Desktop app (web dev server + Electron)
pnpm dev:web                                 # Web UI only (localhost:5173)

# Build
pnpm build                                   # All workspaces
pnpm build:desktop                           # Desktop (builds web first)

# Typecheck / Lint / Format
pnpm typecheck && pnpm lint:eslint && pnpm format:check

# Tests — always workspace-scoped (no root-level test commands)
pnpm -F @accomplish/web test:unit            # Web unit tests
pnpm -F @accomplish/web test:integration     # Web integration tests
pnpm -F @accomplish/desktop test:unit        # Desktop main-process unit tests
pnpm -F @accomplish/desktop test:integration # Desktop integration tests
pnpm -F @accomplish_ai/agent-core test       # Agent-core tests

# Run a single test file
pnpm -F @accomplish/desktop vitest run --config vitest.unit.config.ts path/to/file.unit.test.ts
```

## Architecture

### Data flow

```
React UI (apps/web)
  ↓ window.accomplish.* calls
Preload (contextBridge) — apps/desktop/src/preload/index.ts
  ↓ ipcRenderer.invoke / ipcRenderer.on
Main Process — apps/desktop/src/main/ipc/handlers.ts
  ↓ agent-core factories (TaskManager, Storage, etc.)
  ↑ IPC events → taskStore subscriptions in renderer
```

### Adding an IPC handler (required sequence)

1. Handler in `apps/desktop/src/main/ipc/handlers.ts`
2. Expose via `contextBridge` in `apps/desktop/src/preload/index.ts`
3. Typed wrapper in `apps/web/src/client/lib/accomplish.ts`
4. Consume from components or `apps/web/src/client/stores/taskStore.ts`
5. `pnpm typecheck` to verify the full chain

### agent-core

- **ESM package** (`"type": "module"`) — all internal imports must use `.js` extensions (e.g. `import { foo } from './utils/bar.js'`)
- Shared types: `packages/agent-core/src/common/types/`
- Factories are the public API: `createTaskManager`, `createStorage`, `createPermissionHandler`, etc.
- Do not use internal classes directly; use factories

### SQLite / Migrations

- DB: `accomplish.db` (prod) / `accomplish-dev.db` (dev), in Electron user-data directory
- Current schema version: **6** (in `packages/agent-core/src/storage/migrations/index.ts`)
- To add a migration: create `vXXX-description.ts`, import + add to the `migrations` array, bump `CURRENT_VERSION`
- Never modify released migration files — always add a new one

### Bundled Node.js

The packaged app ships Node.js v20.18.1. When spawning `npx`/`node` in the main process, prepend `bundledPaths.binDir` to `PATH`; otherwise processes fail with exit code 127 on machines without system Node.js. See [docs/architecture.md](docs/architecture.md#spawning-npxnode-in-main-process).

## TypeScript Path Aliases

| Alias                              | Resolves to                         |
| ---------------------------------- | ----------------------------------- |
| `@/*` (web only)                   | `apps/web/src/client/*`             |
| `@main/*` (desktop only)           | `apps/desktop/src/main/*`           |
| `@accomplish_ai/agent-core`        | `packages/agent-core/src/index.ts`  |
| `@accomplish_ai/agent-core/common` | `packages/agent-core/src/common.ts` |

Desktop does **not** have an `@/*` alias — UI code lives in `apps/web`.

## Critical Rules

- **No `require()` in agent-core** — it is ESM
- **`.js` extensions required** on all imports within agent-core
- **Image assets in web UI** must use ES module imports (`import logo from '/assets/logo.png'`), never absolute paths — they break in the packaged app
- **Always use braces** for `if`/`else`/`for`/`while` (enforced by ESLint `curly` rule)
- **No nested ternaries** — use mapper objects or if/else
- **No root-level test scripts** — always use `-F @accomplish/web`, `-F @accomplish/desktop`, or `-F @accomplish_ai/agent-core`
- **Reuse UI components** — check `apps/web/src/client/components/ui/` before creating new ones

## Styling

Tailwind CSS + shadcn/ui, CSS variables for theming, DM Sans font, Framer Motion for animations (`apps/web/src/client/lib/animations.ts`).
