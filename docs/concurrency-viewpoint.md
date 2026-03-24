# Concurrency Viewpoint — Accomplish Architecture

> Rozanski & Woods Concurrency Viewpoint: maps the system's functional elements to runtime processes and threads, identifies inter-process communication, and describes synchronization and coordination mechanisms.

---

## 1. Process & Thread Model

All processes that exist at runtime and how they communicate.

```mermaid
graph TB
  subgraph OS["Operating System"]
    direction TB

    subgraph ELECTRON_PROC["Electron Main Process  (Node.js, single-threaded event loop)"]
      direction LR
      IPC_LOOP["IPC Handler Loop"]
      HTTP_SERVERS["HTTP Servers<br/>:9226 · :9227 · :9228"]
      TASK_MGR["TaskManager<br/><i>task queue + active map</i>"]
    end

    subgraph RENDERER_PROC["Renderer Process  (Chromium, sandboxed)"]
      direction LR
      REACT["React + Zustand"]
      DOM["DOM Rendering"]
    end

    subgraph PTY_PROC["OpenCode PTY Process  (Go binary)"]
      direction LR
      LLM_LOOP["LLM request/response loop"]
      TOOL_EXEC["Tool execution<br/><i>Bash, Read, Write, Edit</i>"]
      MCP_CLIENT["MCP Client<br/><i>HTTP calls to Accomplish</i>"]
    end

    subgraph BROWSER_PROC["Dev-Browser Server  (Node.js, detached)"]
      direction LR
      PW["Playwright Controller"]
      CHROMIUM["Chromium Instance"]
    end

    subgraph PROXY_PROCS["API Proxies  (optional, per-task)"]
      AZ["Azure Foundry Proxy"]
      MOON["Moonshot Proxy"]
    end
  end

  RENDERER_PROC -->|"IPC invoke/send<br/>(async, structured)"| ELECTRON_PROC
  ELECTRON_PROC -->|"IPC events<br/>(50ms batched)"| RENDERER_PROC

  ELECTRON_PROC -->|"PTY stdin/stdout<br/>(text stream)"| PTY_PROC
  PTY_PROC -->|"HTTP POST<br/>(MCP tool calls)"| HTTP_SERVERS

  PTY_PROC -->|"WebSocket / CDP"| BROWSER_PROC
  PTY_PROC -.->|"HTTPS via proxy"| PROXY_PROCS

  classDef electron fill:#e8f4fd,stroke:#1e88e5,stroke-width:2px
  classDef renderer fill:#fce4ec,stroke:#e53935,stroke-width:2px
  classDef pty fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef browser fill:#e8f5e9,stroke:#43a047,stroke-width:2px
  classDef proxy fill:#e0e0e0,stroke:#616161

  class IPC_LOOP,HTTP_SERVERS,TASK_MGR electron
  class REACT,DOM renderer
  class LLM_LOOP,TOOL_EXEC,MCP_CLIENT pty
  class PW,CHROMIUM browser
  class AZ,MOON proxy
```

---

## 2. Task Queue & Execution Model

How tasks are scheduled, queued, and executed — the core concurrency control.

```mermaid
graph TB
  subgraph QUEUE_MODEL["TaskManager Concurrency Model"]
    direction TB

    NEW["New Task Request"] --> CHECK{"activeTasks.size<br/>< maxConcurrent?<br/><i>(default: 10)</i>"}

    CHECK -->|"Yes"| EXECUTE["Execute immediately<br/><i>Create OpenCodeAdapter<br/>Spawn PTY process</i>"]

    CHECK -->|"No"| QUEUE["Add to taskQueue[]<br/><i>Status: 'queued'</i>"]

    QUEUE --> WAIT["Wait for slot"]

    EXECUTE --> RUNNING["Status: 'running'<br/><i>1 PTY process per task</i>"]

    RUNNING --> COMPLETE["Task complete/failed/cancelled"]

    COMPLETE --> CLEANUP["activeTasks.delete()<br/>+ processQueue()"]

    CLEANUP --> DEQUEUE{"taskQueue<br/>not empty?"}

    DEQUEUE -->|"Yes"| NEXT["taskQueue.shift()<br/>→ Execute next"]
    DEQUEUE -->|"No"| IDLE["Idle"]

    NEXT --> RUNNING

    WAIT -.-> CLEANUP
  end

  subgraph CONSTRAINTS["Concurrency Constraints"]
    C1["Each task = 1 PTY process<br/><i>(1 OpenCode instance)</i>"]
    C2["Max 10 concurrent tasks<br/><i>(configurable)</i>"]
    C3["Queue max = maxConcurrent<br/><i>(rejects beyond that)</i>"]
    C4["Single event loop<br/><i>(no thread contention)</i>"]
  end

  classDef action fill:#bbdefb,stroke:#1565c0
  classDef decision fill:#fff9c4,stroke:#f9a825
  classDef constraint fill:#f0f4c3,stroke:#827717

  class NEW,EXECUTE,RUNNING,COMPLETE,CLEANUP,NEXT,IDLE,QUEUE,WAIT action
  class CHECK,DEQUEUE decision
  class C1,C2,C3,C4 constraint
```

---

## 3. Inter-Process Communication Map

Every communication channel, its protocol, direction, and blocking behavior.

