# Daemon Final Architecture — Flow Diagrams

> **Current architecture** (implemented in Phases 0–11): standalone daemon process that survives Electron exit. The Electron app is a **thin UI/integration shell** (tray, native notifications, file pickers, auth browser flows, renderer IPC forwarding) that connects to the daemon via Unix socket / Windows named pipe JSON-RPC.
>
> Task scheduler is implemented with SQLite persistence, cron matching, and a dedicated Settings tab.

---

## Architecture Ownership

| Owner                     | Responsibilities                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apps/daemon`**         | Task execution, task/session lifecycle, permission/question HTTP services, thought streaming, durable task state, reconnectable notification stream                                                                     |
| **`apps/desktop`**        | Thin UI/integration shell: trusted-window checks, renderer IPC surface, tray, native notifications, native dialogs/file pickers, auth/browser flows (OAuth popups), forwarding daemon notifications to renderer         |
| **`packages/agent-core`** | Daemon protocol/server/client/transport abstractions, TaskManager/OpenCodeAdapter/runtime building blocks, storage primitives, **shared config-building helpers** (skills, connectors, sandbox, workspace, attachments) |

**Key principle:** There is ONE task-start config assembly path — shared helpers in agent-core, consumed by both desktop (during bridge period) and daemon. We never maintain two separate config-building brains.

---

## Data-Dir Contract & Daemon Identity

All launch modes MUST resolve to the **same storage root**. Socket and PID paths are derived from `dataDir` — not global constants — so that dev/prod or multiple profiles never collide.

| Launch mode                         | How data-dir is determined                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| Desktop-launched daemon             | `spawn(node, [daemon, '--data-dir', app.getPath('userData')])` |
| Login-item daemon (macOS/Windows)   | LaunchAgent/startup entry passes `--data-dir <userData>`       |
| Login-item daemon (Linux systemd)   | `ExecStart=... --data-dir <userData>`                          |
| Manual/standalone daemon (dev only) | `--data-dir` optional; defaults to `~/.accomplish` for dev     |

**Identity files derived from dataDir:**

| File           | macOS / Linux                   | Windows                                      |
| -------------- | ------------------------------- | -------------------------------------------- |
| Database       | `<dataDir>/accomplish.db`       | `<dataDir>\accomplish.db`                    |
| Socket         | `<dataDir>/daemon.sock`         | `\\.\pipe\accomplish-daemon-<hash(dataDir)>` |
| PID lock       | `<dataDir>/daemon.pid`          | `<dataDir>\daemon.pid`                       |
| Secure storage | `<dataDir>/secure-storage.json` | `<dataDir>\secure-storage.json`              |

Without this contract, dev/prod or multiple profiles connect to the wrong database, socket, or PID file.

---

## Unattended Permission Policy

When a task requires user permission and **no UI client is connected**:

1. Daemon sends `notify('permission.request')` — no clients receive it
2. MCP tool HTTP connection stays open, waiting
3. After `PERMISSION_REQUEST_TIMEOUT_MS` (5 minutes) → **auto-deny**
4. AI adapts: completes with `status: 'partial'` or `status: 'blocked'`
5. Result persisted in SQLite with full message history
6. When user reopens UI → sees failed/partial task → can follow up to retry

This is the **safe default**. Future enhancements (queue-and-pause, external notification channels) are out of scope.

---

## RPC Method Contract

Normalized method names (resolved `task.stop` vs `task.cancel` conflict):

| Method                    | Params                                                               | Result               | Notes                                             |
| ------------------------- | -------------------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| `daemon.ping`             | —                                                                    | `{ status, uptime }` | Health check, already exists                      |
| `daemon.shutdown`         | —                                                                    | void                 | **New.** Graceful drain (30s) + exit              |
| `task.start`              | `{ prompt, taskId?, workspaceId?, attachments?, workingDirectory? }` | `Task`               |                                                   |
| `task.cancel`             | `{ taskId }`                                                         | void                 | Normalized (was `task.stop` in standalone daemon) |
| `task.interrupt`          | `{ taskId }`                                                         | void                 |                                                   |
| `task.get`                | `{ taskId }`                                                         | `Task`               |                                                   |
| `task.list`               | —                                                                    | `Task[]`             |                                                   |
| `task.delete`             | `{ taskId }`                                                         | void                 |                                                   |
| `task.getTodos`           | `{ taskId }`                                                         | `TodoItem[]`         |                                                   |
| `task.clearHistory`       | —                                                                    | void                 |                                                   |
| `session.resume`          | `{ sessionId, prompt, existingTaskId?, attachments? }`               | `Task`               |                                                   |
| `permission.respond`      | `{ requestId, decision, ... }`                                       | void                 |                                                   |
| `task.schedule`           | `{ cron, prompt, workspaceId? }`                                     | `ScheduledTask`      | Create persistent schedule                        |
| `task.listScheduled`      | `{ workspaceId? }`                                                   | `ScheduledTask[]`    | Server-side workspace filtering                   |
| `task.cancelScheduled`    | `{ scheduleId }`                                                     | void                 |                                                   |
| `task.setScheduleEnabled` | `{ scheduleId, enabled }`                                            | void                 | Re-computes next_run_at on enable                 |

## Shutdown Semantics

Three distinct behaviors, never conflated:

| Action                                  | What happens                                       | Daemon impact                                                                                   |
| --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Hide window** (click X)               | `window.hide()`, tray stays                        | Daemon lives, socket connected, notifications flow                                              |
| **Quit Electron** (Cmd+Q / tray → Quit) | `client.close()`, `app.quit()`                     | Daemon lives. Socket disconnects. Process NOT killed.                                           |
| **Stop daemon** (explicit user action)  | `client.call('daemon.shutdown')` then `app.quit()` | Daemon gracefully drains tasks (30s), then exits. `daemon.shutdown` is a registered RPC method. |

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph RENDERER["React Renderer (apps/web)"]
        UI["React UI + Zustand Store"]
    end

    subgraph ELECTRON["Electron Main Process (apps/desktop)<br/><i>Thin UI/integration shell — no task execution</i>"]
        IPC_H["IPC Handlers<br/><i>(thin proxies)</i>"]
        NF["Notification Forwarder<br/><i>daemon notifications → webContents.send</i>"]
        TRAY["System Tray"]
        DC["DaemonClient<br/><i>(socket transport)</i>"]
        AUTH["Auth/Browser Flows<br/><i>OAuth popups, file pickers</i>"]
    end

    subgraph DAEMON["Daemon Process (apps/daemon)<br/><i>Standalone, survives Electron exit</i>"]
        RPC["DaemonRpcServer<br/><i>(Unix socket / named pipe)</i>"]
        TS["TaskService"]
        TM["TaskManager"]
        OCA["OpenCodeAdapter"]
        STORAGE["StorageAPI (SQLite)"]
        PERM["PermissionService<br/><i>(authenticated local HTTP)</i>"]
        THOUGHT["ThoughtStreamService<br/><i>(authenticated local HTTP)</i>"]
        HEALTH["HealthService"]
    end

    subgraph EXTERNAL["External Adapters"]
        CLI["CLI tools<br/><i>nc -U daemon.sock</i>"]
        ADAPTERS["Future: Slack, webhooks,<br/>push notifications"]
    end

    subgraph CHILD["Task Subprocess"]
        PTY["OpenCode CLI<br/><i>(node-pty)</i>"]
        MCP["MCP Tools<br/><i>(file-permission, complete-task, etc.)</i>"]
        AI["AI Provider<br/><i>(Claude / GPT / etc.)</i>"]
    end

    UI -->|"ipcRenderer.invoke"| IPC_H
    IPC_H -->|"client.call()"| DC
    DC <-->|"JSON-RPC over socket"| RPC
    NF -.->|"webContents.send"| UI
    RPC --> TS
    TS --> TM
    TM --> OCA
    OCA --> PTY
    PTY --> AI
    PTY <--> MCP
    MCP -->|"HTTP POST"| PERM
    MCP -->|"HTTP POST"| THOUGHT
    TS --> STORAGE
    CLI -->|"JSON-RPC over socket"| RPC
    ADAPTERS -->|"JSON-RPC over socket"| RPC
    TRAY -.->|"show/hide"| UI

    classDef electron fill:#e0e0e0,stroke:#616161
    classDef daemon fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px
    classDef ui fill:#e3f2fd,stroke:#1565c0
    classDef external fill:#fff9c4,stroke:#f9a825
    classDef child fill:#fce4ec,stroke:#e53935

    class IPC_H,NF,TRAY,DC,AUTH electron
    class RPC,TS,TM,OCA,STORAGE,PERM,THOUGHT,HEALTH daemon
    class UI ui
    class CLI,ADAPTERS external
    class PTY,MCP,AI child
```

