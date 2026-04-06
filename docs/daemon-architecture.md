# Daemon Architecture — HISTORICAL (Pre-Migration)

> **⚠️ This document is historical.** It describes the architecture BEFORE the daemon migration (Phases 0–11). The current architecture is documented in [`daemon-final-architecture.md`](daemon-final-architecture.md).
>
> Retained for reference: shows the original IPC/TaskManager architecture, the three failed daemon implementations that were removed, and the migration analysis that informed the plan.

---

## 1. Before Daemon — Original Architecture (Still the Active Production Path)

This is how **every user-facing task still runs today**. The IPC handlers call TaskManager and Storage **directly** — no daemon involved.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI<br/>(Zustand Store)
    participant Preload as Preload<br/>(contextBridge)
    participant IPC as IPC Handlers<br/>(task-handlers.ts)
    participant TM as TaskManager<br/>(singleton)
    participant Storage as StorageAPI<br/>(singleton)
    participant OCA as OpenCodeAdapter<br/>(per task)
    participant PTY as OpenCode CLI<br/>(PTY subprocess)

    User->>React: "Organize my Downloads"
    React->>Preload: accomplish.startTask(config)
    Preload->>IPC: ipcRenderer.invoke('task:start', config)

    Note over IPC: Direct singleton access:<br/>getTaskManager()<br/>getStorage()

    IPC->>Storage: storage.saveTask(task)
    IPC->>TM: taskManager.startTask(taskId, config, callbacks)
    TM->>OCA: new OpenCodeAdapter(options, taskId)
    OCA->>PTY: pty.spawn('opencode run ...')

    PTY-->>OCA: stdout JSON events
    OCA-->>TM: emit('message'), emit('complete')
    TM-->>IPC: callbacks.onBatchedMessages(msgs)
    IPC->>Storage: storage.addTaskMessage(taskId, msg)
    IPC->>React: webContents.send('task:update:batch', data)

    PTY-->>OCA: process exit
    OCA-->>TM: emit('complete', result)
    TM-->>IPC: callbacks.onComplete(result)
    IPC->>Storage: storage.updateTaskStatus(taskId, 'completed')
    IPC->>React: webContents.send('task:update', { type:'complete' })
```

**Key point:** IPC handlers → TaskManager → Storage. All direct function calls. No RPC layer.

---

## 2. What the Daemon Added (Running in Parallel)

The daemon was bootstrapped **alongside** the existing IPC handlers. Both use the **same singletons**.

```mermaid
graph TB
    subgraph MAIN_PROCESS["Electron Main Process"]
        direction TB

        subgraph ACTIVE["ACTIVE production path<br/>(serves all UI requests)"]
            IPC_H["IPC Handlers<br/>(task-handlers.ts)"]
        end

        subgraph DAEMON_PATH["NEW daemon path<br/>(parallel, not yet primary)"]
            D_SERVER["DaemonServer"]
            D_CLIENT["DaemonClient"]
            D_HANDLERS["In-Process Handlers<br/>(daemon-inprocess-handlers.ts)"]
            SCHEDULER["Cron Scheduler"]
        end

        subgraph SINGLETONS["Shared Singletons<br/>(one instance each)"]
            TM["TaskManager"]
            STORAGE["StorageAPI<br/>(SQLite)"]
        end

        subgraph NEW_INFRA["New Infrastructure"]
            TRAY["System Tray"]
            SVC_MGR["Service Manager<br/>(Start at Login)"]
            DAEMON_CB["Daemon Task Callbacks<br/>(background notifications)"]
        end
    end

    subgraph RENDERER["React Renderer"]
        UI["React UI"]
    end

    subgraph CLI_BRIDGE["CLI Bridge"]
        CLI["accomplish CLI commands"]
    end

    %% Active path: UI → IPC → singletons directly
    UI -->|"ipcRenderer.invoke"| IPC_H
    IPC_H -->|"direct call"| TM
    IPC_H -->|"direct call"| STORAGE

    %% Daemon path: CLI → DaemonClient → DaemonServer → singletons
    CLI -->|"JSON-RPC"| D_CLIENT
    D_CLIENT -->|"in-process transport"| D_SERVER
    D_SERVER --> D_HANDLERS
    D_HANDLERS -->|"direct call"| TM
    D_HANDLERS -->|"direct call"| STORAGE

    %% Scheduler uses daemon path
    SCHEDULER -->|"fires task via"| D_HANDLERS

    %% Tray
    TRAY --> SVC_MGR

    classDef active fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px
    classDef daemon fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    classDef shared fill:#e8f4fd,stroke:#1e88e5,stroke-width:3px
    classDef infra fill:#f3e5f5,stroke:#8e24aa
    classDef external fill:#fce4ec,stroke:#e53935

    class IPC_H active
    class D_SERVER,D_CLIENT,D_HANDLERS,SCHEDULER daemon
    class TM,STORAGE shared
    class TRAY,SVC_MGR,DAEMON_CB infra
    class UI,CLI external
