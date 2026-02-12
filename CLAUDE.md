# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Accomplish is a standalone desktop automation assistant built with Electron. React UI (Vite) communicates with the main process via IPC exposed through `contextBridge`. The main process spawns the OpenCode CLI (via `node-pty`) to execute user tasks. API keys are stored with AES-256-GCM encryption.

## Common Commands

```bash
# Development
pnpm dev                                        # Run desktop app in dev mode (Vite + Electron)
pnpm dev:clean                                  # Dev mode with CLEAN_START=1 (clears stored data)

# Building
pnpm build                                      # Build all workspaces
pnpm build:desktop                              # Build desktop app only

# Type checking
pnpm lint                                       # TypeScript checks (all workspaces)
pnpm typecheck                                  # Type validation (all workspaces)

# Testing (desktop workspace — no root-level test scripts exist)
pnpm -F @accomplish/desktop test                # Run all Vitest tests
pnpm -F @accomplish/desktop test:unit           # Unit tests only
pnpm -F @accomplish/desktop test:integration    # Integration tests only
pnpm -F @accomplish/desktop test:coverage       # Tests with coverage (thresholds: 80% stmt/fn/line, 70% branch)
pnpm -F @accomplish/desktop test:e2e            # Docker-based E2E tests
pnpm -F @accomplish/desktop test:e2e:native     # Native Playwright E2E tests (serial, Electron requirement)

# Testing (agent-core)
pnpm -F @accomplish_ai/agent-core test          # Run agent-core Vitest tests

# Cleanup
pnpm clean                                      # Clean build outputs and node_modules
```

## Verification After Changes

Always verify before committing. Run the relevant commands for what you changed:

```bash
# After ANY code change — always run typecheck
pnpm typecheck

# After changing agent-core code
pnpm -F @accomplish_ai/agent-core test

# After changing desktop app code
pnpm -F @accomplish/desktop test

# After changing both packages
pnpm lint && pnpm typecheck

# Full verification before PR
pnpm lint && pnpm typecheck && pnpm -F @accomplish/desktop test && pnpm -F @accomplish_ai/agent-core test
```

## Do NOT