---

## 2. App Startup — Daemon Spawn & Connect

Shows all three scenarios: daemon already running (started by OS login item), Electron needs to spawn it, and first-ever launch.

```mermaid
sequenceDiagram
    autonumber
    participant App as Electron Main<br/>(app.whenReady)
    participant Conn as daemon-connector.ts<br/>(ensureDaemonRunning)
    participant Socket as Socket / Named Pipe
    participant Daemon as Daemon Process<br/>(apps/daemon)
    participant RPC as DaemonRpcServer
    participant PID as PID Lock
    participant Storage as StorageAPI
    participant NF as Notification Forwarder
    participant React as React UI

    App->>Conn: ensureDaemonRunning()

    Conn->>Socket: Try connect

    alt Daemon already running (started by OS login item or previous session)
        Socket-->>Conn: Connected
        Conn->>RPC: daemon.ping
        RPC-->>Conn: { status: 'ok', uptime: 12345 }
        Conn-->>App: DaemonClient (reused daemon)

    else Daemon not yet started — short retry (login item may be slow)
        Socket-->>Conn: ECONNREFUSED
        Note over Conn: Wait 500ms, retry once<br/>(OS login item may still be booting)
        Conn->>Socket: Retry connect
        alt Login item came up
            Socket-->>Conn: Connected
            Conn->>RPC: daemon.ping
            RPC-->>Conn: pong
            Conn-->>App: DaemonClient
        else Still not running — Electron spawns it
            Socket-->>Conn: ECONNREFUSED

            Note over Conn: spawn(node, [daemon/index.js,<br/>--data-dir, userData],<br/>{ detached: true, stdio: 'ignore' })<br/>child.unref()

            Conn->>Daemon: spawn detached + unref()

            Daemon->>PID: acquirePidLock()
            PID-->>Daemon: Lock acquired
            Daemon->>Storage: createStorage({ databasePath })
            Daemon->>Storage: Crash recovery:<br/>mark stale 'running' tasks as 'failed'
            Daemon->>RPC: Start listening on socket

            loop Poll every 200ms (max 5s)
                Conn->>Socket: Try connect
            end
            Socket-->>Conn: Connected
            Conn->>RPC: daemon.ping
            RPC-->>Conn: { status: 'ok' }
            Conn-->>App: DaemonClient (fresh daemon)
        end
    end

    App->>NF: registerNotificationForwarding(client, mainWindow)

    Note over NF: Subscribe to all daemon notifications:<br/>task.progress, task.message, task.complete,<br/>permission.request, todo.update, auth.error,<br/>task.thought, task.checkpoint, task.statusChange

    App->>React: Load web UI
```

