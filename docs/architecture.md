# Architecture

## Monorepo Layout

```
apps/desktop/            # Electron app (main/preload/renderer)
packages/agent-core/     # Core business logic, shared types, MCP tools (published as @accomplish_ai/agent-core)
```

## Package Dependency Graph

```
@accomplish_ai/agent-core (business logic, types, constants, storage, MCP tools)
        ↑
@accomplish/desktop (Electron app)
```

## Desktop App Structure (`apps/desktop/src/`)

### Main Process (`main/`)

- `index.ts` - Electron bootstrap, single-instance enforcement, `accomplish://` protocol handler
- `ipc/handlers.ts` - IPC handlers for task lifecycle, settings, onboarding, API keys, providers
- `ipc/task-callbacks.ts` - Bridges OpenCode events to renderer via IPC
- `ipc/validation.ts` - IPC validation utilities
- `opencode/` - Electron-specific OpenCode CLI integration
- `store/` - Electron-specific storage wrappers (delegates to agent-core)
- `services/` - Speech-to-text, summarizer
- `logging/` - Log collector and file writer
- `skills/` - SkillsManager wrapper
- `utils/` - Bundled Node.js helpers, system path utilities
- `permission-api.ts` - HTTP servers for MCP permission bridge (ports 9226, 9227)
- `thought-stream-api.ts` - HTTP server for thought/checkpoint streaming (port 9228)

### Preload (`preload/index.ts`)

- Exposes `window.accomplish` API via `contextBridge`
- Provides `window.accomplishShell` for shell metadata

### Renderer (`renderer/`)

- `main.tsx` - React entry with HashRouter
- `App.tsx` - Main routing, global dialogs (Sidebar, TaskLauncher, SettingsDialog)
- `pages/` - Home (task input), Execution (task view), History
- `stores/taskStore.ts` - Zustand store for all app state
- `components/ui/` - Reusable shadcn/ui-based components
- `lib/accomplish.ts` - Typed wrapper for the IPC API

## Agent-Core Package Structure (`packages/agent-core/src/`)

### Internal Classes (`internal/classes/`)

Core class implementations used by factory functions:

- `OpenCodeAdapter` - PTY-based CLI spawning, message streaming
- `TaskManager` - Concurrent task management, queuing
- `StreamParser` - Parses JSON messages from CLI output
- `CompletionEnforcer` - Task completion enforcement
- `SecureStorage` - AES-256-GCM encrypted storage for API keys
- `SkillsManager` - Custom prompt files
- `LogCollector` / `LogFileWriter` - Log collection and writing
- `PermissionRequestHandler` - Permission request handling
- `ThoughtStreamHandler` - Thought/checkpoint streaming
- `SpeechService` - Speech/transcription
- `OpenCodeLogWatcher` - OpenCode log monitoring

### Factories (`factories/`)

Public API entry points -- prefer these over internal classes:

- `createTaskManager` - Task lifecycle management
- `createStorage` - SQLite storage access
- `createPermissionHandler` - Permission request handling
- `createThoughtStreamHandler` - Thought/checkpoint streaming
- `createLogWriter` - Log file writing
- `createSkillsManager` - Skills management
- `createSpeechService` - Speech/transcription

### Common (`common/`) -- shared types, constants, schemas

Previously `packages/shared`. Contains:

- `types/` - Task, Permission, Provider, Auth, Skills, Todo, OpenCode message types
- `constants.ts` - Ports (9224-9228), timeouts, log limits
- `constants/model-display.ts` - MODEL_DISPLAY_NAMES, getModelDisplayName()
- `schemas/` - Zod schemas for validation (taskConfig, permissionResponse, etc.)
- `utils/` - ID generators, log source detection, waiting detection

### Other Modules

- `opencode/` - Config generation, CLI resolution, stream parsing, completion enforcement, proxies (Azure Foundry, Moonshot)
- `storage/` - SQLite database, migrations, repositories, secure storage
- `providers/` - Model configs, API key validation for all 15 providers
- `services/` - Permission handler, speech, summarizer, thought-stream handler
- `browser/` - Browser detection, Playwright installation
- `utils/` - Bundled Node.js paths, logging, sanitization

### MCP Tools (`packages/agent-core/mcp-tools/` -- top-level, NOT inside `src/`)

- `ask-user-question/` - User prompts
- `complete-task/` - Task completion signaling
- `start-task/` - Task initialization
- `dev-browser/`, `dev-browser-mcp/` - Browser automation
- `file-permission/` - File operation permissions
- `safe-file-deletion/` - Safe file deletion
- `report-checkpoint/`, `report-thought/` - Progress reporting

## IPC Communication Flow

```
Renderer (React)
    ↓ window.accomplish.* calls
Preload (contextBridge)
    ↓ ipcRenderer.invoke
Main Process (handlers.ts)
    ↓ Agent-core (TaskManager, Storage, etc.)
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

## Supported Providers

15 providers (`ProviderType`): anthropic, openai, google, xai, deepseek, moonshot, zai, bedrock, azure-foundry, ollama, openrouter, litellm, minimax, lmstudio, custom

`ProviderId` (14) excludes `custom`.

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
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 7,  // Increment from CURRENT_VERSION (currently 6)
  up(db: Database): void {
    db.exec(`ALTER TABLE app_settings ADD COLUMN new_field TEXT`);
  },
};
```

2. Update `packages/agent-core/src/storage/migrations/index.ts`:
```typescript
import { migration as v007 } from './v007-description.js';

export const CURRENT_VERSION = 7;  // Update this

const migrations: Migration[] = [...existingMigrations, v007];  // Add to array
```

### Rollback Protection

If a user opens data from a newer app version, startup is blocked with a dialog prompting them to update (`FutureSchemaError`). This prevents data corruption from schema mismatches.

## Bundled Node.js

The packaged app bundles standalone Node.js v20.18.1 binaries to ensure MCP servers work on machines without Node.js installed.

### Key Files

- `packages/agent-core/src/utils/bundled-node.ts` - Bundled node/npm/npx path utilities
- `apps/desktop/scripts/download-nodejs.cjs` - Downloads Node.js binaries
- `apps/desktop/scripts/after-pack.cjs` - Copies binary into app bundle

### Spawning npx/node in Main Process

When spawning `npx` or `node` in the main process, you MUST add the bundled Node.js bin directory to PATH:

```typescript
import { spawn } from 'child_process';
import { getNpxPath, getBundledNodePaths } from '@accomplish_ai/agent-core/utils';

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

Without adding `bundledPaths.binDir` to PATH, spawned processes fail with exit code 127 ("node not found") on machines without system-wide Node.js.

### For MCP Server Configs

Pass `NODE_BIN_PATH` in environment so spawned servers can add it to their PATH:

```typescript
environment: {
  NODE_BIN_PATH: bundledPaths?.binDir || '',
}
```

## TypeScript Path Aliases (Desktop)

```typescript
"@/*"                              → "src/renderer/*"
"@main/*"                          → "src/main/*"
"@accomplish_ai/agent-core"        → "../../packages/agent-core/src/index.ts"
"@accomplish_ai/agent-core/*"      → "../../packages/agent-core/src/*"
"@accomplish_ai/agent-core/common" → "../../packages/agent-core/src/common.ts"
```