```

**Key insight:** Both paths end at the same `TaskManager` and `StorageAPI` singletons. No data inconsistency — just two entry points.

---

## 3. The Duplication — Side by Side

This diagram shows the **exact same operations** implemented in two places.

```mermaid
graph LR
    subgraph UI_PATH["Path A: UI Request (ACTIVE)"]
        direction TB
        A1["ipcRenderer.invoke('task:start')"]
        A2["task-handlers.ts"]
        A3["taskManager.startTask()"]
        A4["storage.saveTask()"]
        A5["createTaskCallbacks()"]
        A1 --> A2 --> A3
        A2 --> A4
        A2 --> A5
    end

    subgraph DAEMON_PATH["Path B: Daemon RPC (NEW)"]
        direction TB
        B1["daemonClient.call('task.start')"]
        B2["daemon-inprocess-handlers.ts"]
        B3["taskManager.startTask()"]
        B4["storage.saveTask()"]
        B5["buildInProcessCallbacks()"]
        B1 --> B2 --> B3
        B2 --> B4
        B2 --> B5
    end

    subgraph SHARED["Same Singletons"]
        TM["TaskManager instance"]
        ST["StorageAPI instance"]
    end

    A3 --> TM
    A4 --> ST
    B3 --> TM
    B4 --> ST

    classDef pathA fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px
    classDef pathB fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    classDef shared fill:#e8f4fd,stroke:#1e88e5,stroke-width:3px

    class A1,A2,A3,A4,A5 pathA
    class B1,B2,B3,B4,B5 pathB
    class TM,ST shared
```

The same pattern repeats for every operation:

| Operation      | Path A (IPC handler)                            | Path B (Daemon RPC)                                         |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Start task     | `task-handlers.ts` → `taskManager.startTask()`  | `daemon-inprocess-handlers.ts` → `taskManager.startTask()`  |
| Cancel task    | `task-handlers.ts` → `taskManager.cancelTask()` | `daemon-inprocess-handlers.ts` → `taskManager.cancelTask()` |
| Get task       | `task-handlers.ts` → `storage.getTask()`        | `daemon-inprocess-handlers.ts` → `storage.getTask()`        |
| List tasks     | `task-handlers.ts` → `storage.getTasks()`       | `daemon-inprocess-handlers.ts` → `storage.getTasks()`       |
| Delete task    | `task-handlers.ts` → `storage.deleteTask()`     | `daemon-inprocess-handlers.ts` → `storage.deleteTask()`     |
| Resume session | `task-handlers.ts` → `taskManager.startTask()`  | `daemon-inprocess-handlers.ts` → `taskManager.startTask()`  |

---

## 4. Who Uses Which Path Today

```mermaid
graph TB
    subgraph CALLERS["Who Calls What"]
        direction TB

        subgraph UI_CALLERS["Uses Path A (IPC handlers)"]
            R_START["UI: Start Task button"]
            R_CANCEL["UI: Cancel Task"]
            R_LIST["UI: Task History"]
            R_GET["UI: Load Task by ID"]
            R_RESUME["UI: Follow-up Message"]
            R_DELETE["UI: Delete Task"]
            R_PERM["UI: Permission Response"]
        end

        subgraph DAEMON_CALLERS["Uses Path B (DaemonClient)"]
            CLI_CMD["CLI bridge commands<br/>(cli-bridge.ts)"]
            CRON["Scheduled tasks<br/>(scheduler.ts)"]
        end
    end

    subgraph PATHS["Paths"]
        PATH_A["Path A: IPC Handlers<br/>→ TaskManager/Storage direct"]
        PATH_B["Path B: DaemonClient<br/>→ DaemonServer → TaskManager/Storage"]
    end

    R_START --> PATH_A
    R_CANCEL --> PATH_A
    R_LIST --> PATH_A
    R_GET --> PATH_A
    R_RESUME --> PATH_A
    R_DELETE --> PATH_A
    R_PERM --> PATH_A

    CLI_CMD --> PATH_B
    CRON --> PATH_B

    classDef uiCaller fill:#c8e6c9,stroke:#2e7d32
    classDef daemonCaller fill:#fff9c4,stroke:#f9a825
    classDef pathA fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px
    classDef pathB fill:#fff9c4,stroke:#f9a825,stroke-width:2px

    class R_START,R_CANCEL,R_LIST,R_GET,R_RESUME,R_DELETE,R_PERM uiCaller
    class CLI_CMD,CRON daemonCaller
    class PATH_A pathA
    class PATH_B pathB