---

## 3. Task Execution — UI-Initiated (Detail)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI<br/>(Zustand Store)
    participant Preload as Preload<br/>(contextBridge)
    participant IPC as IPC Handler<br/>(task-handlers.ts)
    participant DC as DaemonClient<br/>(socket transport)
    participant RPC as DaemonRpcServer<br/>(daemon process)
    participant TS as TaskService
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PTY as OpenCode CLI<br/>(node-pty)
    participant AI as AI Provider
    participant Storage as StorageAPI
    participant NF as Notification Forwarder

    User->>React: "Organize my Downloads"
    React->>React: set({ isLoading: true })
    React->>Preload: accomplish.startTask({ prompt })
    Preload->>IPC: ipcRenderer.invoke('task:start', config)

    Note over IPC: assertTrustedWindow()<br/>validateTaskConfig()

    IPC->>DC: client.call('task.start',<br/>{ prompt, taskId, workspaceId,<br/>attachments })
    DC->>RPC: JSON-RPC over socket

    Note over RPC,TS: Inside Daemon Process

    RPC->>TS: taskStart handler
    TS->>TS: Load shared config:<br/>skills, connectors, sandbox,<br/>workspace notes, cloud browser
    TS->>Storage: storage.saveTask({ id, prompt, status:'running' })
    TS->>TM: taskManager.startTask(taskId, config, callbacks)
    TM->>OCA: new OpenCodeAdapter(options, taskId)
    OCA->>PTY: pty.spawn('opencode run ...')

    RPC-->>DC: JSON-RPC response: { result: Task }
    DC-->>IPC: Task object
    IPC-->>Preload: return Task
    Preload-->>React: task
    React->>React: navigate('/execution/tsk_001')

    Note over PTY,AI: AI starts working...

    PTY-->>OCA: stdout JSON (tool calls, text)
    OCA-->>TM: emit('message', ...)
    TM-->>TS: callbacks.onBatchedMessages(msgs)
    TS->>Storage: storage.addTaskMessage(taskId, msg)
    TS->>RPC: notify('task.message',<br/>{ taskId, messages })

    Note over RPC,NF: Notification flows back

    RPC-->>DC: JSON-RPC notification (no id)
    DC-->>NF: onNotification('task.message', data)
    NF->>React: webContents.send('task:update:batch', data)
    React->>React: Update message list

    Note over PTY: Task completes...

    PTY-->>OCA: process exit(0)
    OCA-->>TM: emit('complete', result)
    TM-->>TS: callbacks.onComplete(result)
    TS->>Storage: UPDATE tasks SET status='completed'
    TS->>RPC: notify('task.complete',<br/>{ taskId, result })
    RPC-->>DC: notification
    DC-->>NF: onNotification('task.complete', data)
    NF->>React: webContents.send('task:update',<br/>{ type:'complete', result })
    React->>React: Show completion + follow-up input
