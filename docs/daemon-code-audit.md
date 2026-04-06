# Daemon Code Audit — HISTORICAL

> **This document is historical.** It was written before the daemon migration to analyze dead code and duplication. All recommended removals have been completed. For the current architecture, see [`daemon-final-architecture.md`](daemon-final-architecture.md).

**Date:** 2026-03-25
**Scope:** All daemon-related code across the monorepo

---

## Executive Summary

The daemon subsystem contains **three separate implementations** of the same concept, built incrementally. Only one is active in production (the in-process fallback). The other two are unreachable dead code. Additionally, the active path duplicates logic already present in the IPC handlers, and several exported functions have zero callers.

---

## The Three Implementations

### 1. Socket Server in Main Process — `apps/desktop/src/main/daemon/server.ts`

**Status: DEAD CODE**

A Unix socket server (`net.createServer`) that listens on `daemon.sock` and dispatches JSON-RPC commands via `rpc-dispatcher.ts`.

- `startDaemonServer()` is exported but **never called** — zero import sites outside its own file.
- `stopDaemonServer()` — same, never called.
- `rpc-dispatcher.ts` (160 lines) — the full JSON-RPC dispatch engine — is only imported by `server.ts`.
- The only external reference is `settings-handlers.ts:80` which does a dynamic `import('../../daemon/server')` solely to call `getSocketPath()` for a `daemon:get-socket-path` IPC handler.

**Files affected (could be removed):**
| File | Lines |
|---|---|
| `apps/desktop/src/main/daemon/server.ts` | 174 |
| `apps/desktop/src/main/daemon/rpc-dispatcher.ts` | 160 |
| **Total** | **~334 lines** |

---

### 2. Child Process Daemon — `apps/desktop/src/main/daemon/entry.ts`

**Status: UNREACHABLE IN PRACTICE**

A `fork()`-ed Node.js child process that handles storage-only RPC methods. Compiled to `out/main/daemon/entry.cjs` by a custom Vite plugin.

- `bootstrapDaemon()` in `daemon-bootstrap.ts` tries to `fork()` this entry point first.
- If the fork fails (missing compiled file, import errors, timeout), it silently falls back to in-process mode.
- Even when it works, the child process **dies with the parent** because:
  - `fork()` is called without `detached: true` (child is in same process group)
  - `entry.ts:127-130` explicitly does `process.exit(0)` on parent disconnect
  - `daemon-lifecycle.ts:68-69` explicitly calls `daemonProcess.kill()` on shutdown
- Only registers storage queries (`task.get`, `task.list`, `task.delete`, `storage.*`) — no task execution.
- The in-process fallback registers the **exact same handlers** plus task execution, making the child process strictly less capable.

**Files affected:**
| File | Lines |
|---|---|
| `apps/desktop/src/main/daemon/entry.ts` | 158 |
| `apps/desktop/src/main/daemon/daemon-spawn.ts` | 117 |
| Vite plugin `buildDaemonEntry()` in `vite.config.ts` | ~40 |
| **Total** | **~315 lines** |

---

### 3. Standalone Daemon — `apps/daemon/`

**Status: COMPLETE BUT NEVER INTEGRATED**

A fully independent daemon process with:

- Unix domain socket RPC server (`DaemonRpcServer`)
- PID lock with stale detection (`~/.accomplish/daemon.pid`)
- Full task execution (`task.start`, `task.stop`, `task.interrupt`)
- Own PermissionService and ThoughtStreamService with HTTP servers
- Crash recovery (marks stale `running` tasks as `failed` on boot)
- Graceful shutdown with 30-second drain phase for active tasks
- Health check endpoint

**Nobody starts it.** The Electron app does not depend on `@accomplish/daemon`, does not import from it, and does not spawn it. It exists as an independent workspace package but has no integration point.

| File                                                                  | Lines                       |
| --------------------------------------------------------------------- | --------------------------- |
| `apps/daemon/src/index.ts`                                            | 373                         |
| `apps/daemon/src/task-service.ts`                                     | ~200+                       |
| `apps/daemon/src/permission-service.ts`                               | ~150+                       |
| `apps/daemon/src/thought-stream-service.ts`                           | ~100+                       |
| `apps/daemon/src/storage-service.ts`                                  | ~50+                        |
| `apps/daemon/src/health.ts`                                           | ~50+                        |
| + cli, pid, rate-limiter, http-server-factory, websocket, mcp-bridges |                             |
| **Total**                                                             | **~15 files, ~1200+ lines** |

---

## What Actually Runs in Production

```
Electron Main Process (single process, single thread)
├── IPC Handlers          ← serve all UI requests directly
├── TaskManager           ← singleton, runs tasks
├── StorageAPI            ← singleton, SQLite
├── DaemonServer          ← in-process (no socket, no child)
├── DaemonClient          ← in-process (function calls, no serialization)
├── Tray                  ← hide-to-tray on window close
└── Window                ← React renderer
```

