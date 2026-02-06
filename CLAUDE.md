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

# Testing (run within workspace packages, no root-level test scripts)
pnpm -F @accomplish/agent-core test             # Run agent-core Vitest tests
pnpm -F @accomplish/agent-core test:coverage    # Agent-core tests with coverage
pnpm -F @accomplish/desktop test:e2e            # Docker-based E2E tests
pnpm -F @accomplish/desktop test:e2e:native     # Native Playwright E2E tests
pnpm -F @accomplish/desktop test:e2e:native:ui  # E2E with Playwright UI

# Cleanup
pnpm clean                                      # Clean build outputs and node_modules
```

## Architecture

### Monorepo Layout

```
apps/desktop/           # Electron app (main/preload/renderer)
packages/agent-core/    # Core business logic, types, constants (Node.js + browser-safe exports)
```

### Package Dependency Graph

```
@accomplish/agent-core (types, constants, business logic, storage)
        ↑
@accomplish/desktop (Electron app)
```

`@accomplish/agent-core` has two export entry points:
- `"."` (`index.ts`) — Full Node.js API: factories, storage, opencode, providers, utils, and re-exports of all common types
- `"./common"` (`common.ts`) — Browser-safe exports only: types, constants, schemas, pure utility functions

### Desktop App Structure (`apps/desktop/src/`)

**Main Process** (`main/`):
- `index.ts` - Electron bootstrap, single-instance enforcement, `accomplish://` protocol handler
- `config.ts` - Configuration for main process
- `ipc/handlers.ts` - IPC handlers for task lifecycle, settings, onboarding, API keys, providers
- `ipc/task-callbacks.ts` - Bridges OpenCode events to renderer via IPC
- `opencode/` - Electron-specific OpenCode CLI integration
- `store/` - Electron-specific storage (db, secure storage, legacy migration, electron-store import)
- `logging/` - Log file writer and log collector
- `services/` - Desktop-specific services (speech-to-text, summarizer)
- `skills/` - Desktop-specific SkillsManager
- `permission-api.ts` - HTTP servers for MCP permission bridge (ports 9226, 9227)
- `thought-stream-api.ts` - HTTP server for thought/checkpoint streaming (port 9228)

**Preload** (`preload/index.ts`):
- Exposes `window.accomplish` API via `contextBridge`
- Provides `window.accomplishShell` for shell metadata

**Renderer** (`renderer/`):
- `main.tsx` - React entry with HashRouter
- `App.tsx` - Main routing, global dialogs (Sidebar, TaskLauncher, SettingsDialog)
- `pages/` - Home (task input), Execution (task view), History
- `stores/taskStore.ts` - Zustand store for all app state
- `components/ui/` - Reusable shadcn/ui-based components
- `hooks/` - React hooks
- `lib/accomplish.ts` - Typed wrapper for the IPC API
- `lib/animations.ts` - Reusable Framer Motion animation variants
- `lib/model-utils.ts`, `lib/provider-logos.ts`, `lib/utils.ts`, `lib/waiting-detection.ts`

### Agent-Core Package Structure (`packages/agent-core/src/`)

**Factories Module** (`factories/`):
- `index.ts` - Re-exports all factory functions
- `task-manager.ts` - `createTaskManager()`: concurrent task management, queuing
- `storage.ts` - `createStorage()`: database and secure storage initialization
- `permission-handler.ts` - `createPermissionHandler()`: file/tool permission handling
- `thought-stream.ts` - `createThoughtStreamHandler()`: thought/checkpoint streaming
- `log-writer.ts` - `createLogWriter()`: structured log file writing
- `skills-manager.ts` - `createSkillsManager()`: custom prompt file management
- `speech.ts` - `createSpeechService()`: speech-to-text service

Factories are the **preferred API** — they return interfaces and hide internal implementation details.

**Services Module** (`services/`):
- `summarizer.ts` - AI-generated task summary service
- `speech.ts` - SpeechService implementation
- `thought-stream-handler.ts` - Thought/checkpoint stream processing
- `permission-handler.ts` - Permission request handling

**Internal Module** (`internal/`):
- `classes/` - Internal class implementations used by factories (not directly exported)

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
- `utils/` - Bundled Node.js paths, logging, sanitization, shell, network

**Common Module** (`common/`):
Browser-safe types, constants, schemas, and utility functions. Exported via `@accomplish/agent-core/common`.

- `types/` - All shared TypeScript types:
  - `task.ts` - Task, TaskMessage, TaskStatus, TaskProgress, TaskUpdateEvent
  - `permission.ts` - PermissionRequest, PermissionResponse, FileOperation
  - `provider.ts` - ProviderType, ProviderConfig, ModelConfig, DEFAULT_PROVIDERS
  - `providerSettings.ts` - ProviderId, ConnectedProvider, ProviderSettings, PROVIDER_META
  - `opencode.ts` - OpenCodeMessage union type for CLI output
  - `auth.ts` - ApiKeyConfig, BedrockCredentials
  - `skills.ts` - Skill, SkillSource, SkillFrontmatter
  - `todo.ts` - TodoItem
  - `logging.ts` - LogLevel, LogSource, LogEntry
  - `thought-stream.ts` - ThoughtEvent, CheckpointEvent