```

---

## 4. Task Execution — Scheduled / External (No Electron)

Explicitly shows the "no UI connected" branch as a first-class path.

```mermaid
sequenceDiagram
    autonumber
    participant Adapter as External Adapter<br/>(CLI / Slack / webhook)
    participant RPC as DaemonRpcServer
    participant TS as TaskService
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PTY as OpenCode CLI
    participant AI as AI Provider
    participant Storage as StorageAPI

    Adapter->>RPC: JSON-RPC: task.start
    RPC->>TS: taskStart handler

    TS->>TS: Load shared config:<br/>skills, connectors, sandbox
    TS->>Storage: storage.saveTask(task)
    TS->>TM: taskManager.startTask(taskId, config, callbacks)
    TM->>OCA: new OpenCodeAdapter(options, taskId)
    OCA->>PTY: pty.spawn('opencode run ...')
    PTY->>AI: Send prompt

    Note over AI: AI works...<br/>tool calls, file operations, etc.

    alt AI needs permission (no UI connected)
        Note over AI: AI calls file-permission MCP tool
        Note over TS: Daemon sends notify('permission.request')<br/>No socket clients connected → nobody receives it
        Note over TS: HTTP connection open for 5 minutes...<br/>PERMISSION_REQUEST_TIMEOUT_MS expires<br/>→ auto-deny (safe default)
        Note over AI: AI sees "denied / timeout"<br/>→ adapts or completes as 'blocked'
    end

    PTY-->>OCA: process exit(0)
    OCA-->>TM: emit('complete')
    TM-->>TS: callbacks.onComplete(result)
    TS->>Storage: UPDATE status='completed' or 'failed'

    TS->>RPC: notify('task.complete', { taskId, result })

    Note over RPC: Notification broadcast to all connected clients.<br/>If Electron is connected → forwards to UI.<br/>If nobody connected → dropped silently.<br/>Result is always persisted in SQLite.<br/>UI catches up on next launch via task.list RPC.