- **Do NOT use `require()`** in agent-core — it is ESM (`"type": "module"`)
- **Do NOT forget `.js` extensions** on imports within agent-core (e.g., `import { foo } from './utils/bar.js'` NOT `./utils/bar`)
- **Do NOT use absolute paths for images** in the renderer — use ES module imports (see Image Assets below)
- **Do NOT modify released migration files** — create a new migration instead
- **Do NOT add root-level test scripts** — tests are workspace-scoped (`-F @accomplish/desktop` or `-F @accomplish_ai/agent-core`)
- **Do NOT spawn `npx`/`node`** without adding bundled Node.js bin to PATH (see [architecture.md](docs/architecture.md#spawning-npxnode-in-main-process))

## Architecture

See [docs/architecture.md](docs/architecture.md) for full architecture details (monorepo layout, package structure, IPC flow, storage, bundled Node.js).

Key packages:
- `@accomplish_ai/agent-core` — Core business logic, types, storage, MCP tools (ESM, published to npm)
- `@accomplish/desktop` — Electron app (main/preload/renderer)

## Code Conventions

- TypeScript everywhere (no JS for app logic)
- **ESM package**: `@accomplish_ai/agent-core` uses `"type": "module"` — all imports MUST use `.js` extensions
- Shared types go in `packages/agent-core/src/common/types/`
- Core business logic goes in `packages/agent-core/src/`
- Renderer state via Zustand store actions
- IPC handlers in `src/main/ipc/handlers.ts` must match `window.accomplish` API in preload
- **Always use braces for `if`/`else`/`for`/`while`** - No single-line braceless statements (enforced by `curly` ESLint rule)
- **Avoid nested ternaries** - Use mapper objects or if/else for readability
- **No unnecessary comments** - Don't add comments that restate what the code does. Comments should explain *why*, not *what*
- **Reuse UI components** - Check `src/renderer/components/ui/` before creating new ones

### Image Assets in Renderer

**IMPORTANT:** Always use ES module imports for images in the renderer, never absolute paths.

```typescript
// CORRECT - Use ES imports
import logoImage from '/assets/logo.png';
<img src={logoImage} alt="Logo" />

// WRONG - Absolute paths break in packaged app
<img src="/assets/logo.png" alt="Logo" />
```

**Why:** In the packaged Electron app, the renderer loads via `file://` protocol. Absolute paths resolve to the filesystem root instead of the app bundle.

Static assets go in `apps/desktop/public/assets/`.

## Common Workflows

### Adding a New IPC Handler

1. Add the handler in `apps/desktop/src/main/ipc/handlers.ts`
2. Expose the method in `apps/desktop/src/preload/index.ts` via `contextBridge`
3. Add the typed wrapper in `apps/desktop/src/renderer/lib/accomplish.ts`
4. Use from components or `taskStore.ts`
5. Run `pnpm typecheck` to verify the chain matches

### Adding a New Migration

1. Create `packages/agent-core/src/storage/migrations/vXXX-description.ts` (use `.js` extension in imports)
2. Import and add to the `migrations` array in `packages/agent-core/src/storage/migrations/index.ts`
3. Bump `CURRENT_VERSION` (currently 6)
4. Run `pnpm -F @accomplish_ai/agent-core test`

### Changing Agent-Core Public API

1. Add/modify the implementation in `packages/agent-core/src/`
2. Export from `packages/agent-core/src/index.ts` (or `common.ts` for shared types)
3. All internal imports must use `.js` extensions
4. Run `pnpm typecheck` to verify downstream consumers still compile

### Publishing Agent-Core Changes

1. Run `pnpm changeset` and select `@accomplish_ai/agent-core`
2. Choose bump type (patch/minor/major) and write a summary
3. Commit the generated `.changeset/*.md` file with your PR
4. Automated: merge triggers "Version Packages" PR → merge that → npm publish

## TypeScript Path Aliases (Desktop)

```typescript
"@/*"                              → "src/renderer/*"
"@main/*"                          → "src/main/*"
"@accomplish_ai/agent-core"        → "../../packages/agent-core/src/index.ts"
"@accomplish_ai/agent-core/*"      → "../../packages/agent-core/src/*"
"@accomplish_ai/agent-core/common" → "../../packages/agent-core/src/common.ts"
```

## Environment Variables

- `CLEAN_START=1` - Clear all stored data on app start
- `E2E_SKIP_AUTH=1` - Skip onboarding flow (for testing)
- `E2E_MOCK_TASK_EVENTS=1` - Mock task events (for testing)
- `ACCOMPLISH_BUNDLED_MCP=1` - Bundle MCP tools in packaged build (used in package/release scripts)

## Testing

### E2E Tests (Playwright)
- Config: `apps/desktop/e2e/playwright.config.ts`
- Tests: `apps/desktop/e2e/specs/`
- Page objects: `apps/desktop/e2e/pages/`
- Serial execution (Electron requirement)
- Docker support: `apps/desktop/e2e/docker/`

### Unit/Integration Tests (Vitest)
- Desktop config: `apps/desktop/vitest.config.ts`
- Agent-core config: `packages/agent-core/vitest.config.ts`
- Coverage thresholds (desktop): 80% statements/functions/lines, 70% branches

## Styling

- Framework: Tailwind CSS + shadcn/ui
- CSS variables for theming
- Font: DM Sans
- Animation library: Framer Motion
- Reusable variants in `src/renderer/lib/animations.ts`

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` - Core tests, unit tests, integration tests, typecheck, E2E
- `release.yml` - Desktop app build and publish to GitHub releases
- `commitlint.yml` - Conventional commit validation
- `publish-packages.yml` - Changeset-based npm package publishing
- `pr-preview-release.yml` - PR snapshot releases for changesets
