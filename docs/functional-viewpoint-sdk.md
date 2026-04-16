# Functional Viewpoint — Accomplish Architecture (SDK Era)

> **Status:** Current — reflects the post-SDK-cutover architecture (commercial PR #720, landed in OSS as PR #938, commit `3620532d`). Supersedes [`functional-viewpoint.md`](functional-viewpoint.md), which is retained as historical reference for the PTY era.

> Rozanski & Woods Functional Viewpoint: identifies the system's functional elements, their responsibilities, interfaces, and primary interactions.

These diagrams are **prerequisite reading** before diving into the sequence-level flow diagrams (`task-flow-phases.md`, `completion-enforcer-flows.md` — those still need a corresponding SDK-era rewrite). They show _what the building blocks are_ without prescribing _when things happen_.

## What changed vs. the PTY era

The cutover replaced three things that used to span process / protocol boundaries:

| Concern                  | PTY era (gone)                                                       | SDK era (current)                                                                                     |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **OpenCode transport**   | `node-pty` spawning `opencode run` + `StreamParser` over byte-stream | `@opencode-ai/sdk/v2` talking HTTP to one `opencode serve` per task; SSE for events                   |
| **Permission gating**    | HTTP shims on `:9226` / `:9227` invoked by MCP tools inside OpenCode | Native SDK events (`permission.asked`, `question.asked`) + `client.permission.reply` / `.reply`       |
| **Tool completion hook** | `complete-task` / `start-task` MCP servers over HTTP                 | Tool-part events on the SDK event stream, intercepted by `OpenCodeAdapter` for the CompletionEnforcer |

Net result: **two HTTP bridges and a byte-stream parser are gone.** They are replaced by one per-task HTTP server (`opencode serve`) and an SSE subscription. The daemon still owns everything; the Electron shell is still thin.

## Cast of characters (process view)

Four distinct OS processes cooperate at runtime. This is the biggest shift from the PTY era, where task execution lived inside Electron; now it is fully extracted into the daemon.

| Process                              | Lifetime                                                                                        | Speaks                                                          | Owns                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Electron Main**                    | User-session scoped; exits on Cmd+Q                                                             | IPC (renderer), JSON-RPC (daemon), native OS APIs               | Tray, native dialogs, OAuth browser popups, notification forwarding                             |
| **React Renderer** (inside Electron) | Same as Electron Main                                                                           | `contextBridge` only                                            | UI state (Zustand)                                                                              |
| **Daemon**                           | **Standalone** — started by Electron or login-item; **survives Electron exit**; one per dataDir | JSON-RPC over Unix socket / named pipe; SSE to `opencode serve` | TaskService, OpenCodeServerManager, Scheduler, WhatsApp, Thought-stream HTTP, all persistence   |
| **`opencode serve`** (per task)      | Lazily spawned on `task.start`; 60s idle TTL after terminal; killed on daemon shutdown          | HTTP + SSE (loopback, random ephemeral port)                    | One session, its conversation, tool execution, registered MCP servers, permission/question flow |

Every diagram in this document shows all four. The Daemon — the newest and most load-bearing participant — is always rendered as a dedicated green subgraph. The per-task `opencode serve` children hang off its `OpenCodeServerManager`.

---

## 1. High-Level Architecture Overview

Start here. This diagram shows the four major building blocks, their single-sentence purpose, and the communication channels between them. No internal details — just the shape of the system.

```mermaid
graph TB
  USER(["👤 User"])

  subgraph ELECTRON["Accomplish Desktop App (apps/desktop)"]
    direction TB

    subgraph UI["React UI (apps/web)"]
      UI_DESC["Task input · Chat view · Settings<br/>Permissions · Todos · History"]
    end

    subgraph MAIN_PROC["Electron Main Process<br/><i>Thin UI/integration shell</i>"]
      direction LR
      IPC["IPC Bridge<br/><i>~50 channels</i>"]
      DC["DaemonClient<br/><i>socket transport</i>"]
      AUTH["Auth Browser · Tray ·<br/>Native Dialogs"]
    end
  end

  subgraph DAEMON["Background Daemon  (apps/daemon)<br/><i>Standalone, survives Electron exit</i>"]
    direction TB
    RPC["DaemonRpcServer<br/><i>JSON-RPC over Unix socket / named pipe</i>"]
    CORE["Agent Core<br/><i>TaskManager · OpenCodeAdapter<br/>CompletionEnforcer · Watchdog</i>"]
    SM["OpenCodeServerManager<br/><i>spawns one opencode serve per task</i>"]
    HTTP_AUX["Auxiliary HTTP<br/><i>:9228 thought stream<br/>:9229 WhatsApp send</i>"]
    subgraph STORAGE["Storage"]
      direction LR
      DB["🗄️ SQLite DB<br/><i>Tasks · messages · todos<br/>providers · skills · connectors</i>"]
      KEYS["🔐 Secure Storage<br/><i>AES-256-GCM<br/>API keys · OAuth tokens</i>"]
    end
  end

  subgraph OC_POOL["OpenCode Runtimes  (one per task)"]
    direction TB
    OC1["opencode serve #1<br/><i>127.0.0.1:random</i>"]
    OC2["opencode serve #2<br/><i>127.0.0.1:random</i>"]
    OCN["opencode serve #N<br/><i>(idle, 60s TTL)</i>"]
    OC_DB["🗄️ OpenCode State<br/><i>~/.local/share/opencode/<br/>Sessions · conversation history</i>"]
  end

  subgraph EXTERNAL["External Systems"]
    direction LR
    AI["☁️ AI Providers<br/><i>Anthropic · OpenAI · Google<br/>+ 12 more</i>"]
    FS["💾 Local Files"]
    BROWSER["🌐 Browser<br/><i>Playwright</i>"]
    MCP_EXT["🔌 MCP Connectors<br/><i>OAuth 2.0</i>"]
  end

  USER -->|"natural language task"| UI
  UI -->|"IPC invoke / events"| IPC
  IPC --> DC
  DC <-->|"JSON-RPC 2.0<br/>(daemon.sock)"| RPC
  RPC --> CORE
  CORE -->|"spawn + keep warm"| SM
  SM -->|"child_process.spawn<br/>opencode serve --port=0"| OC1
  SM --> OC2
  SM --> OCN
  CORE <-->|"HTTP + SSE<br/>@opencode-ai/sdk/v2"| OC1
  CORE <-->|"HTTP + SSE"| OC2

  OC1 -->|"HTTPS API calls"| AI
  OC1 -->|"file operations"| FS
  OC1 -->|"browser automation"| BROWSER
  OC1 -->|"remote tools"| MCP_EXT

  CORE -->|"read/write"| DB
  CORE -->|"encrypt/decrypt"| KEYS

  OC1 -->|"report-thought<br/>report-checkpoint MCP"| HTTP_AUX

  classDef userClass fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
  classDef electronClass fill:#f5f5f5,stroke:#424242,stroke-width:2px
  classDef uiClass fill:#fce4ec,stroke:#e53935
  classDef mainClass fill:#e8f4fd,stroke:#1e88e5
  classDef daemonClass fill:#e8f5e9,stroke:#43a047,stroke-width:2px
  classDef ocClass fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef extClass fill:#f3e5f5,stroke:#8e24aa
  classDef storageClass fill:#f0f4c3,stroke:#827717

  class USER userClass
  class UI,UI_DESC uiClass
  class IPC,DC,AUTH mainClass
  class RPC,CORE,SM,HTTP_AUX daemonClass
  class OC1,OC2,OCN,OC_DB ocClass
  class AI,FS,BROWSER,MCP_EXT extClass
  class DB,KEYS storageClass
```

**Key takeaways:**

1. **Electron is a thin shell.** All task execution happens in the daemon. Electron forwards IPC to/from the daemon via a socket-backed `DaemonClient` and adds native capabilities (tray, dialogs, OAuth popups) the daemon can't perform.
2. **One `opencode serve` per task.** `OpenCodeServerManager` lazily spawns a child process when a task starts, keeps it alive for 60s after the task completes for possible follow-up / resume reuse, and tears down the whole process tree on daemon shutdown.
3. **Accomplish never calls LLMs directly.** Each per-task `opencode serve` orchestrates the LLM conversation and tool execution. Accomplish's role is configuration, gating, completion enforcement, persistence, and UI.

---

## 2. Detailed Functional Component Map

The same system exploded — every internal component, its responsibility, and data/control arrows. Refer back to Diagram 1 to stay oriented.

```mermaid
graph TB
  subgraph DESKTOP["<b>apps/desktop</b> — Electron Shell (thin)"]
    direction TB
    MAIN["Electron Main Process"]
    PRELOAD["Preload Bridge<br/><i>(contextBridge)</i>"]
    HANDLERS["IPC Handlers<br/><i>thin proxies to daemon</i>"]
    DAEMON_CLIENT["DaemonClient<br/><i>socket transport</i>"]
    DAEMON_BOOT["Daemon Bootstrap<br/><i>spawn + reconnect</i>"]
    NOTIF_FWD["Notification Forwarder<br/><i>daemon RPC → webContents.send</i>"]
    AUTH_BROWSER["Auth Browser<br/><i>OAuth popups · shell.openExternal</i>"]
    TRAY["System Tray · Native Dialogs"]
  end

  subgraph WEB["<b>apps/web</b> — React UI"]
    direction TB
    ROUTER["Router<br/><i>Home · Execution</i>"]
    TASK_STORE["Task Store<br/><i>(Zustand)</i>"]
    SETTINGS_UI["Settings Dialog<br/><i>Provider · Skills · Connectors · Integrations</i>"]
    EXEC_PAGE["Execution Page<br/><i>Messages · Todos · Permissions</i>"]
    LAUNCHER["Task Launcher<br/><i>(Cmd+K)</i>"]
  end

  subgraph DAEMON["<b>apps/daemon</b> — Standalone Node.js process"]
    direction TB
    RPC_SRV["DaemonRpcServer<br/><i>JSON-RPC over Unix socket / named pipe</i>"]
    ROUTES["daemon-routes.ts<br/><i>~25 RPC methods</i>"]
    TASK_SVC["TaskService<br/><i>orchestrates task lifecycle</i>"]
    TASK_CB["TaskCallbacks<br/><i>adapter events → RPC notify</i>"]
    SVR_MGR["OpenCodeServerManager<br/><i>per-task opencode serve pool</i>"]
    THOUGHT_API["ThoughtStreamService<br/><i>HTTP :9228 · MCP hook</i>"]
    WA_SVC["WhatsAppDaemonService<br/><i>Baileys socket, inbound messages</i>"]
    WA_API["WhatsAppSendApi<br/><i>HTTP :9229 · MCP hook</i>"]
    SCHED["SchedulerService<br/><i>cron-driven task.start</i>"]
    OPENAI_OAUTH["OpenAiOauthManager<br/><i>transient opencode serve<br/>for ChatGPT OAuth</i>"]
    HEALTH["HealthService"]
    STORAGE_SVC["StorageService"]
  end

  subgraph CORE["<b>packages/agent-core</b> — Core Logic (ESM, shared)"]
    direction TB
    TASK_MGR["TaskManager<br/><i>queue + lifecycle</i>"]
    OC_ADAPTER["OpenCodeAdapter<br/><i>SDK v2 bridge · event loop</i>"]
    CE["CompletionEnforcer<br/><i>state machine + continuation</i>"]
    WATCHDOG["TaskInactivityWatchdog<br/><i>soft + hard timeouts</i>"]
    MSG_PROC["MessageProcessor<br/><i>SDK part → TaskMessage</i>"]
    SKILLS_MGR["Skills Manager"]
    SUMMARIZER["Summarizer"]
    CFG_GEN["Config Generator<br/><i>opencode.json per task</i>"]
    CFG_BUILD["Provider Config Builder"]
    AUTH_SYNC["API Key → auth.json sync"]
    MCP_OAUTH["MCP OAuth Client<br/><i>discovery · PKCE · refresh</i>"]
    BROWSER_SVC["Browser Service<br/><i>dev-browser-mcp spawn</i>"]
    PROXIES["API Proxies<br/><i>Azure Foundry · Moonshot</i>"]
    SPEECH["Speech Service<br/><i>ElevenLabs STT</i>"]
    LOG_WATCHER["OpenCode Log Watcher<br/><i>auth-error signal tail</i>"]
    SECURE["SecureStorage<br/><i>AES-256-GCM</i>"]
    DB["SQLite Database<br/><i>WAL mode · migrations</i>"]
    RPC_TRANSPORT["RPC Transport<br/><i>socket + protocol</i>"]
  end

  subgraph OPENCODE["<b>opencode serve</b>  (one subprocess per task)"]
    direction TB
    OC_HTTP["HTTP + SSE server<br/><i>127.0.0.1:random</i>"]
    OC_SESSION["Session + Conversation"]
    OC_LLM["LLM Interaction"]
    OC_TOOLS["Built-in Tools<br/><i>Bash · Read · Write · Edit · Glob · Grep</i>"]
    OC_MCP["Registered MCP Servers<br/><i>thought · checkpoint · whatsapp-send<br/>connectors · dev-browser</i>"]
    OC_PERMS["Native Permission Gate<br/><i>emits permission.asked event</i>"]
    OC_QS["Native Question Flow<br/><i>emits question.asked event</i>"]
  end

  %% UI ↔ Desktop
  ROUTER --> PRELOAD
  TASK_STORE --> PRELOAD
  SETTINGS_UI --> PRELOAD
  LAUNCHER --> PRELOAD
  EXEC_PAGE --> PRELOAD
  PRELOAD -->|"ipcRenderer.invoke"| HANDLERS
  NOTIF_FWD -->|"webContents.send"| PRELOAD

  %% Desktop ↔ Daemon
  HANDLERS -->|"client.call(method, params)"| DAEMON_CLIENT
  DAEMON_CLIENT <-->|"JSON-RPC 2.0<br/>daemon.sock"| RPC_SRV
  DAEMON_BOOT -->|"spawn detached"| DAEMON
  RPC_SRV -->|"rpc.notify(channel, data)"| DAEMON_CLIENT
  DAEMON_CLIENT --> NOTIF_FWD

  %% Daemon internal
  RPC_SRV --> ROUTES
  ROUTES --> TASK_SVC
  ROUTES --> SCHED
  ROUTES --> OPENAI_OAUTH
  ROUTES --> WA_SVC
  ROUTES --> HEALTH
  ROUTES --> STORAGE_SVC
  TASK_SVC --> TASK_CB
  TASK_SVC --> SVR_MGR
  TASK_SVC --> TASK_MGR
  SCHED -->|"startTask(source=scheduler)"| TASK_SVC
  WA_SVC -->|"startTask(source=whatsapp)"| TASK_SVC
  TASK_CB -->|"emit → rpc.notify"| RPC_SRV

  %% Agent-core relationships
  TASK_MGR -->|"creates per task"| OC_ADAPTER
  OC_ADAPTER --> CE
  OC_ADAPTER --> WATCHDOG
  OC_ADAPTER --> MSG_PROC
  OC_ADAPTER --> LOG_WATCHER
  CE -->|"onStartContinuation"| OC_ADAPTER

  %% Daemon → agent-core config
  SVR_MGR --> CFG_GEN
  TASK_SVC --> CFG_GEN
  CFG_GEN --> CFG_BUILD
  CFG_GEN --> SKILLS_MGR
  CFG_GEN --> MCP_OAUTH
  CFG_GEN --> AUTH_SYNC
  AUTH_SYNC --> SECURE
  SKILLS_MGR --> DB

  %% Per-task opencode serve
  SVR_MGR -->|"child_process.spawn<br/>env: OPENCODE_CONFIG"| OC_HTTP
  OC_ADAPTER -.->|"getServerUrl(taskId)"| SVR_MGR
  OC_ADAPTER <-->|"createOpencodeClient(baseUrl)<br/>session.create · session.prompt<br/>event.subscribe (SSE)<br/>permission.reply · question.reply"| OC_HTTP

  %% opencode internals
  OC_HTTP --> OC_SESSION
  OC_SESSION --> OC_LLM
  OC_SESSION --> OC_TOOLS
  OC_SESSION --> OC_MCP
  OC_SESSION --> OC_PERMS
  OC_SESSION --> OC_QS
  OC_LLM -->|"HTTPS"| EXTERNAL["AI Provider APIs"]
  OC_TOOLS --> FS["Local File System"]

  %% MCP tools reach back into the daemon HTTP surface
  OC_MCP -->|"POST /thought · /checkpoint"| THOUGHT_API
  OC_MCP -->|"POST /send"| WA_API

  %% RPC surface for permission + OAuth
  ROUTES -->|"permission.respond"| TASK_SVC
  TASK_SVC -->|"sendResponse"| OC_ADAPTER
  OPENAI_OAUTH -.->|"createTransientOpencodeClient"| SVR_MGR

  %% Styling
  classDef desktop fill:#e8f4fd,stroke:#1e88e5,stroke-width:2px
  classDef web fill:#fce4ec,stroke:#e53935,stroke-width:2px
  classDef daemon fill:#e8f5e9,stroke:#43a047,stroke-width:2px
  classDef core fill:#fff9c4,stroke:#f9a825,stroke-width:2px
  classDef opencode fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef external fill:#f3e5f5,stroke:#8e24aa,stroke-width:1px

  class MAIN,PRELOAD,HANDLERS,DAEMON_CLIENT,DAEMON_BOOT,NOTIF_FWD,AUTH_BROWSER,TRAY desktop
  class ROUTER,TASK_STORE,SETTINGS_UI,EXEC_PAGE,LAUNCHER web
  class RPC_SRV,ROUTES,TASK_SVC,TASK_CB,SVR_MGR,THOUGHT_API,WA_SVC,WA_API,SCHED,OPENAI_OAUTH,HEALTH,STORAGE_SVC daemon
  class TASK_MGR,OC_ADAPTER,CE,WATCHDOG,MSG_PROC,SKILLS_MGR,SUMMARIZER,CFG_GEN,CFG_BUILD,AUTH_SYNC,MCP_OAUTH,BROWSER_SVC,PROXIES,SPEECH,LOG_WATCHER,SECURE,DB,RPC_TRANSPORT core
  class OC_HTTP,OC_SESSION,OC_LLM,OC_TOOLS,OC_MCP,OC_PERMS,OC_QS opencode
  class EXTERNAL,FS external
```

**Notes on the ownership boundary:**

- The daemon (`apps/daemon`) is the only place task execution happens. It spawns `opencode serve` directly (via `child_process.spawn`) — no Electron, no PTY.
- `apps/desktop` is purely Electron-specific concerns (tray, native dialogs, OAuth popups, IPC forwarding). It neither holds task state nor talks to `opencode serve` directly.
- `packages/agent-core` is the shared substrate. Both the daemon (runtime) and the desktop (daemon client + config building during startup) import from it, but only the daemon instantiates `TaskManager` / `OpenCodeAdapter`.

---

## 3. Agent-Core Functional Decomposition

A focused view of `packages/agent-core` — the shared substrate the daemon runs on — showing every class, its single responsibility, and the dependency arrows.

```mermaid
graph LR
  subgraph ORCHESTRATION["Orchestration Layer"]
    TM["<b>TaskManager</b><br/>Task queue<br/>Adapter lifecycle<br/>Event wiring"]
    OCA["<b>OpenCodeAdapter</b><br/>SDK client<br/>Event-subscription loop<br/>Permission/question routing<br/>Tool-part interception"]
  end

  subgraph RESILIENCE["Resilience"]
    CE["<b>CompletionEnforcer</b><br/>State machine<br/>Continuation nudges<br/>Todo validation"]
    WDG["<b>TaskInactivityWatchdog</b><br/>Event fingerprint sampling<br/>Soft timeout (90s stall)<br/>Hard timeout (+60s)"]
    CS["<b>CompletionState</b><br/>State enum + transitions"]
    LW["<b>OpenCodeLogWatcher</b><br/>Tail on-disk opencode log<br/>Auth-error detection"]
  end

  subgraph CONFIG["Per-Task Configuration"]
    CG["<b>ConfigGenerator</b><br/>opencode.json generation<br/>System prompt assembly<br/>MCP server registration"]
    CB["<b>ProviderConfigBuilder</b><br/>Provider-specific config<br/>Model mapping"]
    AUTH_SYNC["<b>syncApiKeysToOpenCodeAuth</b><br/>Decrypt → auth.json"]
    ENV["<b>Environment Builder</b><br/>OPENCODE_CONFIG[_DIR]<br/>Bundled Node on PATH"]
    TC["<b>Tool Classification</b>"]
    CLI_RES["<b>resolveCliPath</b><br/>Locate opencode binary<br/>(packaged vs dev)"]
  end

  subgraph STREAM["Event Processing"]
    MP["<b>MessageProcessor</b><br/>SDK Part → TaskMessage<br/>Batching · stable IDs<br/>Model-context stamping"]
  end

  subgraph GATING["Human-in-the-Loop"]
    PR_TYPES["<b>PermissionRequest types</b><br/>file · tool · question<br/>PermissionResponse schema"]
    PEND_REQ["<b>PendingRequest<br/>(in adapter)</b><br/>Track SDK request ID<br/>Route reply back"]
  end

  subgraph DAEMON_RPC["Daemon RPC Substrate"]
    RPC_SRV_C["<b>DaemonRpcServer</b><br/>JSON-RPC 2.0 over socket"]
    RPC_CLI_C["<b>DaemonClient</b><br/>method call + notify listeners"]
    RPC_TPT["<b>createSocketTransport</b>"]
    PID["<b>PidLock</b><br/>Single-daemon enforcement"]
    CRASH["<b>installCrashHandlers</b>"]
  end

  subgraph SERVICES["Services"]
    SKM["<b>SkillsManager</b><br/>Scan · sync · CRUD<br/>Official + custom + community"]
    SPE["<b>SpeechService</b><br/>ElevenLabs STT API"]
    SUM["<b>Summarizer</b><br/>LLM-powered task titles"]
    MCO["<b>MCP OAuth</b><br/>Discovery · PKCE · token refresh"]
    BRO["<b>BrowserService</b><br/>Playwright Chromium<br/>dev-browser MCP spawn"]
    PXY["<b>API Proxies</b><br/>Azure Foundry proxy<br/>Moonshot proxy"]
    OAI_HELP["<b>OpenAI OAuth helpers</b><br/>status · access-token · plan"]
  end

  subgraph STORAGE["Storage Layer"]
    DB["<b>Database</b><br/>SQLite + WAL<br/>Migration runner"]
    SS["<b>SecureStorage</b><br/>AES-256-GCM encryption<br/>API key + OAuth vault"]
    R1["Repo: taskHistory"]
    R2["Repo: providerSettings"]
    R3["Repo: appSettings"]
    R4["Repo: skills"]
    R5["Repo: connectors"]
    R6["Repo: workspaces"]
    R7["Repo: scheduledTasks"]
  end

  %% Dependencies
  TM --> OCA
  OCA --> CE
  OCA --> WDG
  OCA --> MP
  OCA --> LW
  OCA --> PEND_REQ
  CE --> CS
  CG --> CB
  CG --> AUTH_SYNC
  CG --> TC
  CG --> SKM
  CG --> MCO
  AUTH_SYNC --> SS
  SKM --> R4
  DB --> R1
  DB --> R2
  DB --> R3
  DB --> R4
  DB --> R5
  DB --> R6
  DB --> R7
  SPE --> SS
  SUM -.->|"direct LLM calls"| EXTERNAL["AI Provider APIs"]
  RPC_SRV_C --> RPC_TPT
  RPC_CLI_C --> RPC_TPT

  classDef orch fill:#bbdefb,stroke:#1565c0
  classDef resil fill:#c8e6c9,stroke:#2e7d32
  classDef conf fill:#fff9c4,stroke:#f9a825
  classDef parse fill:#d1c4e9,stroke:#5e35b1
  classDef gate fill:#ffccbc,stroke:#e64a19
  classDef rpc fill:#b3e5fc,stroke:#0277bd
  classDef svc fill:#b2dfdb,stroke:#00695c
  classDef store fill:#f0f4c3,stroke:#827717

  class TM,OCA orch
  class CE,WDG,CS,LW resil
  class CG,CB,AUTH_SYNC,ENV,TC,CLI_RES conf
  class MP parse
  class PR_TYPES,PEND_REQ gate
  class RPC_SRV_C,RPC_CLI_C,RPC_TPT,PID,CRASH rpc
  class SKM,SPE,SUM,MCO,BRO,PXY,OAI_HELP svc
  class DB,SS,R1,R2,R3,R4,R5,R6,R7 store
```

**What's gone vs. the PTY-era `agent-core`:**

- `StreamParser` — no byte-stream to parse; the SDK delivers structured events.
- `PermissionRequestHandler` / `ThoughtStreamHandler` in the deferred-promise shape — `PendingRequest` inside the adapter replaces the former; the latter still exists at the RPC layer but doesn't gate task progression.
- PTY spawn helpers (`buildCliArgs`, `buildEnvironment` per-task) — `ConfigGenerator` still builds the environment, but the spawn happens in `OpenCodeServerManager`, not `OpenCodeAdapter`.

**What's new:**

- `TaskInactivityWatchdog` — a dedicated stall detector. With no PTY back-pressure to observe, the SDK model needs an explicit "no events for 90s + 60s → fail" safety net.
- `OpenCodeAdapter.PendingRequest` — tracks the SDK's native `permission.asked` / `question.asked` request IDs so the `sendResponse` reply can round-trip to the correct SDK call (`client.permission.reply` or `client.question.reply`).
- `AUTH_SYNC` — `syncApiKeysToOpenCodeAuth` writes decrypted provider credentials into `~/.local/share/opencode/auth.json` just before `opencode serve` starts, since the SDK server reads provider credentials from disk rather than env vars.

---

## 4. Communication Channel Map

Shows every communication mechanism in the system — IPC channels, socket RPC, SSE streams, and the handful of HTTP endpoints that remain.

```mermaid
graph TB
  subgraph RENDERER["React Renderer Process"]
    UI["React Components"]
    STORE["Zustand Store"]
  end

  subgraph BRIDGE["Preload Bridge"]
    CB["contextBridge<br/><i>window.accomplish</i>"]
  end

  subgraph MAIN["Electron Main Process"]
    IPC_H["IPC Handlers<br/><i>~50 handle() calls</i>"]
    DAEMON_CLIENT["DaemonClient<br/><i>socket JSON-RPC</i>"]
    NOTIF_FWD["Notification Forwarder"]
  end

  subgraph DAEMON_P["Daemon Process"]
    RPC_SRV["DaemonRpcServer<br/><i>daemon.sock / named pipe</i>"]
    TASK_SVC["TaskService"]
    ADAPTER["OpenCodeAdapter"]
    THOUGHT_HTTP["HTTP :9228<br/><i>thought stream</i>"]
    WA_HTTP["HTTP :9229<br/><i>WhatsApp send</i>"]
  end

  subgraph OC_SVR["opencode serve (per task)"]
    OC["HTTP API<br/><i>127.0.0.1:random</i>"]
    OC_SSE["SSE event stream<br/><i>event.subscribe</i>"]
    OC_MCP["MCP clients<br/><i>thought · whatsapp · connectors</i>"]
  end

  %% Invoke (renderer → main)
  UI -->|"ipcRenderer.invoke(channel, ...args)"| CB
  CB -->|"ipcMain.handle(channel)"| IPC_H
  IPC_H -->|"return value"| CB
  CB -->|"Promise resolve"| UI

  %% Main → Daemon (task lifecycle, permission.respond, etc.)
  IPC_H -->|"client.call('task.start' | 'permission.respond' | ...)"| DAEMON_CLIENT
  DAEMON_CLIENT -->|"JSON-RPC request<br/>Unix socket / named pipe"| RPC_SRV
  RPC_SRV -->|"response"| DAEMON_CLIENT

  %% Daemon → Main (notifications)
  RPC_SRV -->|"rpc.notify('task.message' | 'permission.request' |<br/>'task.progress' | 'task.statusChange' |<br/>'todo.update' | 'auth.error' | 'browser.frame' |<br/>'task.thought' | 'task.checkpoint' | ...)"| DAEMON_CLIENT
  DAEMON_CLIENT --> NOTIF_FWD
  NOTIF_FWD -->|"webContents.send(channel, data)"| CB
  CB -->|"ipcRenderer.on()"| STORE

  %% Daemon internal
  RPC_SRV -->|"JS function calls"| TASK_SVC
  TASK_SVC -->|"EventEmitter callbacks"| RPC_SRV
  TASK_SVC -->|"task-manager → adapter"| ADAPTER

  %% Adapter ↔ opencode serve (HTTP + SSE)
  ADAPTER -->|"session.create · session.prompt<br/>permission.reply · question.reply<br/>session.abort"| OC
  OC_SSE -->|"message.updated<br/>message.part.updated<br/>message.part.delta<br/>permission.asked<br/>question.asked<br/>session.idle · session.error<br/>todo.updated"| ADAPTER

  %% MCP hooks (opencode → daemon HTTP)
  OC_MCP -->|"POST /thought (auth token)"| THOUGHT_HTTP
  OC_MCP -->|"POST /checkpoint (auth token)"| THOUGHT_HTTP
  OC_MCP -->|"POST /send (auth token)"| WA_HTTP
  THOUGHT_HTTP -->|"rpc.notify('task.thought')"| RPC_SRV

  %% Styling
  classDef renderer fill:#fce4ec,stroke:#e53935
  classDef bridge fill:#e0e0e0,stroke:#616161
  classDef main fill:#e8f4fd,stroke:#1e88e5
  classDef daemon fill:#e8f5e9,stroke:#43a047
  classDef oc fill:#fff3e0,stroke:#fb8c00

  class UI,STORE renderer
  class CB bridge
  class IPC_H,DAEMON_CLIENT,NOTIF_FWD main
  class RPC_SRV,TASK_SVC,ADAPTER,THOUGHT_HTTP,WA_HTTP daemon
  class OC,OC_SSE,OC_MCP oc
```

**Channels inventory:**

| Channel                    | Transport                          | Direction      | Purpose                                                                               |
| -------------------------- | ---------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Renderer ↔ Main            | `ipcRenderer.invoke` / `on`        | Bidirectional  | UI → task commands; main → streaming updates                                          |
| Main ↔ Daemon              | Unix socket / Windows named pipe   | Bidirectional  | JSON-RPC 2.0; task lifecycle, permission.respond, session.resume, etc.                |
| Daemon notify → Main       | same socket                        | Daemon → Main  | `rpc.notify` for messages, permission prompts, progress, todos, auth errors, frames   |
| Adapter ↔ `opencode serve` | HTTP + SSE (loopback, random port) | Bidirectional  | SDK v2 method calls (request/reply) + event stream (SSE) for session state            |
| MCP tool → Daemon          | HTTP `:9228` / `:9229` + token     | MCP → Daemon   | `report-thought`, `report-checkpoint`, `whatsapp-send` (still MCP-callback for those) |
| Daemon → External          | HTTPS                              | Daemon → Cloud | AI provider APIs (only during the Summarizer path); OpenCode does its own LLM calls   |

**Ports that are gone:**

`:9226` (file permission HTTP) and `:9227` (user question HTTP) are **removed**. Their MCP shims (`file-permission`, `ask-user-question`, `complete-task`, `start-task`) were replaced by native SDK events and tool-part observation on the SSE stream.

---

## 5. OpenCode Server Manager — per-task runtime pool

The component most readers will find new. This diagram focuses on **why** and **how** `opencode serve` instances are managed.

```mermaid
graph TB
  subgraph TASK_SVC["TaskService"]
    START["startTask(params)"]
    STOP["stopTask(params)"]
    RESUME["resumeSession(params)"]
  end

  subgraph SM["OpenCodeServerManager  (singleton per daemon)"]
    direction TB
    ENSURE["ensureTaskRuntime(taskId)<br/><i>lazy spawn</i>"]
    WAIT["waitForServerUrl(taskId)<br/><i>poll until ready or 10s timeout</i>"]
    SCHED_CLEANUP["scheduleTaskRuntimeCleanup(taskId, 60s)<br/><i>idle grace window</i>"]
    DESTROY["destroyTaskRuntime(taskId)"]
    GET_URL["getServerUrlResolver()<br/><i>closure handed to adapter</i>"]
  end

  subgraph RT["OpenCodeTaskRuntime  (one per active taskId)"]
    direction TB
    RT_START["start()<br/><i>1. onBeforeStart — write opencode.json,<br/>sync auth.json, build env<br/>2. spawn opencode serve --port=0<br/>3. parse stdout for ready URL</i>"]
    RT_STOP["stop() · abortStart()"]
    PID_TRACK["trackRuntimePid()<br/><i>process-group (POSIX) or taskkill /T /F (Win)</i>"]
  end

  subgraph OC_PROC["opencode serve child process"]
    direction TB
    OC["HTTP server<br/><i>127.0.0.1:random</i>"]
    OC_LISTEN["stdout:<br/>'opencode server listening on http://127.0.0.1:49281'"]
    OC_LOGS["stdout/stderr<br/><i>forwarded to daemon pino log</i>"]
  end

  subgraph GLOBAL["Global state"]
    ACTIVE_PIDS["activeRuntimePids Set<br/><i>exit-hook cleanup on daemon shutdown</i>"]
  end

  subgraph ADAPTER["OpenCodeAdapter"]
    ADAPTER_START["startTask(config)"]
    ADAPTER_CLIENT["createOpencodeClient({ baseUrl })"]
  end

  subgraph TRANSIENT["Transient OAuth client"]
    TR["createTransientOpencodeClient()<br/><i>not pooled — one-shot for<br/>ChatGPT OAuth flow</i>"]
  end

  START -->|"wire getServerUrl"| GET_URL
  START -->|"taskManager.startTask"| ADAPTER_START
  ADAPTER_START -->|"getServerUrl(taskId)"| GET_URL
  GET_URL --> ENSURE
  ENSURE --> RT
  ENSURE -->|"first call"| RT_START
  WAIT -.->|"polls until ready"| RT
  ADAPTER_START -->|"await serverUrl"| ADAPTER_CLIENT
  ADAPTER_CLIENT -->|"HTTP + SSE"| OC

  RT_START --> OC_PROC
  OC --> OC_LISTEN
  OC_LISTEN -.->|"regex match<br/>resolves start()"| RT_START
  OC -.->|"stdout/stderr"| OC_LOGS
  RT_START --> PID_TRACK
  PID_TRACK --> ACTIVE_PIDS

  STOP -->|"on complete/error/cancel"| SCHED_CLEANUP
  SCHED_CLEANUP -->|"60s timer"| DESTROY
  RESUME -.->|"reuses runtime if still alive"| ENSURE
  DESTROY --> RT_STOP
  RT_STOP --> PID_TRACK

  OPENAI_OAUTH["OpenAiOauthManager"] -->|"short-lived auth flow"| TR
  TR --> OC_PROC

  classDef tsvc fill:#e8f5e9,stroke:#43a047
  classDef sm fill:#fff9c4,stroke:#f9a825,stroke-width:2px
  classDef rt fill:#c8e6c9,stroke:#2e7d32
  classDef oc fill:#fff3e0,stroke:#fb8c00
  classDef adapter fill:#bbdefb,stroke:#1565c0
  classDef global fill:#ffccbc,stroke:#e64a19

  class START,STOP,RESUME tsvc
  class ENSURE,WAIT,SCHED_CLEANUP,DESTROY,GET_URL sm
  class RT_START,RT_STOP,PID_TRACK rt
  class OC,OC_LISTEN,OC_LOGS oc
  class ADAPTER_START,ADAPTER_CLIENT adapter
  class ACTIVE_PIDS global
  class OPENAI_OAUTH,TR tsvc
```

### 5.1 Whose HTTP server is this, anyway?

**It is OpenCode's own HTTP server, not one Accomplish wrote.**

`opencode` (the [opencode-ai npm package](https://www.npmjs.com/package/opencode-ai)) ships a `serve` subcommand that boots a local HTTP + Server-Sent-Events server inside the opencode runtime. That server exposes the v2 API — sessions, prompts, events, permissions, questions, tool-part streams — which is exactly what [`@opencode-ai/sdk/v2`](https://www.npmjs.com/package/@opencode-ai/sdk) is built to talk to. Accomplish's daemon does not implement any of this protocol; it only:

1. Spawns `opencode serve --hostname=127.0.0.1 --port=0` as a child process (random ephemeral port).
2. Greps its stdout for the ready line (`opencode server listening on http://127.0.0.1:NNNN`).
3. Hands that URL to `createOpencodeClient({ baseUrl })` inside `OpenCodeAdapter`.

So the HTTP server exists because the supported programmatic contract with OpenCode **is** HTTP + SSE. In the PTY era, Accomplish drove opencode through the `opencode run` CLI and parsed its stdout. That form offered no structured event model, no permission primitives, and was sensitive to terminal control codes. `opencode serve` + SDK is the opencode team's recommended integration path; moving to it was the whole point of the cutover.

The two remaining auxiliary HTTP endpoints on the daemon (`:9228` thought stream, `:9229` WhatsApp send) are **orthogonal** — they are plain MCP tool callback servers that OpenCode's MCP-tool clients POST to. They are not part of the SDK transport.

### 5.2 Why one server per task — even for follow-ups?

Short answer: **runtime isolation wins against a small startup cost that is already mostly amortized for follow-ups by a 60-second warm-reuse window.**

Long answer, per design pressure:

| Pressure                           | What a single shared `opencode serve` would force                                                                                                                                                                       | What per-task buys                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Per-task configuration**         | Every task would run with the same `opencode.json` — provider, enabled skills, enabled connectors, system-prompt suffix. Reconfiguring requires a restart, which means a shared server can't adapt to the current task. | Each task picks its own provider, skill set, MCP list. Config lives in the spawned child. |
| **Event-stream scoping**           | `event.subscribe()` is **server-wide**, not session-scoped. Sharing means the adapter must demux every event (`permission.asked`, `message.part.updated`) by `sessionID` and risks cross-task leakage on a bug.         | Every adapter has its own dedicated SSE stream. Zero demux, zero leakage.                 |
| **Crash blast radius**             | A provider / plugin / OOM bug inside `opencode serve` takes down every concurrent task.                                                                                                                                 | One task crashes; the others keep their own runtimes and finish.                          |
| **Port hygiene and multi-profile** | Static port collides with co-running Accomplish profiles, other apps, or a crashed daemon.                                                                                                                              | `--port=0` gets a fresh ephemeral port per child.                                         |
| **Graceful shutdown & reclaim**    | Killing a shared server to reclaim memory or reset state affects every active task.                                                                                                                                     | One runtime's teardown is a private event.                                                |

**Does a follow-up spawn a fresh server?** Not if it arrives quickly. `OpenCodeServerManager` holds the runtime in its map keyed by `taskId` and sets a 60-second cleanup timer on terminal events (`complete` / `error` / `cancelled`). Three cases:

1. **UI follow-up via the same taskId, within 60s** (e.g., user typing the next prompt into an existing chat). `resumeSession({ existingTaskId })` → `_runTask(taskId, …)` → `getServerUrl(taskId)` → `ensureTaskRuntime(taskId)` sees the cached runtime, cancels the cleanup timer, and the adapter reconnects to the already-running `opencode serve` on the same port. **No spawn, no handshake.**
2. **UI follow-up after 60s.** The runtime has already been torn down. A fresh one is spawned, and the adapter calls `session.create` / `session.prompt` with the prior `sessionID`. OpenCode persists sessions on disk (`~/.local/share/opencode/`) so the new runtime sees the full prior conversation — only the process is new.
3. **A completely new task (new taskId).** Always gets its own runtime. Prior and new tasks each have dedicated servers and can run in parallel.

**Is this design "right"?** It is right for a few concrete reasons:

- **The isolation wins are real.** We are orchestrating an AI runtime that loads user plugins (MCP servers), hits the network, and sometimes enters unbounded loops. Per-task isolation makes both bugs and cancellation local.
- **The common cost is hidden.** Interactive follow-ups (the hot path) hit the 60-second warm window and spawn nothing. Only cold starts and first-in-session runs pay the ~1–2s spawn cost, and the user already expects latency on those.
- **It mirrors the SDK's intended deployment shape.** OpenCode's own documentation treats `opencode serve` as session-local. Pooling it across unrelated sessions would be going against the grain.

The downside is memory. Ten concurrent tasks mean ten `opencode serve` processes and ten plugin-subprocess groups. For Accomplish's current `maxConcurrentTasks=10` and typical usage (1–2 tasks at a time) this has not been a problem, but if the workload ever shifts toward very high concurrency, a session-multiplexed variant would be the right refactor to revisit. For today, per-task is the correct call.

### 5.3 Lifecycle invariants

- **Lazy spawn.** No `opencode serve` runs until `task.start` fires. Daemon idle cost is zero opencode processes.
- **60-second idle reuse.** On a task's terminal transition (success / error / cancelled), `scheduleTaskRuntimeCleanup(taskId, 60_000)` defers teardown. Any follow-up that reaches `ensureTaskRuntime(taskId)` within that window cancels the timer via `clearCleanupTimer` and reuses the warm child.
- **Process-tree kill.** Runtime shutdown uses POSIX `process.kill(-pid, 'SIGKILL')` (process group) or Windows `taskkill /PID pid /T /F` to make sure opencode's MCP plugin subprocesses go too.
- **Daemon-exit sweep.** `activeRuntimePids` is a module-level set; a `process.on('exit')` handler iterates it and kills every tracked pid. Prevents port leaks from daemon crashes. Registered lazily on first `spawnOpenCodeServer` via `ensureRuntimeCleanupRegistered`.
- **Transient clients.** `OpenAiOauthManager` uses `createTransientOpencodeClient()` for the ChatGPT OAuth flow — a one-shot `opencode serve` that is spawned, used to drive `auth.provider`, and then closed. Never pooled or keyed by taskId.

---

## 6. Provider & Configuration Pipeline

How provider settings flow from the UI through daemon-side configuration generation into a spawned `opencode serve`.

```mermaid
graph TB
  subgraph UI["Settings UI (React)"]
    PROVIDER_GRID["Provider Grid<br/><i>15 provider cards</i>"]
    API_KEY_INPUT["API Key Input"]
    MODEL_SELECT["Model Selector"]
  end

  subgraph IPC["Desktop IPC + Daemon RPC"]
    IPC_SETTINGS["ipcMain.handle('settings:add-api-key')"]
    RPC_KEYS["RPC: storage.setApiKey"]
  end

  subgraph STORAGE["Daemon Storage"]
    PROVIDER_SETTINGS["provider_settings table<br/><i>active provider · connected providers · selected models</i>"]
    SECURE["SecureStorage<br/><i>AES-256-GCM encrypted keys</i>"]
  end

  subgraph START["Per-task startup (onBeforeStart)"]
    direction TB
    SYNC_AUTH["syncApiKeysToOpenCodeAuth<br/><i>decrypt → ~/.local/share/opencode/auth.json</i>"]
    BUILD_PROV["buildProviderConfigs<br/><i>Provider-specific model config</i>"]
    GET_SKILLS["getEnabledSkills<br/><i>Bundled + user skills</i>"]
    GEN_CFG["generateConfig<br/><i>Writes opencode.json</i>"]
    ENV_BUILD["Environment Builder<br/><i>OPENCODE_CONFIG[_DIR]<br/>PATH += bundled node</i>"]
  end

  subgraph PROXIES["Optional Local Proxies"]
    AZ_PROXY["Azure Foundry Proxy<br/><i>localhost:random</i>"]
    MOON_PROXY["Moonshot Proxy<br/><i>localhost:random</i>"]
  end

  subgraph SPAWN["Per-task opencode serve"]
    PROC["child_process.spawn<br/><i>opencode serve --hostname=127.0.0.1 --port=0</i>"]
    ENV_VARS["Child env<br/><i>{...process.env, OPENCODE_CONFIG, OPENCODE_CONFIG_DIR, PATH}</i>"]
    OC_HTTP["HTTP API on random port"]
  end

  %% Flow
  PROVIDER_GRID --> API_KEY_INPUT
  API_KEY_INPUT -->|"IPC"| IPC_SETTINGS
  IPC_SETTINGS --> RPC_KEYS
  RPC_KEYS --> SECURE
  MODEL_SELECT -->|"IPC"| IPC_SETTINGS
  IPC_SETTINGS -->|"RPC"| PROVIDER_SETTINGS

  PROVIDER_SETTINGS --> BUILD_PROV
  SECURE --> SYNC_AUTH
  SYNC_AUTH -->|"writes auth.json"| OC_HTTP
  BUILD_PROV --> GEN_CFG
  GET_SKILLS --> GEN_CFG
  GEN_CFG -->|"writes opencode.json"| ENV_BUILD
  ENV_BUILD --> ENV_VARS
  ENV_VARS --> PROC
  PROC --> OC_HTTP

  BUILD_PROV -.->|"if Azure Foundry"| AZ_PROXY
  BUILD_PROV -.->|"if Moonshot"| MOON_PROXY
  AZ_PROXY -.-> PROC
  MOON_PROXY -.-> PROC

  classDef ui fill:#fce4ec,stroke:#e53935
  classDef ipc fill:#e8f4fd,stroke:#1e88e5
  classDef storage fill:#f0f4c3,stroke:#827717
  classDef config fill:#fff9c4,stroke:#f9a825
  classDef spawn fill:#fff3e0,stroke:#fb8c00
  classDef proxy fill:#e0e0e0,stroke:#616161

  class PROVIDER_GRID,API_KEY_INPUT,MODEL_SELECT ui
  class IPC_SETTINGS,RPC_KEYS ipc
  class PROVIDER_SETTINGS,SECURE storage
  class SYNC_AUTH,BUILD_PROV,GET_SKILLS,GEN_CFG,ENV_BUILD config
  class PROC,ENV_VARS,OC_HTTP spawn
  class AZ_PROXY,MOON_PROXY proxy
```

**Notable pipeline changes from the PTY era:**

- Credentials are written to `auth.json` (a file `opencode serve` reads at startup) rather than injected as process env vars, because the SDK server has its own config-loading conventions and the file format covers credentials the env-var approach can't (OAuth tokens, per-provider endpoints).
- `opencode.json` no longer registers `complete-task` / `start-task` / `file-permission` / `ask-user-question` as MCP servers. Those MCP shims were the bridge layer that the SDK events replaced.
- `onBeforeStart` is invoked by the daemon's `OpenCodeServerManager` (before `opencode serve` spawns) **and** forwarded to the adapter via `AdapterOptions.onBeforeStart` (so `externalEnv` stays in sync for consumers that still inspect it). The two calls produce equivalent env.

---

## 7. Skills & Connectors Functional Model

How skills and MCP connectors are managed, stored, and injected into the per-task agent configuration. (Structurally unchanged from the PTY era — included for completeness.)

```mermaid
graph TB
  subgraph SOURCES["Skill Sources"]
    BUNDLED["Bundled Skills<br/><i>resources/skills/</i>"]
    USER_DIR["User Skills<br/><i>~/.../Accomplish/skills/</i>"]
    GITHUB["GitHub URL<br/><i>raw.githubusercontent.com</i>"]
    LOCAL_FILE["Local .md File"]
  end

  subgraph SKILLS_MGR["SkillsManager"]
    SCAN["scanDirectory()<br/><i>Find SKILL.md files</i>"]
    PARSE["parseFrontmatter()<br/><i>gray-matter YAML</i>"]
    SYNC["resync()<br/><i>Upsert + prune stale</i>"]
    ADD["addSkill()<br/><i>From file or URL</i>"]
  end

  subgraph CONNECTORS["MCP Connector Management"]
    DISC["discoverOAuthMetadata()<br/><i>.well-known/oauth-authorization-server</i>"]
    REG["registerOAuthClient()<br/><i>Dynamic client registration</i>"]
    PKCE["generatePkceChallenge()<br/><i>S256 code challenge</i>"]
    TOKEN["exchangeCodeForTokens()"]
    REFRESH["refreshAccessToken()"]
  end

  subgraph DB["SQLite Storage"]
    SKILLS_TBL["skills table"]
    CONN_TBL["connectors table"]
  end

  subgraph INJECTION["Injection into the per-task opencode serve"]
    SYS_PROMPT["opencode.json: systemPrompt<br/><i>Enabled skill content appended</i>"]
    MCP_CONF["opencode.json: mcp-servers<br/><i>Enabled connectors</i>"]
  end

  BUNDLED --> SCAN
  USER_DIR --> SCAN
  GITHUB --> ADD
  LOCAL_FILE --> ADD
  SCAN --> PARSE
  PARSE --> SYNC
  SYNC --> SKILLS_TBL
  ADD --> SKILLS_TBL

  DISC --> REG
  REG --> PKCE
  PKCE --> TOKEN
  TOKEN --> CONN_TBL
  REFRESH --> CONN_TBL

  SKILLS_TBL -->|"getEnabledSkills()"| SYS_PROMPT
  CONN_TBL -->|"enabled connectors"| MCP_CONF

  classDef source fill:#e0f2f1,stroke:#00695c
  classDef mgr fill:#e8f5e9,stroke:#43a047
  classDef conn fill:#e3f2fd,stroke:#1565c0
  classDef db fill:#f0f4c3,stroke:#827717
  classDef inject fill:#fff9c4,stroke:#f9a825

  class BUNDLED,USER_DIR,GITHUB,LOCAL_FILE source
  class SCAN,PARSE,SYNC,ADD mgr
  class DISC,REG,PKCE,TOKEN,REFRESH conn
  class SKILLS_TBL,CONN_TBL db
  class SYS_PROMPT,MCP_CONF inject
```

---

## 8. Permission & Question Request Flow

A focused view of the single most-changed path in the cutover — human-in-the-loop gating. Same goal as before (user approves file writes, answers clarification questions), entirely different transport.

```mermaid
graph LR
  subgraph OC["opencode serve (per task)"]
    TOOL["Tool invocation<br/><i>Write/Edit/Bash/…</i>"]
    Q_ASK["ask-user-question tool"]
    PERM_EV["emits permission.asked<br/><i>(SSE event)</i>"]
    Q_EV["emits question.asked<br/><i>(SSE event)</i>"]
  end

  subgraph ADAPTER["OpenCodeAdapter (daemon)"]
    SUB["event.subscribe loop<br/><i>handleSdkEvent</i>"]
    PEND["PendingRequest map<br/><i>sdk request id ↔ oss request id</i>"]
    EMIT["emit('permission-request')"]
    SEND["sendResponse(response)"]
    REPLY["client.permission.reply / question.reply"]
  end

  subgraph DAEMON_RPC["Daemon RPC surface"]
    NOTIFY["rpc.notify('permission.request', req)"]
    RESPOND["RPC method: permission.respond"]
  end

  subgraph DESKTOP["Electron Main"]
    FWD["Notification Forwarder"]
    IPC["ipcMain.handle('permission:respond')"]
  end

  subgraph UI_R["React UI"]
    DIALOG["Permission / Question Dialog"]
    USER_CLICK["User clicks Allow / Deny /<br/>picks answer option"]
  end

  TOOL -->|"requires permission"| PERM_EV
  Q_ASK --> Q_EV
  PERM_EV --> SUB
  Q_EV --> SUB
  SUB --> PEND
  PEND --> EMIT
  EMIT --> NOTIFY
  NOTIFY -->|"socket"| FWD
  FWD -->|"webContents.send"| DIALOG
  DIALOG --> USER_CLICK
  USER_CLICK -->|"ipcRenderer.invoke"| IPC
  IPC -->|"client.call"| RESPOND
  RESPOND --> SEND
  SEND -->|"looks up PendingRequest"| PEND
  SEND --> REPLY
  REPLY -->|"HTTP"| OC

  classDef oc fill:#fff3e0,stroke:#fb8c00
  classDef adapter fill:#bbdefb,stroke:#1565c0
  classDef rpc fill:#e8f5e9,stroke:#43a047
  classDef desktop fill:#e8f4fd,stroke:#1e88e5
  classDef ui fill:#fce4ec,stroke:#e53935

  class TOOL,Q_ASK,PERM_EV,Q_EV oc
  class SUB,PEND,EMIT,SEND,REPLY adapter
  class NOTIFY,RESPOND rpc
  class FWD,IPC desktop
  class DIALOG,USER_CLICK ui
```

**Source-based auto-deny safeguard:** When a permission prompt reaches `task-callbacks.onPermissionRequest` for a task whose source is not `'ui'` (WhatsApp, scheduler) and there is no live RPC client connected, the callback auto-denies via the same reply path. This replaces the PTY-era "HTTP callback times out after 5 minutes" safeguard the deleted `PermissionService` provided.

---

## Component Responsibility Matrix

| Component                          | Package      | Responsibility                                                                                                   | Key Interfaces                                                                                                 |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | --- |
| **TaskManager**                    | agent-core   | Task queue, lifecycle, adapter event wiring                                                                      | `startTask()`, `cancelTask()`, `sendResponse()`                                                                |
| **OpenCodeAdapter**                | agent-core   | SDK v2 client, SSE event loop, permission/question routing, tool-part interception                               | `startTask()`, `resumeSession()`, `sendResponse()`, `cancelTask()`                                             |
| **CompletionEnforcer**             | agent-core   | State machine ensuring `complete_task` is called, continuation nudges                                            | `handleCompleteTaskDetection()`, `markToolsUsed()`, `updateTodos()`                                            |
| **TaskInactivityWatchdog**         | agent-core   | Stall detection (90s soft / +60s hard) via fingerprint sampling                                                  | `sample()` callback; `onSoftTimeout` / `onHardTimeout`                                                         |
| **MessageProcessor**               | agent-core   | SDK Part → TaskMessage conversion, message batching, model-context stamping                                      | `toTaskMessage()`, `queueMessage()`, `flushAndCleanupBatcher()`                                                |
| **ConfigGenerator**                | agent-core   | Generates per-task `opencode.json` (prompt, MCP servers, providers, skills)                                      | `generateConfig()` → JSON file path                                                                            |
| **syncApiKeysToOpenCodeAuth**      | agent-core   | Decrypts SecureStorage keys into `~/.local/share/opencode/auth.json` before `opencode serve` spawn               | one call per task startup                                                                                      |
| **OpenCodeServerManager**          | apps/daemon  | Per-task `opencode serve` pool: spawn, readiness wait, idle reuse, process-tree cleanup, transient OAuth clients | `ensureTaskRuntime()`, `waitForServerUrl()`, `scheduleTaskRuntimeCleanup()`, `createTransientOpencodeClient()` |
| **TaskService**                    | apps/daemon  | Daemon-side task orchestrator, source-based routing, server-manager owner                                        | `startTask()`, `stopTask()`, `resumeSession()`, `sendResponse()`                                               |
| **DaemonRpcServer / DaemonClient** | agent-core   | JSON-RPC 2.0 over Unix socket / Windows named pipe, notify fan-out                                               | `registerMethod()`, `notify()`, `call()`, `onNotification()`                                                   |
| **ThoughtStreamService**           | apps/daemon  | HTTP `:9228` endpoint for MCP `report-thought` / `report-checkpoint` tools                                       | `POST /thought`, `POST /checkpoint`                                                                            |
| **WhatsAppSendApi**                | apps/daemon  | HTTP `:9229` endpoint for MCP `whatsapp-send` tool                                                               | `POST /send`                                                                                                   |
| **WhatsAppDaemonService**          | apps/daemon  | Baileys socket, inbound message → `taskService.startTask(source='whatsapp')`                                     | `connect()`, `disconnect()`                                                                                    |
| **SchedulerService**               | apps/daemon  | Cron-driven `startTask(source='scheduler')`                                                                      | `createSchedule()`, `listSchedules()`, `deleteSchedule()`, `setEnabled()`                                      |
| **OpenAiOauthManager**             | apps/daemon  | ChatGPT OAuth flow driven through a transient `opencode serve`                                                   | `startLogin()`, `awaitCompletion()`, `status()`, `getAccessToken()`                                            |
| **SkillsManager**                  | agent-core   | Skill CRUD, filesystem scan, GitHub import                                                                       | `resync()`, `addSkill()`, `getEnabledSkills()`                                                                 |
| **MCP OAuth**                      | agent-core   | OAuth 2.0 discovery, PKCE, token lifecycle for connectors                                                        | `discoverOAuthMetadata()`, `exchangeCodeForTokens()`                                                           |
| **BrowserService**                 | agent-core   | Playwright Chromium install, dev-browser MCP server spawn                                                        | `ensureDevBrowserServer()`                                                                                     |
| **API Proxies**                    | agent-core   | Protocol translation for Azure Foundry and Moonshot                                                              | `ensureAzureFoundryProxy()`, `ensureMoonshotProxy()`                                                           |
| **Summarizer**                     | agent-core   | LLM-powered task title generation (multi-provider fallback)                                                      | `generateTaskSummary()`                                                                                        |
| **SpeechService**                  | agent-core   | ElevenLabs STT transcription                                                                                     | `transcribeAudio()`                                                                                            |
| **Database**                       | agent-core   | SQLite WAL + migrations + repositories                                                                           | `better-sqlite3` via repositories                                                                              |
| **SecureStorage**                  | agent-core   | AES-256-GCM encrypted key/value store                                                                            | `getApiKey()`, `setApiKey()`                                                                                   |
| **IPC Handlers**                   | apps/desktop | Thin proxies between renderer and daemon-client                                                                  | `ipcMain.handle('task:start'                                                                                   | 'permission:respond' | …)` |
| **DaemonClient**                   | apps/desktop | Socket transport + retry + crash-recovery respawn                                                                | `call()`, `onNotification()`, `close()`                                                                        |
| **Notification Forwarder**         | apps/desktop | Subscribes to every daemon notification channel → `webContents.send()`                                           | internal                                                                                                       |
| **Preload Bridge**                 | apps/desktop | `contextBridge.exposeInMainWorld('accomplish', ...)`                                                             | ~70 API methods exposed to renderer                                                                            |
| **Task Store**                     | apps/web     | Zustand store: single source of truth for UI state                                                               | `useTaskStore()` with ~25 actions                                                                              |

---

## Key Architectural Boundaries

```mermaid
graph LR
  subgraph TRUST["Security Trust Boundary"]
    direction TB
    A["React Renderer<br/><i>(sandboxed)</i>"]
    B["Preload<br/><i>(contextBridge)</i>"]
    C["Electron Main<br/><i>(full Node.js)</i>"]
  end

  subgraph INSTALL["Install-Boundary (single host)"]
    direction TB
    D["Electron Main<br/><i>child process group</i>"]
    E["Daemon Process<br/><i>(standalone Node.js;<br/>survives Electron exit)</i>"]
    F["opencode serve<br/><i>per-task child process</i>"]
  end

  subgraph NETWORK["Network Boundary"]
    direction TB
    G["opencode serve"]
    H["AI Provider APIs<br/><i>(HTTPS)</i>"]
  end

  A -->|"structured IPC only<br/>no node access"| B
  B -->|"ipcMain bridge"| C
  D -->|"Unix socket / named pipe<br/>JSON-RPC 2.0"| E
  E -->|"loopback HTTP + SSE<br/>127.0.0.1:random"| F
  G -->|"HTTPS + API keys<br/>(auth.json on disk)"| H

  classDef trust fill:#ffcdd2,stroke:#c62828
  classDef install fill:#fff9c4,stroke:#f57f17
  classDef network fill:#c8e6c9,stroke:#2e7d32

  class A,B,C trust
  class D,E,F install
  class G,H network
```

**Four distinct boundaries (one more than before):**

1. **Security boundary** — Renderer is sandboxed; can only call methods explicitly exposed via `contextBridge`. No `require()`, no `fs`, no direct IPC. Same as before.
2. **Electron ↔ Daemon process boundary** — The daemon is a separate OS process that survives Electron quit. Communication is exclusively Unix socket / Windows named pipe, JSON-RPC 2.0. Socket path is derived from the shared `dataDir` so both processes pick the same profile.
3. **Daemon ↔ `opencode serve` process boundary** — Each task spawns its own `opencode serve` child with a random ephemeral port on loopback. The SDK client is the sole consumer. The daemon kills the process tree on shutdown via POSIX process group or Windows `taskkill /T /F`.
4. **Network boundary** — Only `opencode serve` makes outbound HTTPS calls to AI providers. API keys are written to `auth.json` on disk (in the user-scoped OpenCode data dir) before the server starts; keys never leave the user's machine in plaintext except through the TLS connection to the provider.