```

---

## 5. Permission Flow Through Daemon (UI Connected)

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant MCP as MCP: file-permission<br/>(separate process)
    participant PermHTTP as Daemon: PermissionService<br/>(authenticated local HTTP)
    participant TS as Daemon: TaskService
    participant RPC as Daemon: DaemonRpcServer
    participant DC as Electron: DaemonClient
    participant NF as Electron: Notification Forwarder
    participant React as React UI
    participant User

    AI-->>CLI: tool_call: request_file_permission<br/>({ operation:'create',<br/>filePath:'~/Downloads/Docs' })
    CLI->>MCP: MCP stdio call
    MCP->>PermHTTP: HTTP POST /permission<br/>{ operation, filePath }

    Note over PermHTTP: Creates deferred promise<br/>HTTP connection stays OPEN

    PermHTTP->>TS: permissionService.createRequest(req)
    TS->>RPC: notify('permission.request', req)

    Note over RPC,DC: Notification over socket

    RPC-->>DC: JSON-RPC notification
    DC-->>NF: onNotification('permission.request')
    NF->>React: webContents.send('permission:request', req)
    React->>React: Show PermissionDialog

    Note over MCP,PermHTTP: BLOCKED — waiting for user

    User->>React: Clicks "Allow"
    React->>DC: ipcRenderer.invoke('permission:respond',<br/>{ decision:'allow' })

    Note over DC: IPC handler proxies to daemon

    DC->>RPC: client.call('permission.respond',<br/>{ requestId, decision:'allow' })
    RPC->>PermHTTP: resolvePermission(requestId, true)

    Note over PermHTTP: Deferred promise resolves!

    PermHTTP-->>MCP: HTTP 200 { allowed: true }
    MCP-->>CLI: "allowed"
    CLI-->>AI: Tool result: "allowed"

    Note over AI: AI proceeds to<br/>create the folder...
```

---

## 6. Follow-Up Message (Session Resume via Daemon)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI
    participant IPC as IPC Handler
    participant DC as DaemonClient
    participant RPC as DaemonRpcServer
    participant TS as TaskService
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PTY as OpenCode CLI
    participant AI as AI Provider
    participant Storage as StorageAPI
    participant NF as Notification Forwarder

    User->>React: Types "Leave pictures as is"
    React->>React: Optimistic: add user message,<br/>set status → 'running'
    React->>IPC: accomplish.resumeSession(<br/>'sess_abc123', prompt, 'tsk_001')
    IPC->>DC: client.call('session.resume',<br/>{ sessionId, prompt,<br/>existingTaskId, attachments })

    DC->>RPC: JSON-RPC over socket
    RPC->>TS: sessionResume handler
    TS->>Storage: addTaskMessage('tsk_001', userMsg)
    TS->>TM: taskManager.startTask('tsk_001',<br/>{ prompt, sessionId }, callbacks)
    TM->>OCA: new OpenCodeAdapter (fresh)

    Note over OCA: --session sess_abc123<br/>CLI reloads full conversation

    OCA->>PTY: pty.spawn('opencode run<br/>--session sess_abc123 ...')
    PTY->>AI: Full history + new prompt

    RPC-->>DC: response: Task
    DC-->>IPC: Task
    IPC-->>React: Task

    Note over AI: Works with full context...

    AI-->>PTY: responses + tool calls
    PTY-->>OCA: stdout JSON
    OCA-->>TM: events
    TM-->>TS: callbacks
    TS->>RPC: notify('task.message', ...)
    RPC-->>DC: notification
    DC-->>NF: forward
    NF->>React: webContents.send(...)
