# OpenCode Communication Architecture: Migration Options

## Context

The Electron app communicates with the OpenCode CLI to execute AI tasks. We are migrating away from the current PTY-based model. This document compares three approaches.

---

## Current: PTY + `opencode run`

Each task spawns a new `opencode run` process via `node-pty`. Output is parsed from the raw terminal byte stream (ANSI stripping, NDJSON parsing). Permissions are bridged via custom HTTP MCP servers.

- **~2500 lines** of parsing code (adapter, stream-parser, log-watcher, completion enforcer)
- `node-pty` native addon requires rebuild per Electron version
- No session continuity between tasks
- Each task = one OS process

---

## Option A: PTY + `opencode serve`

Keep `node-pty`, spawn `opencode serve` once, communicate via the terminal stream.

| Pros | Cons |
|------|------|
| Smaller conceptual change | `opencode serve` is a server, not a terminal program -- PTY adds nothing |
| Can see raw stdout for debugging | Still need all the parsing code (or use HTTP anyway, making PTY pointless) |
| No new SDK dependency | Keeps `node-pty` native addon pain |
| | No session continuity via PTY -- need HTTP for that regardless |
| | Likely ends up as a hybrid (PTY for process + HTTP for data), doubling complexity |

**Verdict:** Half-measure. You'd end up using HTTP/SSE for actual communication, making the PTY a needless middleman.

---

## Option B: SDK + `opencode serve` (chosen approach)

Spawn `opencode serve` via `child_process.spawn` (no PTY). Communicate through `@opencode-ai/sdk` using typed HTTP + SSE.

| Pros | Cons |
|------|------|
| Eliminates ~2500 lines of parsing code | New SDK dependency (`@opencode-ai/sdk`) |
| Drops `node-pty` -- no more native addon rebuilds | Larger refactor scope |
| Typed, structured events (no ANSI/NDJSON parsing) | SDK API surface may shift (still maturing) |
| Native permission flow via SSE events | HTTP overhead for local comms (negligible in practice) |
| Built-in session continuity (`session.promptAsync` on existing sessionId) | |
| Crash recovery = restart process + reconnect client | |
| Net **-1400 lines** of code | |

**Verdict:** Correct architecture. Uses `opencode serve` as designed.

---

## Industry Precedents

| Product | Pattern | Uses PTY? |
|---------|---------|-----------|
| VS Code + Language Servers | JSON-RPC over stdin/stdout or TCP | No (PTY only for integrated terminal) |
| Docker Desktop | HTTP REST over Unix socket | No |
| JetBrains IDEs | HTTP / gRPC / custom protocols | No |
| Claude Code / Cursor / Windsurf | Structured SDK/HTTP APIs | No |

**Industry consensus:** PTY is for terminal emulation. Structured APIs (HTTP, gRPC, SDK) are for app-to-service communication.

---

## Architecture After Migration (Option B)

```
Renderer (React + Zustand)
    |  window.accomplish.* IPC calls
    v
IPC Handlers (main process)
    |  TaskManager -> SDK client calls
    v
ServerManager              EventRouter
  - spawns opencode serve    - subscribes to SSE stream
  - health checks            - demuxes sessionId -> taskId
  - auto-restart             - maps SDK events to IPC channels
    |                            |
    v                            v
opencode serve (127.0.0.1:4096)
  - HTTP REST API (sessions, permissions)
  - SSE event stream (text, tools, status, permissions, todos)
```

### Key Components

| Component | Role |
|-----------|------|
| **ServerManager** | Spawns/restarts `opencode serve`, exposes SDK client |
| **EventRouter** | Single SSE subscription, routes events by session to task callbacks |
| **TaskManager** | Creates SDK sessions, manages queue (max 10 concurrent), handles permissions |

### What Changes

| Category | Files | Impact |
|----------|-------|--------|
| Created | `server-manager.ts`, `event-router.ts` | +600 lines |
| Modified | `cli-path.ts`, `task-manager.ts`, `config-generator.ts`, `handlers.ts` | ~500 lines changed |
| Deleted | `adapter.ts`, `stream-parser.ts`, `log-watcher.ts`, `completion/*`, `permission-api.ts` | -2500 lines |
| **Net** | | **-1400 lines** |

### Dependencies

| Added | Removed |
|-------|---------|
| `@opencode-ai/sdk` (pure JS) | `node-pty` (native addon) |
| | `@electron/rebuild` |

---

## Renderer Impact

**Zero changes.** All IPC channel names and data shapes (`TaskMessage`, `PermissionRequest`, `TaskResult`, `TodoItem`) remain identical. The preload layer is unchanged.
