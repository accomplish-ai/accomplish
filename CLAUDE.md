# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Accomplish is a standalone desktop automation assistant built with Electron. The app hosts a local React UI (bundled via Vite), communicating with the main process through `contextBridge` IPC. The main process spawns the OpenCode CLI (via `node-pty`) to execute user tasks. Users provide their own API key (Anthropic, OpenAI, Google, xAI, etc.) on first launch, stored securely via AES-256-GCM encryption.

## Common Commands

```bash
# Development
pnpm dev                                        # Run desktop app in dev mode (Vite + Electron)
pnpm dev:clean                                  # Dev mode with CLEAN_START=1 (clears stored data)

# Building
pnpm build                                      # Build all workspaces
pnpm build:desktop                              # Build desktop app only

# Type checking and linting
pnpm lint                                       # TypeScript checks
pnpm typecheck                                  # Type validation across all workspaces

# Testing
pnpm test                                       # Run all Vitest tests
pnpm test:unit                                  # Unit tests only
pnpm test:integration                           # Integration tests only
pnpm test:coverage                              # Tests with coverage
pnpm -F @accomplish/desktop test:e2e            # Docker-based E2E tests
pnpm -F @accomplish/desktop test:e2e:native     # Native Playwright E2E tests
pnpm -F @accomplish/desktop test:e2e:native:ui  # E2E with Playwright UI

# Cleanup
pnpm clean                                      # Clean build outputs and node_modules
```

## Publishing Packages (Changesets)