```

---

## 7. Window Close → Daemon Survives → Reconnect

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI
    participant Electron as Electron Main
    participant Tray as System Tray
    participant DC as DaemonClient<br/>(socket)
    participant Daemon as Daemon Process
    participant TM as TaskManager
    participant Storage as StorageAPI

    Note over Electron,Daemon: Task is running...

    alt Hide window (click X)
        User->>Electron: window.close()
        Electron->>Electron: event.preventDefault()
        Electron->>React: window.hide()
        Note over Tray: Tray icon still visible<br/>"Accomplish — 1 task running"
        Note over Daemon: Daemon unaffected.<br/>Task keeps running.

        User->>Tray: Click tray icon
        Tray->>Electron: window.show() + focus()
        Electron->>React: UI visible again
        Note over React: Notifications still flowing<br/>via DaemonClient → webContents.send

    else Quit Electron (Cmd+Q / tray → Quit)
        User->>Electron: app.quit()
        Electron->>DC: client.close()
        Note over DC: Socket disconnected.<br/>Daemon process NOT killed.
        Electron->>Electron: Process exits

        Note over Daemon: Daemon is detached + unref'd.<br/>Survives parent exit.<br/>Task keeps running.

        TM-->>Daemon: Task completes
        Daemon->>Storage: UPDATE status='completed'
        Daemon->>Daemon: notify('task.complete')
        Note over Daemon: No socket clients connected.<br/>Notification dropped silently.<br/>Result persisted in SQLite.

    else Stop daemon (explicit user action)
        User->>Electron: Settings → Stop Daemon
        Electron->>DC: client.call('daemon.shutdown')
        Note over Daemon: Drain phase: wait for<br/>active tasks (30s timeout)
        Daemon->>Daemon: Graceful shutdown
        Electron->>DC: client.close()
        Electron->>Electron: app.quit()
    end

    Note over User: Later... user reopens Accomplish

    User->>Electron: Launch app
    Electron->>DC: ensureDaemonRunning()
    DC->>Daemon: connect to socket
    DC->>Daemon: daemon.ping → pong
    Note over DC: Reuse existing daemon!

    Electron->>DC: registerNotificationForwarding()
    Electron->>React: Load UI

    React->>DC: client.call('task.list')
    DC->>Daemon: task.list
    Daemon->>Storage: storage.getTasks()
    Storage-->>Daemon: [task with status:'completed']
    Daemon-->>DC: tasks
    DC-->>React: Sidebar shows completed task
```

---

## 8. Daemon Crash → Recovery

```mermaid
sequenceDiagram
    autonumber
    participant Electron as Electron Main
    participant DC as DaemonClient
    participant Conn as daemon-connector.ts
    participant Socket as Socket / Named Pipe
    participant Daemon as Daemon Process (old)
    participant NewDaemon as Daemon Process (new)
    participant Storage as StorageAPI
    participant PID as PID Lock
    participant React as React UI

    Note over Daemon: Daemon crashes! (OOM, bug, etc.)

    Daemon->>Daemon: process.exit(1)
    Socket-->>DC: Socket 'close' event

    DC->>Conn: onDisconnect handler fires
    Conn->>React: webContents.send('daemon:disconnected')
    React->>React: Show "Reconnecting..." indicator

    loop Exponential backoff (200ms → 5s)
        Conn->>Socket: Try connect
        Socket-->>Conn: ECONNREFUSED
    end

    Note over Conn: 10 retries failed.<br/>Daemon is truly dead.<br/>Spawn a new one.

    Conn->>NewDaemon: spawn(node, [daemon/index.js,<br/>--data-dir, userData],<br/>{ detached: true })
    NewDaemon->>PID: acquirePidLock()
    Note over PID: Old PID is stale → clean up → lock acquired
    NewDaemon->>Storage: createStorage()

    Note over NewDaemon,Storage: Crash recovery:<br/>SELECT * FROM tasks WHERE status='running'<br/>→ UPDATE SET status='failed'

    NewDaemon->>Socket: Listen on socket

    Conn->>Socket: Connect
    Socket-->>Conn: Connected!
    Conn->>NewDaemon: daemon.ping → pong
    Conn->>DC: Replace transport with new socket

    DC->>Conn: Re-register notification forwarding
    Conn->>React: webContents.send('daemon:reconnected')
    React->>React: Hide "Reconnecting..." indicator
    React->>React: Refresh task list from daemon
```