The in-process DaemonClient/Server exist so that the scheduler (`addScheduledTask`) and CLI bridge (`cli-bridge.ts`) have an RPC interface. But the CLI bridge itself is also dead code — `handleCliCommand()` is exported but never called.

---

## Duplicated Logic

The following operations are implemented in **three places** with identical behavior:

| Operation                | IPC Handler (`task-handlers.ts`) | In-Process Handler (`daemon-inprocess-handlers.ts`) | Child Process (`entry.ts`)  |
| ------------------------ | -------------------------------- | --------------------------------------------------- | --------------------------- |
| `task.get`               | `storage.getTask()`              | `storage.getTask()`                                 | `storage.getTask()`         |
| `task.list`              | `storage.getTasks()`             | `storage.getTasks()`                                | `storage.getTasks()`        |
| `task.delete`            | `storage.deleteTask()`           | `storage.deleteTask()`                              | `storage.deleteTask()`      |
| `task.clearHistory`      | `storage.clearHistory()`         | `storage.clearHistory()`                            | `storage.clearHistory()`    |
| `task.getTodos`          | `storage.getTodosForTask()`      | `storage.getTodosForTask()`                         | `storage.getTodosForTask()` |
| `storage.saveTask`       | `storage.saveTask()`             | —                                                   | `storage.saveTask()`        |
| `storage.addTaskMessage` | `storage.addTaskMessage()`       | —                                                   | `storage.addTaskMessage()`  |
| `task.start`             | `taskManager.startTask()`        | `taskManager.startTask()`                           | **not implemented**         |
| `task.cancel`            | `taskManager.cancelTask()`       | `taskManager.cancelTask()`                          | **not implemented**         |

Additionally, `createTaskCallbacks()` and `createDaemonTaskCallbacks()` in `task-callbacks.ts` are near-duplicates (~230 + ~100 lines) differing mainly in how they resolve the window reference and whether they call `updateTray()`.

---

## Dead Code / Zero-Caller Exports

| Export                   | File                       | Callers                        |
| ------------------------ | -------------------------- | ------------------------------ |
| `startDaemonServer()`    | `daemon/server.ts`         | 0                              |
| `stopDaemonServer()`     | `daemon/server.ts`         | 0                              |
| `handleLine()`           | `daemon/rpc-dispatcher.ts` | only `server.ts` (itself dead) |
| `registerMethod()`       | `daemon/rpc-dispatcher.ts` | only `server.ts`               |
| `handleCliCommand()`     | `daemon/cli-bridge.ts`     | 0                              |
| `registerActiveTask()`   | `thought-stream-api.ts`    | 0                              |
| `unregisterActiveTask()` | `thought-stream-api.ts`    | 0                              |

---

## Recommendations

### Short term — Clean up dead code

1. **Remove** `server.ts` + `rpc-dispatcher.ts` (~334 lines). Move `getSocketPath()` to a utility if the IPC handler still needs it.
2. **Remove** `cli-bridge.ts` (~80 lines) — zero callers.
3. **Remove** `entry.ts` + `daemon-spawn.ts` + the Vite `buildDaemonEntry` plugin (~315 lines) — the in-process fallback is strictly superior and always wins in practice.
4. **Remove** thought-stream `registerActiveTask` / `unregisterActiveTask` exports, or wire them into the task lifecycle if they were intended to be called.

### Medium term — Reduce duplication

5. **Consolidate** `createTaskCallbacks()` and `createDaemonTaskCallbacks()` into one function with a config parameter for window resolution strategy and tray updates.
6. **Decide** whether IPC handlers should proxy through DaemonClient or call singletons directly — not both. Currently both paths exist and diverge in subtle ways.

### Long term — Integrate the standalone daemon

7. `apps/daemon/` is the correct architecture for a daemon that survives independently. The integration path is:
   - Electron app spawns it with `detached: true` + `child.unref()`, or connects to an already-running instance via the socket
   - IPC handlers become thin proxies: `getDaemonClient().call('task.start', ...)`
   - "Start at Login" launches the daemon binary, not the full Electron app

---

## Line Count Summary

| Category                                 | Estimated Lines | Status                |
| ---------------------------------------- | --------------- | --------------------- |
| Dead socket server + dispatcher          | ~334            | Can remove now        |
| Unreachable child process daemon + spawn | ~315            | Can remove now        |
| Dead CLI bridge                          | ~80             | Can remove now        |
| Duplicated daemon callbacks              | ~100            | Can consolidate       |
| Standalone daemon (unintegrated)         | ~1200+          | Keep, integrate later |
| **Total removable/consolidatable**       | **~830 lines**  |                       |