The `@accomplish_ai/agent-core` package is published to npm using [Changesets](https://github.com/changesets/changesets).

### Creating a Changeset
When making changes to the agent-core package, create a changeset:
```bash
pnpm changeset
```
This prompts you to:
1. Select `@accomplish_ai/agent-core`
2. Choose bump type (patch/minor/major)
3. Write a summary for the changelog

Commit the generated `.changeset/*.md` file with your PR.

### Release Process (Automated)
1. Merge PR with changeset files to `main`
2. GitHub Action creates a "Version Packages" PR
3. Review and merge the Version Packages PR
4. GitHub Action publishes `@accomplish_ai/agent-core` to npm

### PR Preview Releases
When a PR contains changesets, a snapshot release is automatically published:
```bash
npm install @accomplish_ai/agent-core@pr-<PR_NUMBER>
```

### Manual Release (if needed)
```bash
pnpm version-packages  # Apply changesets, bump versions
pnpm release           # Build and publish
```

## Architecture

### Monorepo Layout

```
apps/desktop/           # Electron app (main/preload/renderer)
packages/core/          # Core business logic (Node.js)
packages/shared/        # Shared TypeScript types and constants
```

### Package Dependency Graph

```
@accomplish/shared (types, constants)
        ↑
@accomplish/core (business logic, adapters, storage)
        ↑
@accomplish/desktop (Electron app)
```

### Desktop App Structure (`apps/desktop/src/`)

**Main Process** (`main/`):
- `index.ts` - Electron bootstrap, single-instance enforcement, `accomplish://` protocol handler
- `ipc/handlers.ts` - IPC handlers for task lifecycle, settings, onboarding, API keys, providers
- `ipc/task-callbacks.ts` - Bridges OpenCode events to renderer via IPC
- `opencode/` - Electron-specific OpenCode CLI integration
- `store/` - Electron-specific storage wrappers (delegates to core)
- `permission-api.ts` - HTTP servers for MCP permission bridge (ports 9226, 9227)
- `thought-stream-api.ts` - HTTP server for thought/checkpoint streaming (port 9228)

**Preload** (`preload/index.ts`):
- Exposes `window.accomplish` API via `contextBridge` (100+ methods)
- Provides `window.accomplishShell` for shell metadata

**Renderer** (`renderer/`):
- `main.tsx` - React entry with HashRouter
- `App.tsx` - Main routing, global dialogs (Sidebar, TaskLauncher, SettingsDialog)
- `pages/` - Home (task input), Execution (task view), History
- `stores/taskStore.ts` - Zustand store for all app state
- `components/ui/` - Reusable shadcn/ui-based components
- `lib/accomplish.ts` - Typed wrapper for the IPC API

### Core Package Structure (`packages/core/src/`)

**OpenCode Module** (`opencode/`):
- `adapter.ts` - `OpenCodeAdapter` class: PTY-based CLI spawning, message streaming
- `task-manager.ts` - `TaskManager` class: concurrent task management, queuing
- `config-generator.ts` - Generates OpenCode JSON config with providers, MCP servers, skills
- `stream-parser.ts` - Parses JSON messages from CLI output
- `completion/` - Task completion enforcement logic
- `proxies/` - Azure Foundry proxy, Moonshot proxy

**Storage Module** (`storage/`):
- `database.ts` - SQLite with better-sqlite3 (WAL mode, foreign keys)
- `secure-storage.ts` - AES-256-GCM encrypted storage for API keys
- `migrations/` - Schema migrations v001-v006
- `repositories/` - Data access layer (appSettings, providerSettings, taskHistory, skills)

**Other Modules**:
- `providers/` - Model configs, API key validation for all providers
- `skills/` - SkillsManager for custom prompt files
- `browser/` - Browser detection, Playwright installation
- `utils/` - Bundled Node.js paths, logging, sanitization

**MCP Tools** (`mcp-tools/`):
- `ask-user-question/` - User prompts
- `complete-task/` - Task completion signaling
- `dev-browser/`, `dev-browser-mcp/` - Browser automation
- `file-permission/` - File operation permissions
- `start-task/` - Task initialization
- `report-checkpoint/`, `report-thought/` - Progress reporting

### Shared Package Structure (`packages/shared/src/`)

**Types** (`types/`):
- `task.ts` - Task, TaskMessage, TaskStatus, TaskProgress, TaskUpdateEvent
- `permission.ts` - PermissionRequest, PermissionResponse, FileOperation
- `provider.ts` - ProviderType, ProviderConfig, ModelConfig, DEFAULT_PROVIDERS
- `providerSettings.ts` - ProviderId, ConnectedProvider, ProviderSettings, PROVIDER_META
- `opencode.ts` - OpenCodeMessage union type for CLI output
- `auth.ts` - ApiKeyConfig, BedrockCredentials
- `skills.ts` - Skill, SkillSource, SkillFrontmatter
- `todo.ts` - TodoItem

**Constants**:
- `constants.ts` - DEV_BROWSER_PORT (9224), DEV_BROWSER_CDP_PORT (9225)
- `constants/model-display.ts` - MODEL_DISPLAY_NAMES, getModelDisplayName()

### IPC Communication Flow

```
Renderer (React)
    ↓ window.accomplish.* calls
Preload (contextBridge)
    ↓ ipcRenderer.invoke
Main Process (handlers.ts)
    ↓ Core package (TaskManager, Storage, etc.)
    ↑ IPC events (task:update, permission:request, etc.)
Preload
    ↑ ipcRenderer.on callbacks
Renderer (taskStore subscriptions)
```

### Key IPC Events (Main → Renderer)

| Channel | Purpose |
|---------|---------|
| `task:update` | Task message updates |
| `task:update:batch` | Batched messages (50ms window) |
| `task:progress` | Startup stages, tool progress |
| `task:status-change` | Status transitions |
| `task:summary` | AI-generated summaries |
| `permission:request` | File/tool/question permissions |
| `todo:update` | Todo list updates |
| `auth:error` | OAuth token expiry |
| `debug:log` | Debug log entries |

### Supported Providers

16 providers: anthropic, openai, google, xai, deepseek, moonshot, zai, bedrock, azure-foundry, ollama, openrouter, litellm, minimax, lmstudio, custom

## Code Conventions

- TypeScript everywhere (no JS for app logic)
- Use `pnpm -F @accomplish/desktop ...` for desktop-specific commands
- Shared types go in `packages/shared/src/types/`
- Core business logic goes in `packages/core/src/`
- Renderer state via Zustand store actions
- IPC handlers in `src/main/ipc/handlers.ts` must match `window.accomplish` API in preload
- **Avoid nested ternaries** - Use mapper objects or if/else for readability
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

**Why:** In the packaged Electron app, the renderer loads via `file://` protocol, and absolute paths resolve to the filesystem root instead of the app bundle. ES imports use `import.meta.url` which works in both environments.

Static assets go in `apps/desktop/public/assets/`.

## Environment Variables

- `CLEAN_START=1` - Clear all stored data on app start
- `E2E_SKIP_AUTH=1` - Skip onboarding flow (for testing)
- `E2E_MOCK_TASK_EVENTS=1` - Mock task events (for testing)

## Testing

### E2E Tests (Playwright)
- Config: `apps/desktop/e2e/playwright.config.ts`
- Tests: `apps/desktop/e2e/specs/`
- Page objects: `apps/desktop/e2e/pages/`
- Serial execution (Electron requirement)
- Docker support: `apps/desktop/e2e/docker/`

### Unit/Integration Tests (Vitest)
- Desktop config: `apps/desktop/vitest.config.ts`
- Core config: `packages/core/vitest.config.ts`
- Coverage thresholds: 80% statements/functions/lines, 70% branches

## Bundled Node.js

The packaged app bundles standalone Node.js v20.18.1 binaries to ensure MCP servers work on machines without Node.js installed.

### Key Files
- `packages/core/src/utils/bundled-node.ts` - Bundled node/npm/npx path utilities
- `apps/desktop/scripts/download-nodejs.cjs` - Downloads Node.js binaries
- `apps/desktop/scripts/after-pack.cjs` - Copies binary into app bundle

### CRITICAL: Spawning npx/node in Main Process

**IMPORTANT:** When spawning `npx` or `node` in the main process, you MUST add the bundled Node.js bin directory to PATH.

```typescript
import { spawn } from 'child_process';
import { getNpxPath, getBundledNodePaths } from '@accomplish/core/utils';

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

**Why:** Without adding `bundledPaths.binDir` to PATH, spawned processes fail with exit code 127 ("node not found") on machines without system-wide Node.js.

### For MCP Server Configs

Pass `NODE_BIN_PATH` in environment so spawned servers can add it to their PATH:

```typescript
environment: {
  NODE_BIN_PATH: bundledPaths?.binDir || '',
}
```

## Key Behaviors

- Single-instance enforcement - second instance focuses existing window
- API keys stored with AES-256-GCM encryption using machine-derived keys
- API key validation via test request to respective provider APIs
- OpenCode CLI permissions bridged to UI via HTTP servers (ports 9226-9228)
- Task output streams through batched IPC events (50ms window)
- Task completion enforcement ensures proper task termination

## SQLite Storage

App data is stored in SQLite (`accomplish.db` in production, `accomplish-dev.db` in development) located in the user data directory.

### Database Structure

```
packages/core/src/storage/
├── database.ts                  # Connection singleton, WAL mode, foreign keys
├── migrations/
│   ├── index.ts                 # Migration runner with version checking
│   ├── v001-initial.ts          # Initial schema + legacy import
│   ├── v002-azure-foundry.ts    # Azure Foundry config
│   ├── v003-lmstudio.ts         # LM Studio support
│   ├── v004-openai-base-url.ts  # Custom OpenAI base URL
│   ├── v005-task-todos.ts       # Task todos table
│   └── v006-skills.ts           # Skills table
└── repositories/
    ├── appSettings.ts           # Debug mode, onboarding, selected model
    ├── providerSettings.ts      # Connected providers, active provider
    ├── taskHistory.ts           # Tasks with messages and attachments
    └── skills.ts                # Skill CRUD operations
```

### Adding New Migrations

1. Create `packages/core/src/storage/migrations/vXXX-description.ts`:
```typescript
import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 7,  // Increment from CURRENT_VERSION
  up(db: Database): void {
    db.exec(`ALTER TABLE app_settings ADD COLUMN new_field TEXT`);
  },
};
```

2. Update `packages/core/src/storage/migrations/index.ts`:
```typescript
import { migration as v007 } from './v007-description';