```

---

## 5. Daemon Bootstrap Sequence

How the daemon is initialized alongside the existing architecture at app startup.

```mermaid
sequenceDiagram
    autonumber
    participant App as app.whenReady()
    participant Storage as StorageAPI
    participant TM as TaskManager
    participant Tray as System Tray
    participant Bootstrap as bootstrapDaemon()
    participant Spawn as spawnDaemonProcess()
    participant InProc as bootstrapInProcess()
    participant Server as DaemonServer
    participant Client as DaemonClient
    participant IPC as registerIPCHandlers()

    App->>Storage: initializeStorage()<br/>(SQLite singleton)
    App->>TM: getTaskManager()<br/>(TaskManager singleton)
    App->>Tray: createTray(mainWindow)<br/>(system tray icon)

    App->>Bootstrap: bootstrapDaemon({ taskManager, storage })

    Bootstrap->>Spawn: try: spawnDaemonProcess()
    Note over Spawn: fork('entry.cjs')<br/>Wait for 'daemon:ready' message

    alt Child process starts successfully (Step 3)
        Spawn-->>Bootstrap: DaemonClient (IPC transport)
        Bootstrap->>Bootstrap: setMode('child-process')
    else Child process fails (current fallback)
        Spawn-->>Bootstrap: Error thrown
        Bootstrap->>InProc: fallback: bootstrapInProcess(tm, storage)
        InProc->>InProc: createInProcessTransportPair()
        InProc->>Server: new DaemonServer(serverTransport)
        InProc->>Server: registerInProcessHandlers(srv, tm, storage)
        InProc->>Client: new DaemonClient(clientTransport)
        InProc->>InProc: setMode('in-process')
        InProc-->>Bootstrap: DaemonClient
    end

    Note over Bootstrap: Daemon is now running<br/>(in-process or child-process)

    App->>IPC: registerIPCHandlers()
    Note over IPC: These STILL call<br/>TaskManager + Storage directly.<br/>They do NOT go through DaemonClient.
```

---

## 6. In-Process Mode: How the Transport Works

In the current fallback mode, client and server are in the same process. Messages are delivered via direct function calls — no serialization, no sockets.

```mermaid
sequenceDiagram
    autonumber
    participant CLI as CLI Bridge
    participant Client as DaemonClient
    participant CT as Client Transport
    participant ST as Server Transport
    participant Server as DaemonServer
    participant Handler as Registered Handler
    participant TM as TaskManager

    CLI->>Client: client.call('task.start', params)
    Client->>Client: Create JSON-RPC request<br/>{ jsonrpc:'2.0', id:1,<br/>method:'task.start', params }
    Client->>CT: clientTransport.send(request)

    Note over CT,ST: In-process: send() directly<br/>invokes serverHandlers[]

    CT->>ST: handler(request)
    ST->>Server: handleMessage(request)
    Server->>Handler: lookup 'task.start' handler
    Handler->>TM: taskManager.startTask(taskId, config, callbacks)
    TM-->>Handler: return Task
    Handler-->>Server: return Task
    Server->>ST: serverTransport.send(response)

    Note over ST,CT: In-process: send() directly<br/>invokes clientHandlers[]

    ST->>CT: handler(response)
    CT->>Client: handleMessage(response)
    Client->>Client: Resolve pending promise
    Client-->>CLI: Task object
