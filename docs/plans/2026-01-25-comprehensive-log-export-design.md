# Comprehensive Log Export

Export all application logs from startup to file for self-service troubleshooting and debugging.

## Problem

Current debug panel only shows task execution logs. Users and developers can't see:
- MCP server startup failures
- Browser/Playwright issues
- Node.js/environment problems
- API/provider errors with full context

This info only visible when running app from terminal.

## Solution

Persistent log file written from app startup. Export button in Settings.

## Architecture

### New Files

```
src/main/logging/
├── log-collector.ts      # Central service, captures all sources
├── log-file-writer.ts    # File I/O, rotation, buffering
└── redact.ts             # Sensitive data redaction
```

### Log Storage

- Location: `~/.accomplish-data/logs/app-YYYY-MM-DD.log`
- Format: Plain text, one entry per line
- Rotation: Daily, keep last 7 days
- Max size: 50MB/day

### Entry Format

```
[2026-01-25T10:23:45.123Z] [INFO] [main] App starting, version 1.2.3
[2026-01-25T10:23:45.456Z] [INFO] [mcp] Starting server: dev-browser
[2026-01-25T10:23:46.789Z] [ERROR] [mcp] dev-browser failed: ENOENT
[2026-01-25T10:23:47.012Z] [DEBUG] [opencode] PTY spawned, PID: 12345
```

## Log Sources

| Source | Tag | What's Captured |
|--------|-----|-----------------|
| Main process console | `[main]` | All console.log/warn/error |
| MCP servers | `[mcp]` | Server name, command, port, success/failure, errors |
| Browser/Playwright | `[browser]` | Browser selection, install progress, spawn errors |
| OpenCode CLI | `[opencode]` | PTY spawn, output chunks, parsed events, exit codes |
| Environment | `[env]` | Bundled Node path, PATH, OS info, app version, API key validation |
| IPC traffic | `[ipc]` | Channel name, timing (skip high-frequency events) |

## Capture Methods

### Console Interception

Override `console.log/warn/error` at startup before anything else runs. Route to LogCollector while preserving original output.

### MCP Server Status

Hook into `TaskManager` and config generator. Log server lifecycle events.

### Browser Logs

Capture `__devBrowserLogs` output. Log browser selection and spawn results.

### OpenCode CLI

Hook into `OpenCodeAdapter` debug events (already emits these). Log PTY lifecycle.

### Environment Diagnostics

Log at startup: bundled Node path, PATH contents, OS info, app version. Log API key validation results (redacted).

### IPC Traffic

Wrap `ipcMain.handle` to log channel name + timing. Summarize high-frequency events.

## Redaction

All writes pass through `redact()` function:
- Match patterns: API keys, tokens, secrets
- Replace with `[REDACTED]`
- Always on, no option to disable

## Export Flow

1. User clicks "Export Logs" button in Settings (next to debug toggle)
2. Native file save dialog, default: `openwork-logs-YYYY-MM-DD-HHmmss.txt`
3. Combine current day's log + in-memory buffer
4. Save to user-selected location
5. Toast: "Logs exported successfully"

### IPC

```
Renderer: window.accomplish.exportLogs()
  → Main: ipcMain.handle('logs:export')
  → LogCollector.export()
  → dialog.showSaveDialog()
  → fs.copyFile() with flush
  → return success/path
```

### Edge Cases

- Fresh install with no logs: export empty file with header
- Export fails: show error toast with reason

## Rotation & Cleanup

### Daily Rotation

- New file each day based on timestamp
- Check date on each write

### Retention

- Keep last 7 days
- Cleanup runs at app startup
- Delete `app-*.log` older than 7 days

### Buffered Writes

- Buffer 100 entries or 5 seconds
- Flush on interval, app quit, and export
- Crash loses at most last few seconds (acceptable trade-off)

## Files to Modify

```
src/main/index.ts                  # Initialize LogCollector first
src/main/ipc/handlers.ts           # Add 'logs:export' handler
src/main/opencode/adapter.ts       # Route debug events to LogCollector
src/main/opencode/task-manager.ts  # Log MCP/browser events
src/preload/index.ts               # Expose exportLogs()
src/renderer/pages/Settings.tsx    # Add Export Logs button
packages/shared/src/types/         # IPC types if needed
```

## Initialization Order

1. `LogCollector.initialize()` — first after app ready
2. Console interception active
3. Rest of startup proceeds (all logs captured)

## Testing

- Manual: trigger various failures, export, verify contents
- Verify redaction on API keys
- Verify rotation deletes old files
