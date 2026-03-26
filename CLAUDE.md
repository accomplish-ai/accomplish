# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Full architecture details are in [AGENTS.md](AGENTS.md) and [docs/architecture.md](docs/architecture.md).
Full project rules are in [.claude/PROJECT_RULES.md](.claude/PROJECT_RULES.md).

## Monorepo Layout

```
apps/desktop/          # Electron shell: main process, preload, loads web build output
apps/web/              # Standalone React UI (Vite + React Router + Zustand)
apps/daemon/           # Background daemon process — plain Node.js, NO electron imports allowed
packages/agent-core/   # Core business logic, types, storage, MCP tools (@accomplish_ai/agent-core, ESM)
```

## Commands

```bash
# Dev
pnpm dev                                     # Desktop app (web dev server + Electron)
pnpm dev:web                                 # Web UI only (localhost:5173)
pnpm dev:clean                               # Dev with CLEAN_START=1 (clears stored data)

# Build
pnpm build                                   # All workspaces
pnpm build:web                               # Web UI only
pnpm build:desktop                           # Desktop (builds web first)
pnpm clean                                   # Clean build outputs and node_modules

# Typecheck / Lint / Format
pnpm typecheck && pnpm lint:eslint && pnpm format:check
pnpm format                                  # Prettier auto-fix (write mode)

# Tests — always workspace-scoped (no root-level test commands)
pnpm -F @accomplish/web test:unit            # Web unit tests
pnpm -F @accomplish/web test:integration     # Web integration tests
pnpm -F @accomplish/desktop test:unit        # Desktop main-process unit tests
pnpm -F @accomplish/desktop test:integration # Desktop integration tests
pnpm -F @accomplish/desktop test:e2e:native  # Playwright E2E tests (serial, Electron)
pnpm -F @accomplish_ai/agent-core test       # Agent-core tests
pnpm -F @accomplish/daemon test              # Daemon tests

# Run a single test file
pnpm -F @accomplish/desktop vitest run --config vitest.unit.config.ts path/to/file.unit.test.ts
pnpm -F @accomplish/web vitest run --config vitest.unit.config.ts path/to/file.unit.test.ts

# Environment variables for dev/testing
# CLEAN_START=1           — clear all stored data on start
# E2E_SKIP_AUTH=1         — skip onboarding flow
# E2E_MOCK_TASK_EVENTS=1  — mock task events
# ACCOMPLISH_BUNDLED_MCP=1 — bundle MCP tools (used in package/release scripts only)
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
  ↓ forks child process on startup
Daemon (apps/daemon) — plain Node.js, handles storage via DaemonRpcServer
  ↑ IPC events → taskStore subscriptions in renderer
```

The daemon is a **child process** forked by the Electron main process. It handles storage queries via RPC (`DaemonRpcServer` / `DaemonClient`). It must never import from `electron`.

### Adding an IPC handler (required sequence)

1. Handler in `apps/desktop/src/main/ipc/handlers.ts`
2. Expose via `contextBridge` in `apps/desktop/src/preload/index.ts`
3. Typed wrapper in `apps/web/src/client/lib/accomplish.ts`
4. Consume from components or `apps/web/src/client/stores/taskStore.ts`
5. `pnpm typecheck` to verify the full chain

Never skip a step — all 4 must be done together.

### agent-core

- **ESM package** (`"type": "module"`) — all internal imports must use `.js` extensions
- Shared types: `packages/agent-core/src/common/types/`
- Factories are the public API: `createTaskManager`, `createStorage`, `createPermissionHandler`, etc.
- Do not use internal classes directly; use factories

### SQLite / Migrations

- DB: `accomplish.db` (prod) / `accomplish-dev.db` (dev), in Electron user-data directory
- Current schema version: **6** (in `packages/agent-core/src/storage/migrations/index.ts`)
- To add a migration: create `vXXX-description.ts`, import + add to the `migrations` array, bump `CURRENT_VERSION`
- **Never modify released migration files** — always add a new one

### Bundled Node.js

The packaged app ships Node.js v20.18.1. When spawning `npx`/`node` in the main process,
prepend `bundledPaths.binDir` to `PATH` — otherwise processes fail with exit code 127 on
machines without system Node.js. See [docs/architecture.md](docs/architecture.md#spawning-npxnode-in-main-process).

## TypeScript Path Aliases

| Alias                              | Resolves to                         |
| ---------------------------------- | ----------------------------------- |
| `@/*` (web only)                   | `apps/web/src/client/*`             |
| `@main/*` (desktop only)           | `apps/desktop/src/main/*`           |
| `@accomplish_ai/agent-core`        | `packages/agent-core/src/index.ts`  |
| `@accomplish_ai/agent-core/common` | `packages/agent-core/src/common.ts` |

Desktop does **not** have an `@/*` alias — UI code lives in `apps/web`.

## Critical Rules

### Code

- **No `require()` in agent-core** — it is ESM; use `import`
- **`.js` extensions required** on all imports within agent-core and daemon
- **No `electron` imports in `apps/daemon`** — it runs as plain Node.js
- **Image assets** must use ES module imports (`import logo from '/assets/logo.png'`), never absolute paths — they break in the packaged app
- **Always use braces** for `if`/`else`/`for`/`while` (enforced by ESLint `curly` rule)
- **No nested ternaries** — use mapper objects or if/else
- **No root-level test scripts** — always use `-F @accomplish/web`, `-F @accomplish/desktop`, or `-F @accomplish_ai/agent-core`
- **Reuse UI components** — check `apps/web/src/client/components/ui/` before creating new ones
- **New files must be < 200 lines** — split into logical modules if needed (exceptions: generated files, migrations)
- **No `console.log` in production code** — use the app's existing logger
- **No Node.js-only imports in web code** — `apps/web` runs in the browser; importing `fs`, `path`, `crypto`, or Node-only SDKs breaks the build. Run `pnpm build:web` to catch leaks.
- **Never roll custom encryption** — use `SecureStorage` from agent-core (AES-256-GCM with atomic writes)
- **Migrations must explain WHY** — add a comment in `up()` explaining the reason for the schema change
- **Async store actions need token guards** — capture a request token before async calls, validate before applying results to prevent stale state overwrites (see `_taskStateToken` pattern in `taskStore.ts`)

### Never remove features

Do not delete, comment out, or disable existing functionality unless the task explicitly
requires removal. If unsure, ask before removing. This applies to: exported functions,
components, types, IPC handlers, UI elements, routes, and config entries.

### Git

- **Always pull `main` before branching**: `git checkout main && git pull origin main`
- **Branch naming**: `feat/ENG-XXX-short-description` or `fix/ENG-XXX-short-description`
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`
- **Never force-push** a branch that has an open PR

### Pre-push checklist (run in order)

```bash
# 1. Install deps if any package.json changed
git diff --name-only origin/main...HEAD | grep "package\.json" && pnpm install

# 2. Typecheck → Lint → Format → Build
pnpm typecheck && pnpm lint:eslint && pnpm format:check && pnpm build

# 3. Tests — only workspaces with changed files
pnpm -F @accomplish/web test:unit          # if apps/web changed
pnpm -F @accomplish/desktop test:unit      # if apps/desktop changed
pnpm -F @accomplish_ai/agent-core test     # if packages/agent-core changed
pnpm -F @accomplish/daemon test            # if apps/daemon changed
```

Do not push if any step fails.

## Styling

Tailwind CSS + shadcn/ui, CSS variables for theming (no hardcoded colors), DM Sans font,
Framer Motion for animations via `apps/web/src/client/lib/animations.ts`.