- `constants.ts` - DEV_BROWSER_PORT (9224), DEV_BROWSER_CDP_PORT (9225), THOUGHT_STREAM_PORT, etc.
- `constants/model-display.ts` - MODEL_DISPLAY_NAMES, getModelDisplayName()
- `schemas/validation.ts` - Zod validation schemas (taskConfigSchema, permissionResponseSchema, etc.)
- `utils/` - Browser-safe utilities (id.ts, waiting-detection.ts, log-source-detector.ts)

**MCP Tools** (`mcp-tools/`):
- `ask-user-question/` - User prompts
- `complete-task/` - Task completion signaling
- `dev-browser/`, `dev-browser-mcp/` - Browser automation
- `file-permission/` - File operation permissions
- `safe-file-deletion/` - Safe file deletion operations
- `start-task/` - Task initialization
- `report-checkpoint/`, `report-thought/` - Progress reporting

### IPC Communication Flow

```
Renderer (React)
    ↓ window.accomplish.* calls
Preload (contextBridge)
    ↓ ipcRenderer.invoke
Main Process (handlers.ts)
    ↓ Agent-core package (factories, storage, etc.)
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
| `task:thought` | Thought streaming events |
| `task:checkpoint` | Checkpoint streaming events |
| `permission:request` | File/tool/question permissions |
| `todo:update` | Todo list updates |
| `auth:error` | OAuth token expiry |
| `auth:callback` | OAuth callback handling |
| `settings:debug-mode-changed` | Debug mode setting changes |
| `debug:log` | Debug log entries |

### Supported Providers

15 providers: anthropic, openai, openrouter, google, xai, ollama, deepseek, moonshot, zai, azure-foundry, custom, bedrock, litellm, minimax, lmstudio

## Code Conventions

- TypeScript everywhere (no JS for app logic)
- Use `pnpm -F @accomplish/desktop ...` for desktop-specific commands
- Shared types go in `packages/agent-core/src/common/types/`
- Core business logic goes in `packages/agent-core/src/`
- Prefer factory functions (`createTaskManager`, `createStorage`, etc.) over direct class instantiation
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
- Desktop config: `apps/desktop/vitest.config.ts` (also `vitest.unit.config.ts`, `vitest.integration.config.ts`)
- Agent-core config: `packages/agent-core/vitest.config.ts`
- Coverage thresholds: 80% statements/functions/lines, 70% branches

## Bundled Node.js

The packaged app bundles standalone Node.js v20.18.1 binaries to ensure MCP servers work on machines without Node.js installed.

### Key Files
- `packages/agent-core/src/utils/bundled-node.ts` - Bundled node/npm/npx path utilities
- `apps/desktop/scripts/download-nodejs.cjs` - Downloads Node.js binaries
- `apps/desktop/scripts/after-pack.cjs` - Copies binary into app bundle

### CRITICAL: Spawning npx/node in Main Process

**IMPORTANT:** When spawning `npx` or `node` in the main process, you MUST add the bundled Node.js bin directory to PATH.

```typescript
import { spawn } from 'child_process';
import { getNpxPath, getBundledNodePaths } from '@accomplish/agent-core/utils';
import type { PlatformConfig } from '@accomplish/agent-core';

// getBundledNodePaths requires a PlatformConfig parameter
const platformConfig: PlatformConfig = {
  userDataPath: app.getPath('userData'),
  tempPath: app.getPath('temp'),
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
  platform: process.platform,
  arch: process.arch,
};

const npxPath = getNpxPath(platformConfig);
const bundledPaths = getBundledNodePaths(platformConfig);

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
packages/agent-core/src/storage/
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

1. Create `packages/agent-core/src/storage/migrations/vXXX-description.ts`:
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

2. Update `packages/agent-core/src/storage/migrations/index.ts`:
```typescript
import { migration as v007 } from './v007-description';

export const CURRENT_VERSION = 7;  // Update this

const migrations: Migration[] = [...existingMigrations, v007];  // Add to array
```

### Rollback Protection

If a user opens data from a newer app version, startup is blocked with a dialog prompting them to update. This prevents data corruption from schema mismatches.

## Secure Storage

API keys are stored using AES-256-GCM encryption with machine-derived keys. The `SecureStorage` class in `packages/agent-core/src/storage/secure-storage.ts` handles:
- API key storage/retrieval by provider
- AWS Bedrock credentials
- Atomic file writes
- Key masking for display

## TypeScript Configuration

### Path Aliases (Desktop)

```typescript
"@/*"                          → "src/renderer/*"
"@main/*"                      → "src/main/*"
"@accomplish/agent-core/common" → "../../packages/agent-core/src/common.ts"
"@accomplish/agent-core"        → "../../packages/agent-core/src/index.ts"
"@accomplish/agent-core/*"      → "../../packages/agent-core/src/*"
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