export const CURRENT_VERSION = 7;  // Update this

const migrations: Migration[] = [...existingMigrations, v007];  // Add to array
```

### Rollback Protection

If a user opens data from a newer app version, startup is blocked with a dialog prompting them to update. This prevents data corruption from schema mismatches.

## Secure Storage

API keys are stored using AES-256-GCM encryption with machine-derived keys. The `SecureStorage` class in `packages/core/src/storage/secure-storage.ts` handles:
- API key storage/retrieval by provider
- AWS Bedrock credentials
- Atomic file writes
- Key masking for display

## TypeScript Configuration

### Path Aliases (Desktop)

```typescript
"@/*"                  → "src/renderer/*"
"@main/*"              → "src/main/*"
"@shared/*"            → "../../packages/shared/src/*"
"@accomplish/shared"   → "../../packages/shared/src/index.ts"
"@accomplish/core"     → "../../packages/core/src/index.ts"
"@accomplish/core/*"   → "../../packages/core/src/*"
```

## Styling

- Framework: Tailwind CSS + shadcn/ui
- CSS variables for theming
- Font: DM Sans
- Animation library: Framer Motion
- Reusable variants in `src/renderer/lib/animations.ts`

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` - Core tests, unit tests, integration tests, typecheck, E2E
- `release.yml` - Version bump, build, publish to GitHub releases
- `commitlint.yml` - Conventional commit validation