---

## 9. Daemon Settings UI — Monitoring & Control

The daemon tab merges into General settings. Users can monitor status, control the daemon, and configure close-button behavior.

```mermaid
graph TB
    subgraph GENERAL_TAB["Settings → General"]
        direction TB

        subgraph NOTIF["Notifications Section"]
            N1["Enable OS notifications"]
        end

        subgraph DAEMON_SEC["Daemon Section"]
            direction TB

            subgraph STATUS["Status Monitor"]
                S1["● Running — uptime 2h 14m"]
                S2["Last ping: 3s ago"]
                S3["Active tasks: 1"]
            end

            subgraph CONTROLS["Controls"]
                C1["[Restart Daemon]"]
                C2["[Stop Daemon]"]
                C3["[Start Daemon]<br/><i>(only when stopped)</i>"]
            end

            subgraph CLOSE_BEHAVIOR["Window Close Behavior"]
                CB1["◉ Keep daemon running<br/><i>(recommended)</i>"]
                CB2["○ Stop daemon on close<br/><i>⚠ double confirmation required</i>"]
            end
        end

        subgraph DEBUG["Developer Section"]
            D1["Debug mode toggle"]
        end
    end

    classDef section fill:#f5f5f5,stroke:#9e9e9e
    classDef status fill:#c8e6c9,stroke:#2e7d32
    classDef controls fill:#e3f2fd,stroke:#1565c0
    classDef close fill:#fff9c4,stroke:#f9a825

    class NOTIF,DEBUG section
    class STATUS,S1,S2,S3 status
    class CONTROLS,C1,C2,C3 controls
    class CLOSE_BEHAVIOR,CB1,CB2 close
```

### Close Button Behavior Flow

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Window as Electron Window
    participant Settings as app_settings DB
    participant DC as DaemonClient
    participant Daemon as Daemon Process
    participant Tray as System Tray

    User->>Window: Clicks ❌ (close button)
    Window->>Settings: getCloseBehavior()

    alt close_behavior = 'keep-daemon' (default)
        Settings-->>Window: 'keep-daemon'
        Window->>Window: event.preventDefault()
        Window->>Window: window.hide()
        Note over Tray: Tray icon stays visible
        Note over Daemon: Daemon keeps running
        Note over User: User can click tray<br/>to show window again

    else close_behavior = 'stop-daemon'
        Settings-->>Window: 'stop-daemon'
        Window->>Window: event.preventDefault()
        Window->>DC: client.call('daemon.shutdown')
        Note over Daemon: Graceful drain (30s)<br/>then exit
        DC-->>Window: shutdown complete
        Window->>Window: isQuitting = true
        Window->>Window: app.quit()
    end
```

### Changing Close Behavior (Double Confirmation)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant UI as DaemonSection<br/>(Settings → General)
    participant Dialog1 as Warning Dialog
    participant Dialog2 as Confirmation Dialog
    participant IPC as IPC Handler
    participant DB as app_settings

    User->>UI: Selects "Stop daemon on close"
    UI->>Dialog1: Show warning:<br/>"This will terminate running tasks<br/>on window close. Background features<br/>will stop working. Are you sure?"

    alt User clicks Cancel
        Dialog1-->>UI: Cancelled
        UI->>UI: Reset to "Keep daemon running"
    else User clicks Continue
        Dialog1->>Dialog2: Show 2nd confirmation:<br/>"Tasks in progress will be lost.<br/>This is not recommended.<br/>Proceed anyway?"
        alt User clicks Cancel
            Dialog2-->>UI: Cancelled
            UI->>UI: Reset to "Keep daemon running"
        else User clicks Confirm
            Dialog2-->>UI: Confirmed
            UI->>IPC: accomplish.setCloseBehavior('stop-daemon')
            IPC->>DB: UPDATE app_settings<br/>SET close_behavior='stop-daemon'
            UI->>UI: Show selection with ⚠ indicator
        end
    end
```

