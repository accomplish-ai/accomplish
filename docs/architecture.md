```
apps/desktop/            # Electron app (main/preload/renderer)
apps/daemon/             # Background daemon process for task execution
packages/agent-core/     # Core business logic, shared types, MCP tools (published as @accomplish_ai/agent-core)
```

- `index.ts` - Electron bootstrap, single-instance enforcement, `accomplish://` protocol handler
- `ipc/handlers.ts` - IPC handlers for task lifecycle, settings, onboarding, API keys, providers
- `ipc/validation.ts` - IPC validation utilities
- `opencode/` - Electron-specific OpenCode CLI integration
- `store/` - Electron-specific storage wrappers (delegates to agent-core)
- `logging/` - Log collector and file writer
- `skills/` - SkillsManager wrapper
- `utils/` - Bundled Node.js helpers, system path utilities
- `daemon-client.ts` - Connects to the background daemon process for task execution

### Preload (`preload/index.ts`)