```mermaid
graph LR
  R["Renderer<br/>(Chromium)"]
  M["Main<br/>(Node.js)"]
  P["OpenCode<br/>(Go PTY)"]
  B["Dev-Browser<br/>(Node.js)"]

  R -->|"① IPC invoke<br/><i>async req/res<br/>~50 channels</i>"| M
  M -->|"② IPC send<br/><i>push events<br/>batched 50ms</i>"| R

  M -->|"③ PTY write<br/><i>stdin text</i>"| P
  P -->|"④ PTY data<br/><i>stdout JSON stream</i>"| M

  P -->|"⑤ HTTP POST<br/><i>MCP tool call<br/>connection held open</i>"| M
  M -->|"⑤ HTTP response<br/><i>resolved when user<br/>responds (up to 5min)</i>"| P

  P -->|"⑥ CDP/WebSocket"| B

  subgraph LEGEND["Channel Properties"]
    direction TB
    L1["① Async, non-blocking, structured"]
    L2["② Push, batched for performance"]
    L3["③④ Text stream, real-time"]
    L4["⑤ Blocking HTTP — deferred promise pattern"]
    L5["⑥ Browser automation protocol"]
  end

  classDef proc fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
  classDef legend fill:#fafafa,stroke:#bdbdbd

  class R,M,P,B proc
  class L1,L2,L3,L4,L5 legend
```

---

## 4. Permission Request — Deferred Promise Pattern

The most interesting synchronization mechanism: how an MCP HTTP call blocks until a human responds in the UI.

```mermaid
sequenceDiagram
  participant OC as OpenCode (PTY)
  participant HTTP as HTTP Server :9226
  participant PRH as PermissionRequestHandler
  participant IPC as IPC → Renderer
  participant USER as User (React UI)

  OC->>HTTP: POST /request {operation, filePath}
  Note over HTTP: Connection stays open

  HTTP->>PRH: createPermissionRequest()
  Note over PRH: Creates Promise<br/>+ stores resolve/reject<br/>+ starts 5min timeout

  PRH-->>HTTP: { requestId, promise }
  HTTP->>IPC: webContents.send('permission:request', req)
  IPC->>USER: Permission dialog shown

  Note over OC,USER: ⏳ OpenCode PTY is blocked<br/>HTTP connection held open<br/>Main process event loop continues

  USER->>IPC: Click Allow/Deny
  IPC->>PRH: resolvePermissionRequest(id, allowed)
  Note over PRH: Resolves deferred Promise<br/>+ clears timeout

  PRH-->>HTTP: Promise resolves → boolean
  HTTP-->>OC: HTTP 200 {allowed: true/false}
  Note over OC: Resumes execution
```

---

## 5. Message Batching — Render Optimization

How high-frequency PTY output is batched to avoid overwhelming React rendering.

```mermaid
sequenceDiagram
  participant PTY as OpenCode PTY
  participant SP as StreamParser
  participant MP as MessageProcessor
  participant BATCH as Batcher (per task)
  participant IPC as IPC → Renderer
  participant STORE as Zustand Store

  loop Every PTY data chunk (~ms)
    PTY->>SP: raw bytes
    SP->>MP: parsed event
    MP->>BATCH: queueMessage(taskId, msg)
  end

  Note over BATCH: Accumulates messages<br/>for 50ms window

  BATCH->>IPC: webContents.send('task:update:batch',<br/>{taskId, messages[]})

  IPC->>STORE: addTaskUpdateBatch()
  Note over STORE: Single React re-render<br/>for entire batch
```

---

## 6. Session Resumption — Continuation Lifecycle

How the CompletionEnforcer spawns new PTY processes for task continuation, sharing the same OpenCode session.

```mermaid
sequenceDiagram
  participant CE as CompletionEnforcer
  participant OCA as OpenCodeAdapter
  participant PTY1 as PTY Process #1
  participant OC_DB as OpenCode DB<br/>(~/.local/share/opencode/)
  participant PTY2 as PTY Process #2

  Note over PTY1: Agent stops without<br/>calling complete_task

  PTY1->>OCA: process exit (code 0)
  OCA->>CE: handleProcessExit()

  CE->>CE: state = CONTINUATION_PENDING<br/>attempts < 10?

  CE->>OCA: onStartContinuation(prompt)
  OCA->>OCA: spawnSessionResumption()

  Note over OCA: Same sessionId<br/>New PTY process

  OCA->>PTY2: pty.spawn(opencode, --session=<id>, prompt)

  PTY2->>OC_DB: Load full conversation history
  OC_DB-->>PTY2: All prior messages + context

  Note over PTY2: Continues with<br/>full prior context +<br/>continuation prompt

  PTY2->>OCA: new messages via stdout
```

---

## Summary: Concurrency Properties

| Property                   | Value                                 | Mechanism                                 |
| -------------------------- | ------------------------------------- | ----------------------------------------- |
| **Max concurrent tasks**   | 10 (default, configurable)            | `TaskManager.maxConcurrentTasks`          |
| **Task queue max**         | 10 (same as max concurrent)           | Rejects with error if exceeded            |
| **Process per task**       | 1 PTY (OpenCode Go binary)            | `pty.spawn()` per `executeTask()`         |
| **Main process threading** | Single-threaded event loop            | Node.js — no thread contention            |
| **Renderer threading**     | Single-threaded (Chromium)            | React renders on UI thread                |
| **Dev-browser server**     | Detached, outlives parent             | `child.unref()`, persists between tasks   |
| **Permission blocking**    | Deferred Promise, 5min timeout        | HTTP connection held open                 |
| **Message batching**       | 50ms window                           | `setTimeout` + array accumulation         |
| **SQLite concurrency**     | WAL mode (readers don't block writer) | `PRAGMA journal_mode = WAL`               |
| **Session resumption**     | New PTY, same session ID              | OpenCode loads history from its own DB    |
| **API proxies**            | Optional, per-provider                | Azure Foundry + Moonshot only             |
| **Continuation retries**   | Max 10 attempts                       | `CompletionState.maxContinuationAttempts` |