---

## 10. Shared Config Assembly (One Brain)

Shows how skills, connectors, sandbox, workspace, and attachments flow through a single shared config path in agent-core — used by both desktop (bridge period) and daemon.

```mermaid
graph TB
    subgraph AGENT_CORE["packages/agent-core<br/><i>Shared config helpers</i>"]
        direction TB
        GC["generateConfig()"]
        BPC["buildProviderConfigs()"]
        SK["resolveEnabledSkills(storage)"]
        CN["resolveEnabledConnectors(storage)"]
        SB["resolveSandboxConfig(storage)"]
        WK["resolveWorkspaceNotes(storage, workspaceId)"]
        CB["resolveCloudBrowser(storage)"]
    end

    subgraph STORAGE["Shared SQLite DB<br/><i>(WAL mode)</i>"]
        DB["skills, connectors, sandbox,<br/>cloud_browsers, workspaces,<br/>provider_settings, app_settings"]
    end

    subgraph DAEMON["apps/daemon — TaskService.onBeforeStart()"]
        D_CALL["Calls shared helpers →<br/>builds opencode.json →<br/>spawns CLI"]
    end

    subgraph DESKTOP["apps/desktop — config-generator.ts<br/><i>(bridge period only, removed in Phase 8)</i>"]
        E_CALL["Calls same shared helpers →<br/>builds opencode.json →<br/>spawns CLI"]
    end

    SK --> GC
    CN --> GC
    SB --> GC
    WK --> GC
    CB --> GC
    BPC --> GC

    DB --> SK
    DB --> CN
    DB --> SB
    DB --> WK
    DB --> CB
    DB --> BPC

    GC --> D_CALL
    GC --> E_CALL

    classDef core fill:#e8f5e9,stroke:#43a047,stroke-width:2px
    classDef storage fill:#f0f4c3,stroke:#827717
    classDef daemon fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px
    classDef desktop fill:#e0e0e0,stroke:#616161

    class GC,BPC,SK,CN,SB,WK,CB core
    class DB storage
    class D_CALL daemon
    class E_CALL desktop
```

---

## 12. Migration Path Summary

```mermaid
graph LR
    subgraph P0["Phase 0: Cleanup"]
        DEL["Delete 9 dead files<br/>~1,084 lines"]
    end

    subgraph P1["Phase 1: Data-Dir"]
        DD["Standardize<br/>--data-dir contract"]
    end

    subgraph P2["Phase 2: Parity"]
        PAR["Move config assembly<br/>to shared agent-core<br/>Wire into daemon"]
    end

    subgraph P3["Phase 3: Transport"]
        ST["Client socket transport<br/>+ daemon connector<br/>+ spawn detached"]
    end

    subgraph P4["Phase 4: Bootstrap"]
        BS["Rewire bootstrap<br/>+ notification forwarding<br/>+ shutdown semantics"]
    end

    subgraph P5["Phase 5: Proxy"]
        PX["IPC handlers →<br/>daemon RPC proxies"]
    end

    subgraph P6["Phase 6: Service"]
        SVC["Login-item starts daemon<br/>+ reconnection logic"]
    end

    subgraph P7["Phase 7: Reads"]
        RD["Task reads →<br/>daemon RPC<br/>(eliminate split-brain)"]
    end

    subgraph P8["Phase 8: Cleanup"]
        FIN["Remove old execution path<br/>+ packaging"]
    end

    P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8

    classDef done fill:#c8e6c9,stroke:#2e7d32
    classDef active fill:#fff9c4,stroke:#f9a825
    classDef future fill:#e3f2fd,stroke:#1565c0

    class P0 done
    class P1,P2,P3 active
    class P4,P5,P6,P7,P8 future
```
