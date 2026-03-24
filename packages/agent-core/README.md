# @accomplish_ai/agent-core

Core library for the Accomplish desktop automation assistant. Provides factory-based APIs for task management, persistent storage, permission handling, logging, and more.

## Usage

This package is internal to the Accomplish monorepo and is consumed via workspace dependencies (for example, `"@accomplish_ai/agent-core": "workspace:*"`).

## Quick Start

```typescript
import { createStorage, createTaskManager } from '@accomplish_ai/agent-core';

// Initialize storage (SQLite + encrypted secure storage)
const storage = createStorage({
  databasePath: '/path/to/accomplish.db',
  userDataPath: '/path/to/user-data',
});
storage.initialize();

// Set up a task manager
const taskManager = createTaskManager({
  defaultWorkingDirectory: process.cwd(),
  isCliAvailable: async () => true,
  adapterOptions: {
    platform: process.platform,
    isPackaged: false,
    tempPath: '/tmp',
    getCliCommand: () => ({ command: 'opencode', args: [] }),
    buildEnvironment: async () => ({ ...process.env }),
    buildCliArgs: async (config, taskId) => [config.prompt],
  },
});

// Start a task
await taskManager.startTask(
  'task-1',
  { prompt: 'Hello' },
  {
    onMessage: (msg) => console.log(msg),
    onProgress: (p) => console.log(p.stage),
    onPermissionRequest: (req) => console.log(req),
    onComplete: (result) => console.log('Done:', result),
    onError: (err) => console.error(err),
  },
);
```

## API

The package exports seven factory functions. Each returns an interface that hides internal implementation details.

### createTaskManager(options) → TaskManagerAPI

Spawns and manages OpenCode CLI tasks via PTY. Supports concurrent task execution, queuing, cancellation, and lifecycle callbacks (messages, progress, permissions, completion).

```typescript
import { createTaskManager } from '@accomplish_ai/agent-core';
```

### createStorage(options) → StorageAPI

SQLite-backed storage for tasks, app settings, and provider configuration. Includes AES-256-GCM encrypted secure storage for API keys. Combines `TaskStorageAPI`, `AppSettingsAPI`, `ProviderSettingsAPI`, `SecureStorageAPI`, and `DatabaseLifecycleAPI` into a single interface.

```typescript
import { createStorage } from '@accomplish_ai/agent-core';
```

### createPermissionHandler(options?) → PermissionHandlerAPI

Handles file operation and tool permission requests from running tasks. Creates request/response pairs with configurable timeouts, validates incoming request data, and builds structured permission request objects.

```typescript
import { createPermissionHandler } from '@accomplish_ai/agent-core';
```

### createThoughtStreamHandler(options?) → ThoughtStreamAPI

Streams AI thought and checkpoint events from MCP tools. Tracks active tasks, validates incoming thought/checkpoint data, and categorizes events (observation, reasoning, decision, action).

```typescript
import { createThoughtStreamHandler } from '@accomplish_ai/agent-core';
```

### createLogWriter(options) → LogWriterAPI

Structured rotating log file writer with buffered writes. Supports multiple log sources (main, mcp, browser, opencode, env, ipc) and configurable rotation size, retention period, and flush intervals.

```typescript
import { createLogWriter } from '@accomplish_ai/agent-core';
```

### createSkillsManager(options) → SkillsManagerAPI

Manages custom prompt skill files. Loads skills from bundled and user directories, supports enabling/disabling, adding, deleting, and reading skill content.

```typescript
import { createSkillsManager } from '@accomplish_ai/agent-core';
```

### createSpeechService(options) → SpeechServiceAPI

Speech-to-text transcription via ElevenLabs. Validates API keys, transcribes audio buffers, and returns structured results with confidence scores and duration.

```typescript
import { createSpeechService } from '@accomplish_ai/agent-core';
```

### Browser Configuration

The config generator accepts a `browser` option to control how the agent connects to a browser:

```typescript
import { generateConfig, type BrowserConfig } from '@accomplish_ai/agent-core';

// Default — uses the dev-browser HTTP server
generateConfig({ browser: { mode: 'builtin' } });

// Remote CDP — connect to any Chrome DevTools Protocol endpoint
generateConfig({
  browser: {
    mode: 'remote',
    cdpEndpoint: 'http://localhost:9222',
    cdpHeaders: { 'X-CDP-Secret': 'token' }, // optional auth
  },
});

// No browser — omits browser tools entirely
generateConfig({ browser: { mode: 'none' } });
```

| Mode      | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `builtin` | Default. Connects via the dev-browser HTTP server (used by the desktop app).    |
| `remote`  | Connects directly to a CDP endpoint (headless Chromium, remote browser, etc.).  |
| `none`    | Disables browser tools. Strips browser identity from the agent's system prompt. |

## Sub-path Exports

The package provides a `common` sub-path export for browser-safe types and constants that can be used in renderer or browser contexts without pulling in Node.js dependencies:

```typescript
import {
  // Types
  type TaskStatus,
  type TaskConfig,
  type PermissionRequest,
  type ProviderId,
  type OpenCodeMessage,

  // Constants
  DEFAULT_PROVIDERS,
  PROVIDER_META,
  MODEL_DISPLAY_NAMES,

  // Utility functions
  createTaskId,
  getModelDisplayName,
  isWaitingForUser,
} from '@accomplish_ai/agent-core/common';
```

## Requirements

- **Node.js >= 20**
- Native dependencies: [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (SQLite), [`node-pty`](https://github.com/microsoft/node-pty) (PTY for CLI spawning). These require a C++ build toolchain for installation.

## License

MIT