```

---

## 7. Child Process Mode: The Target Architecture (Step 3)

When the child process daemon works, the transport becomes real IPC between two processes. The daemon child owns its own Storage instance.

```mermaid
sequenceDiagram
    autonumber
    participant App as Electron Main Process
    participant Client as DaemonClient
    participant IPC_CH as Node.js IPC Channel
    participant Daemon as Daemon Child Process
    participant Server as DaemonServer
    participant Storage as StorageAPI<br/>(daemon's own instance)

    Note over App: fork('entry.cjs')

    App->>IPC_CH: send({ type:'daemon:init', userDataPath })
    IPC_CH->>Daemon: process.on('message')
    Daemon->>Storage: createStorage({ userDataPath })
    Daemon->>Server: new DaemonServer(parentTransport)
    Daemon->>Server: registerHandlers(server, storage)
    Daemon->>IPC_CH: send({ type:'daemon:ready', pid })
    IPC_CH->>App: 'daemon:ready'
    App->>Client: new DaemonClient(childTransport)

    Note over App,Daemon: Now connected via JSON-RPC over IPC

    App->>Client: client.call('task.get', { taskId })
    Client->>IPC_CH: JSON-RPC request
    IPC_CH->>Server: handleMessage
    Server->>Storage: storage.getTask(taskId)
    Storage-->>Server: Task
    Server->>IPC_CH: JSON-RPC response
    IPC_CH->>Client: handleMessage
    Client-->>App: Task
```

**Important limitation visible in the code:** The child process daemon (`entry.ts`) currently only registers **storage-backed** handlers (`task.get`, `task.list`, `task.delete`, `storage.*`). It does **NOT** register `task.start` or `task.cancel` because TaskManager still depends on Electron APIs (secure storage, app paths). That comment in `entry.ts`:

> _"Task execution remains in the Electron main process for now because the OpenCode CLI adapter depends on Electron APIs. This will be migrated in a future step once the adapter is decoupled."_

---

## 8. Intended End State (Future Step 3 Complete)

When fully migrated, the IPC handlers become thin proxies. All business logic lives behind the DaemonClient.

```mermaid
graph TB
    subgraph RENDERER["React Renderer"]
        UI["React UI"]
    end

    subgraph MAIN["Electron Main Process<br/>(thin shell)"]
        IPC_H["IPC Handlers<br/><i>(thin proxies)</i>"]
        D_CLIENT["DaemonClient"]
        TRAY["System Tray"]
    end

    subgraph DAEMON["Daemon Process<br/>(owns all business logic)"]
        D_SERVER["DaemonServer"]
        TM["TaskManager"]
        STORAGE["StorageAPI"]
        SCHEDULER["Cron Scheduler"]
        OCA["OpenCodeAdapter"]
        PTY["OpenCode CLI"]
    end

    UI -->|"ipcRenderer.invoke('task:start')"| IPC_H
    IPC_H -->|"daemonClient.call('task.start')"| D_CLIENT
    D_CLIENT -->|"JSON-RPC over socket/IPC"| D_SERVER
    D_SERVER --> TM
    D_SERVER --> STORAGE
    TM --> OCA
    OCA --> PTY
    SCHEDULER --> TM

    TRAY -.->|"show/hide window"| UI

    classDef thin fill:#e0e0e0,stroke:#616161
    classDef daemon fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px
    classDef ui fill:#fce4ec,stroke:#e53935

    class IPC_H,D_CLIENT,TRAY thin
    class D_SERVER,TM,STORAGE,SCHEDULER,OCA,PTY daemon
    class UI ui
```

In the end state:

- **Electron main process** = UI shell + DaemonClient proxy + Tray
- **Daemon process** = TaskManager + Storage + Scheduler + OpenCodeAdapter
- **Window can close** → daemon keeps running → tasks survive
- **Window reopens** → DaemonClient reconnects → UI catches up via RPC

---

## Two Callback Variants

The daemon introduced a second set of task callbacks for background execution:

```mermaid
graph TB
    subgraph ORIGINAL["createTaskCallbacks()<br/>(task-callbacks.ts)"]
        direction TB
        O1["Fixed window + sender reference"]
        O2["forwardToRenderer() via sender.send()"]
        O3["Sets hasRendererSendFailure flag on error"]
        O4["Browser failure detection + recovery"]
        O5["No OS notifications"]
    end

    subgraph DAEMON_CB["createDaemonTaskCallbacks()<br/>(task-callbacks.ts)"]
        direction TB
        D1["Dynamic getWindow() — window may not exist"]
        D2["forwardToRenderer() via win.webContents.send()"]
        D3["Silently catches send errors"]
        D4["No browser recovery"]
        D5["sendBackgroundNotification() on complete/error"]
        D6["updateTray() on status changes"]
    end

    subgraph USED_BY_O["Used by"]
        UI_TASK["UI-initiated tasks<br/>(task-handlers.ts)"]
    end

    subgraph USED_BY_D["Used by"]
        DAEMON_TASK["Daemon-initiated tasks<br/>(scheduled, CLI)"]
    end

    UI_TASK --> ORIGINAL
    DAEMON_TASK --> DAEMON_CB

    classDef original fill:#c8e6c9,stroke:#2e7d32
    classDef daemon fill:#fff9c4,stroke:#f9a825

    class O1,O2,O3,O4,O5 original
    class D1,D2,D3,D4,D5,D6 daemon
```

The daemon callbacks handle the case where the window is minimized, hidden, or destroyed — sending OS-native notifications instead of relying on the renderer being available.
