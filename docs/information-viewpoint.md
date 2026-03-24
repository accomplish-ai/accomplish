# Information Viewpoint — Rozanski & Woods

This document captures all stateful data, information models, state machines, and data flows within the Accomplish system. It follows the Rozanski & Woods Information Viewpoint to document data ownership, lifecycle, and structure.

---

## 1. Database Entity-Relationship Diagram

SQLite database (WAL mode, foreign keys enabled). Current schema version: 9.

```mermaid
erDiagram
    schema_meta {
        TEXT key PK
        TEXT value
    }

    app_settings {
        INTEGER id PK "CHECK id=1 (singleton)"
        INTEGER debug_mode "0|1"
        INTEGER onboarding_complete "0|1"
        TEXT selected_model "JSON: SelectedModel"
        TEXT ollama_config "JSON"
        TEXT litellm_config "JSON"
        TEXT azure_foundry_config "JSON"
        TEXT lmstudio_config "JSON"
        TEXT openai_base_url
        TEXT theme "'system'|'light'|'dark'"
    }

    provider_meta {
        INTEGER id PK "CHECK id=1 (singleton)"
        TEXT active_provider_id
        INTEGER debug_mode "0|1"
    }

    providers {
        TEXT provider_id PK "15 provider types"
        TEXT connection_status "'connected'|'disconnected'"
        TEXT selected_model_id
        TEXT credentials_type
        TEXT credentials_data "JSON"
        TEXT last_connected_at "ISO 8601"
        TEXT available_models "JSON array"
    }

    tasks {
        TEXT id PK "UUID"
        TEXT prompt
        TEXT summary
        TEXT status "TaskStatus enum"
        TEXT session_id
        TEXT created_at "ISO 8601"
        TEXT started_at "ISO 8601"
        TEXT completed_at "ISO 8601"
    }

    task_messages {
        TEXT id PK "UUID"
        TEXT task_id FK
        TEXT type "'assistant'|'user'|'tool'|'system'"
        TEXT content
        TEXT tool_name
        TEXT tool_input "JSON"
        TEXT timestamp "ISO 8601"
        INTEGER sort_order
    }

    task_attachments {
        INTEGER id PK "AUTO"
        TEXT message_id FK
        TEXT type "'screenshot'|'json'"
        TEXT data "base64 or JSON"
        TEXT label
    }

    task_todos {
        INTEGER id PK "AUTO"
        TEXT task_id FK
        TEXT todo_id "UNIQUE with task_id"
        TEXT content
        TEXT status "'pending'|'in_progress'|'completed'|'cancelled'"
        TEXT priority "'high'|'medium'|'low'"
        INTEGER sort_order
    }

    task_favorites {
        TEXT task_id PK
        TEXT prompt "denormalized"
        TEXT summary "denormalized"
        TEXT favorited_at "ISO 8601"
    }

    skills {
        TEXT id PK
        TEXT name
        TEXT command
        TEXT description
        TEXT source "'official'|'community'|'custom'"
        INTEGER is_enabled "0|1"
        INTEGER is_verified "0|1"
        INTEGER is_hidden "0|1"
        TEXT file_path
        TEXT github_url
        TEXT updated_at "ISO 8601"
    }

    connectors {
        TEXT id PK
        TEXT name
        TEXT url
        TEXT status "'connected'|'disconnected'|'error'|'connecting'"
        INTEGER is_enabled "0|1"
        TEXT oauth_metadata_json "JSON"
        TEXT client_registration_json "JSON"
        TEXT last_connected_at "ISO 8601"
        TEXT created_at "ISO 8601"
        TEXT updated_at "ISO 8601"
    }

    tasks ||--o{ task_messages : "has many"
    tasks ||--o{ task_todos : "has many"
    task_messages ||--o{ task_attachments : "has many"
    tasks ||--o| task_favorites : "optionally favorited"
```

---

## 2. Secure Storage Model

AES-256-GCM encrypted file-based storage, separate from SQLite.

**File locations (macOS):**

- SQLite DB: `~/Library/Application Support/Accomplish/accomplish.db` (prod) / `accomplish-dev.db` (dev)
- Secure Storage: `~/Library/Application Support/Accomplish/secure-storage.json`
- Logs: `~/Library/Application Support/Accomplish/logs/`
- Skills: `~/Library/Application Support/Accomplish/skills/`
- OpenCode configs: `~/Library/Application Support/Accomplish/opencode/`

SQLite is opened with WAL mode (`journal_mode = WAL`), so it can be safely read by external tools while the app is running.

```mermaid
flowchart TB
    subgraph SecureStorage["Secure Storage (secure-storage.json)"]
        direction TB
        KDF["Key Derivation<br/>PBKDF2(platform:homedir:username:appId)<br/>salt=32 bytes, iter=100k, SHA-256"]
        ENC["Per-Value Encryption<br/>AES-256-GCM<br/>IV=12 bytes, AuthTag=128 bits"]
        KDF --> ENC
    end

    subgraph StoredKeys["Stored Encrypted Values"]
        direction TB
        K1["apiKey:anthropic"]
        K2["apiKey:openai"]
        K3["apiKey:google"]
        K4["apiKey:xai"]
        K5["apiKey:deepseek"]
        K6["apiKey:openrouter"]
        K7["apiKey:...  (15 providers)"]
        K8["bedrock (JSON credentials)"]
        K9["connector-tokens:{id} (OAuth)"]
    end

    SecureStorage --> StoredKeys

    subgraph FileFormat["On-Disk Format per Value"]
        direction LR
        F1["base64(IV)"]
        F2["base64(AuthTag)"]
        F3["base64(Ciphertext)"]
        F1 --- F2 --- F3
    end

    StoredKeys --> FileFormat

    style SecureStorage fill:#f9f0ff,stroke:#7c3aed
    style StoredKeys fill:#fefce8,stroke:#ca8a04
    style FileFormat fill:#f0fdf4,stroke:#16a34a
```

---

## 3. Task Status State Machine

All transitions for the `TaskStatus` type as observed in `TaskManager`, `handlers.ts`, and `task-callbacks.ts`.

```mermaid
stateDiagram-v2
    [*] --> pending : Task created

    pending --> queued : startTask() called
    queued --> running : OpenCode PTY spawned

    running --> waiting_permission : Permission request raised
    waiting_permission --> running : User responds allow/deny

    running --> completed : TaskResult.status = success
    running --> failed : TaskResult.status = error
    running --> cancelled : User cancels (SIGINT)
    running --> interrupted : TaskResult.status = interrupted

    interrupted --> running : sendFollowUp() resumes session

    completed --> [*]
    failed --> [*]
    cancelled --> [*]

    note right of waiting_permission
        Deferred promise pattern:
        HTTP server holds connection open
        until UI responds via IPC
    end note

    note right of interrupted
        Session ID preserved
        for resumption via
        spawnSessionResumption()
    end note
```

---

## 4. CompletionEnforcer State Machine

The internal `CompletionFlowState` enum governing task completion enforcement and automatic continuation retries.

```mermaid
stateDiagram-v2
    [*] --> IDLE : Initial / reset()

    IDLE --> DONE : complete_task(status=success)
    IDLE --> PARTIAL_CONTINUATION_PENDING : complete_task(status=partial)
    IDLE --> BLOCKED : complete_task(status=blocked/other)
    IDLE --> CONTINUATION_PENDING : scheduleContinuation()<br/>attempts ≤ 10

    CONTINUATION_PENDING --> IDLE : startContinuation()<br/>new PTY session spawned
    CONTINUATION_PENDING --> MAX_RETRIES_REACHED : attempts > maxContinuationAttempts

    PARTIAL_CONTINUATION_PENDING --> IDLE : startPartialContinuation()<br/>attempts ≤ 10
    PARTIAL_CONTINUATION_PENDING --> MAX_RETRIES_REACHED : attempts > maxContinuationAttempts

    DONE --> [*]
    BLOCKED --> [*]
    MAX_RETRIES_REACHED --> [*]

    note right of IDLE
        Counter: continuationAttempts
        Default max: 10
        Reset clears counter + args
    end note

    note left of PARTIAL_CONTINUATION_PENDING
        Triggered when AI calls
        complete_task with 'partial'
        OR when success has
        incomplete todos (downgrade)
    end note

    note right of CONTINUATION_PENDING
        Triggered when process exits
        without calling complete_task
        and real tool work was done
    end note
```

---

## 5. Provider Connection State Machine

```mermaid
stateDiagram-v2
    [*] --> disconnected : Provider registered

    disconnected --> connecting : setConnectedProvider()
    connecting --> connected : Credentials validated
    connecting --> error : Validation failed

    connected --> disconnected : removeConnectedProvider()
    connected --> error : Runtime error

    error --> connecting : Retry connection
    error --> disconnected : User removes provider

    note right of connected
        Stores: credentials_data (JSON),
        selected_model_id,
        available_models (JSON array),
        last_connected_at
    end note
```

---

## 6. Connector (MCP Server) State Machine

```mermaid
stateDiagram-v2
    [*] --> disconnected : Connector created

    disconnected --> connecting : User enables + connects
    connecting --> connected : OAuth flow complete
    connecting --> error : OAuth/network failure

    connected --> disconnected : User disables
    connected --> error : Token expired / server down

    error --> connecting : Retry
    error --> disconnected : User disables

    note right of connected
        Stores: oauth_metadata_json,
        client_registration_json,
        connector-tokens:{id}
        (encrypted in SecureStorage)
    end note
```

---

## 7. Todo Item State Machine

```mermaid
stateDiagram-v2
    [*] --> pending : AI creates via start_task / todowrite

    pending --> in_progress : AI begins work on item
    in_progress --> completed : AI marks done
    in_progress --> cancelled : AI abandons item
    pending --> cancelled : AI skips item

    completed --> [*]
    cancelled --> [*]

    note right of completed
        CompletionEnforcer checks:
        if any todos not completed/cancelled
        when complete_task(success) called,
        status is downgraded to 'partial'
    end note
```

---

## 8. OpenCode Message Type Flow

The sequence of message types emitted by OpenCode CLI through the PTY, as parsed by `OpenCodeAdapter`.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> step_start : New inference step

    step_start --> text : Assistant generates text
    step_start --> tool_call : Assistant invokes tool

    text --> text : Streaming tokens
    text --> tool_call : Tool invocation begins
    text --> step_finish : Turn ends

    tool_call --> tool_use : Tool execution starts
    tool_use --> tool_result : Tool returns output
    tool_result --> text : Continue generation
    tool_result --> tool_call : Chain another tool
    tool_result --> step_finish : Turn ends

    step_finish --> step_start : Next step begins
    step_finish --> [*] : Process exits

    state step_finish {
        reason: stop | end_turn | tool_use | error
    }
```

---

## 9. Permission Request Lifecycle

```mermaid
sequenceDiagram
    participant OC as OpenCode CLI
    participant MCP as MCP Server<br/>(port 9226/9227)
    participant Main as Electron Main
    participant UI as React UI

    OC->>MCP: HTTP POST /request<br/>{type, filePath, question...}
    MCP->>MCP: createPermissionRequest()<br/>deferred promise created
    MCP->>Main: IPC: permission:request
    Main->>UI: onPermissionRequest(request)
    UI->>UI: Show PermissionDialog

    alt User allows
        UI->>Main: permission:respond<br/>{decision: 'allow'}
        Main->>MCP: resolvePermission(requestId, response)
        MCP->>OC: HTTP 200 {approved: true}
    else User denies
        UI->>Main: permission:respond<br/>{decision: 'deny'}
        Main->>MCP: resolvePermission(requestId, response)
        MCP->>OC: HTTP 200 {approved: false}
    else Timeout (5 min)
        MCP->>OC: HTTP 408 Timeout
    end

    Note over MCP: HTTP connection held open<br/>until promise resolved<br/>PERMISSION_REQUEST_TIMEOUT_MS = 300000
```

---

## 10. React State Architecture (Zustand Store)

```mermaid
flowchart TB
    subgraph ElectronMain["Electron Main Process"]
        TM[TaskManager]
        OCA[OpenCodeAdapter]
        PM[Permission API<br/>ports 9226/9227]
        DB[(SQLite DB)]
        SS[(SecureStorage)]
    end

    subgraph IPC["IPC Bridge (contextBridge)"]
        direction TB
        I1["onTaskUpdate"]
        I2["onTaskUpdateBatch"]
        I3["onTaskProgress"]
        I4["onPermissionRequest"]
        I5["onTaskStatusChange"]
        I6["onTodoUpdate"]
        I7["onTaskSummary"]
        I8["onAuthError"]
        I9["onDebugLog"]
    end

    subgraph ReactApp["React Application"]
        subgraph ZustandStore["useTaskStore (Zustand)"]
            direction TB
            S1["currentTask: Task | null"]
            S2["tasks: Task[]"]
            S3["permissionRequest: PermissionRequest | null"]
            S4["todos: TodoItem[]"]
            S5["favorites: StoredFavorite[]"]
            S6["setupProgress: string | null"]
            S7["startupStage: StartupStageInfo | null"]
            S8["isLauncherOpen: boolean"]
            S9["authError: {providerId, message} | null"]
        end

        subgraph LocalState["Component Local State"]
            direction TB
            L1["Execution: followUp, currentTool,<br/>debugLogs, elapsedTime, attachments"]
            L2["Home: prompt, showAllFavorites,<br/>attachments, showSettingsDialog"]
            L3["TaskLauncher: searchQuery,<br/>selectedIndex, filteredTasks"]
            L4["PermissionDialog: selectedOptions,<br/>customResponse"]
        end

        subgraph Hooks["Custom Hooks"]
            H1["useTheme: preference, isDark"]
            H2["useSpeechInput: isRecording,<br/>isTranscribing, duration, error"]
            H3["useTypingPlaceholder: text,<br/>charCount, completed"]
        end
    end

    TM -->|events| IPC
    OCA -->|events| IPC
    PM -->|events| IPC
    IPC -->|listeners at module load| ZustandStore
    ZustandStore --> LocalState
    ZustandStore --> Hooks

    style ElectronMain fill:#fef3c7,stroke:#d97706
    style ZustandStore fill:#dbeafe,stroke:#2563eb
    style LocalState fill:#f0fdf4,stroke:#16a34a
    style Hooks fill:#fdf2f8,stroke:#db2777
```

---

## 11. Data Ownership Map

Which process/layer owns which data, and the persistence mechanism.

```mermaid
flowchart LR
    subgraph Persistent["Persistent Storage"]
        direction TB
        DB[(SQLite DB<br/>accomplish.db)]
        SS[(SecureStorage<br/>secure-storage.json)]
        OCS[(OpenCode Data<br/>~/.local/share/opencode/)]
    end

    subgraph AgentCore["agent-core (owns DB schema)"]
        direction TB
        AC1["TaskManager<br/>→ tasks, messages, todos"]
        AC2["StorageAPI<br/>→ app_settings, providers,<br/>skills, connectors, favorites"]
        AC3["SecureStorage<br/>→ API keys, OAuth tokens"]
        AC4["CompletionState<br/>→ flow state, attempts<br/>(in-memory only)"]
    end

    subgraph ElectronMain2["Electron Main (orchestrator)"]
        direction TB
        EM1["handlers.ts<br/>→ IPC routing, task lifecycle"]
        EM2["permission-api.ts<br/>→ deferred promises<br/>(in-memory only)"]
    end

    subgraph ReactUI["React UI (ephemeral)"]
        direction TB
        RU1["Zustand Store<br/>→ task mirror, UI state"]
        RU2["Component State<br/>→ form inputs, animations"]
    end

    subgraph OpenCode["OpenCode CLI (external)"]
        direction TB
        OC1["Session History<br/>→ full conversation context"]
        OC2["Config JSON<br/>→ generated per-task"]
    end

    AC1 --> DB
    AC2 --> DB
    AC3 --> SS
    OC1 --> OCS
    EM1 -.->|reads/writes via| AC2
    RU1 -.->|IPC mirror of| AC1

    style Persistent fill:#fef9c3,stroke:#a16207
    style AgentCore fill:#dbeafe,stroke:#2563eb
    style ElectronMain2 fill:#fce7f3,stroke:#be185d
    style ReactUI fill:#f0fdf4,stroke:#16a34a
    style OpenCode fill:#f3e8ff,stroke:#7c3aed
```

---

## 12. Task Data Lifecycle

End-to-end journey of a task's data from creation through persistence.

```mermaid
sequenceDiagram
    participant UI as React UI
    participant IPC as Electron IPC
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant DB as SQLite
    participant PTY as OpenCode PTY

    UI->>IPC: task:start {prompt, taskId, files}
    IPC->>TM: startTask(config)
    TM->>OCA: new OpenCodeAdapter()
    TM->>IPC: emit task:progress(starting)
    IPC->>DB: saveTask({id, prompt, status:'queued'})

    OCA->>PTY: Spawn PTY process
    TM->>IPC: emit task:progress(loading)

    PTY->>OCA: step_start message
    OCA->>TM: emit message(assistant)
    TM->>IPC: emit task:update(message)
    TM-->>IPC: queueMessage() → 50ms batch
    IPC->>DB: addTaskMessage()

    PTY->>OCA: tool_call: start_task
    OCA->>CE: Initialize todos tracking
    OCA->>TM: emit todos(items)

    PTY->>OCA: tool_call: complete_task(success)
    OCA->>CE: handleCompleteTaskDetection()

    alt All todos completed
        CE->>CE: state → DONE
    else Incomplete todos exist
        CE->>CE: Downgrade → PARTIAL_CONTINUATION_PENDING
        OCA->>PTY: spawnSessionResumption()
        Note over PTY: New PTY, same sessionId
    end

    OCA->>TM: emit complete(result)
    TM->>IPC: emit task:update(complete)
    IPC->>DB: updateTaskStatus(completed)
    IPC->>DB: clearTodosForTask()
    IPC->>DB: updateTaskSessionId()
```

---

## 13. Startup Stage Progression

The stages emitted during task startup, before the AI agent begins work.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> starting : TaskManager.executeTask()
    starting --> browser : Browser binary check
    browser --> environment : Config + MCP servers
    environment --> loading : PTY spawned
    loading --> connecting : OpenCode initializing
    connecting --> waiting : Model connected
    waiting --> [*] : First step_start received

    note right of starting
        TaskManager emits 'starting'
        before creating adapter
    end note

    note right of environment
        TaskManager emits 'environment'
        after adapter created
    end note

    note right of loading
        OpenCodeAdapter emits 'loading'
        when PTY process spawned
    end note
```

---

## 14. Task Update Event Types

The `TaskUpdateEvent` discriminated union flowing through IPC.

```mermaid
flowchart TB
    subgraph TaskUpdateEvent["TaskUpdateEvent"]
        direction TB
        TUE["taskId: string"]
    end

    TaskUpdateEvent --> MSG["type: 'message'<br/>message: TaskMessage"]
    TaskUpdateEvent --> PRG["type: 'progress'<br/>progress: TaskProgress"]
    TaskUpdateEvent --> CMP["type: 'complete'<br/>result: TaskResult"]
    TaskUpdateEvent --> ERR["type: 'error'<br/>error: string"]

    MSG --> MT1["message.type: 'assistant'"]
    MSG --> MT2["message.type: 'user'"]
    MSG --> MT3["message.type: 'tool'"]
    MSG --> MT4["message.type: 'system'"]

    CMP --> RS1["result.status: 'success'"]
    CMP --> RS2["result.status: 'error'"]
    CMP --> RS3["result.status: 'interrupted'"]

    style TaskUpdateEvent fill:#dbeafe,stroke:#2563eb
    style MSG fill:#f0fdf4,stroke:#16a34a
    style PRG fill:#fef3c7,stroke:#d97706
    style CMP fill:#fdf2f8,stroke:#db2777
    style ERR fill:#fef2f2,stroke:#dc2626
```

---

## 15. Thought Stream Data Model

Real-time subagent observation data flowing through port 9228.

```mermaid
flowchart TB
    subgraph ThoughtStream["Thought Stream (port 9228)"]
        direction TB
        TE["ThoughtEvent"]
        CE2["CheckpointEvent"]
    end

    TE --> TC1["category: 'observation'"]
    TE --> TC2["category: 'reasoning'"]
    TE --> TC3["category: 'decision'"]
    TE --> TC4["category: 'action'"]

    CE2 --> CS1["status: 'progress'"]
    CE2 --> CS2["status: 'complete'"]
    CE2 --> CS3["status: 'stuck'<br/>+ blocker field"]

    subgraph Fields["Common Fields"]
        F1["taskId: string"]
        F2["agentName: string"]
        F3["timestamp: number"]
    end

    ThoughtStream --- Fields

    style ThoughtStream fill:#f3e8ff,stroke:#7c3aed
    style Fields fill:#f9fafb,stroke:#6b7280
```

---

## 16. Complete Type Enum Reference

All enumerated types consolidated with their domain and cardinality.

```mermaid
flowchart TB
    subgraph TaskDomain["Task Domain"]
        TS["TaskStatus<br/>8 values:<br/>pending | queued | running |<br/>waiting_permission | completed |<br/>failed | cancelled | interrupted"]
        TR["TaskResult.status<br/>3 values:<br/>success | error | interrupted"]
        TM2["TaskMessage.type<br/>4 values:<br/>assistant | user | tool | system"]
        TA["TaskAttachment.type<br/>2 values:<br/>screenshot | json"]
        FA["FileAttachmentInfo.type<br/>5 values:<br/>image | text | code | pdf | other"]
    end

    subgraph CompletionDomain["Completion Domain"]
        CFS["CompletionFlowState<br/>6 values:<br/>IDLE | BLOCKED |<br/>PARTIAL_CONTINUATION_PENDING |<br/>CONTINUATION_PENDING |<br/>MAX_RETRIES_REACHED | DONE"]
        SFA["StepFinishAction<br/>3 values:<br/>continue | pending | complete"]
        CTS["CompleteTask.status<br/>3 values:<br/>success | partial | blocked"]
    end

    subgraph ProgressDomain["Progress Domain"]
        SS["StartupStage<br/>6 values:<br/>starting | browser | environment |<br/>loading | connecting | waiting"]
        PS["TaskProgress.stage<br/>12 values:<br/>init | thinking | tool-use |<br/>waiting | complete | setup |<br/>+ 6 StartupStages"]
        TUE2["TaskUpdateEvent.type<br/>4 values:<br/>message | progress | complete | error"]
    end

    subgraph PermissionDomain["Permission Domain"]
        PT["PermissionRequest.type<br/>3 values:<br/>tool | question | file"]
        PD["PermissionResponse.decision<br/>2 values:<br/>allow | deny"]
        FO["FileOperation<br/>6 values:<br/>create | delete | rename |<br/>move | modify | overwrite"]
    end

    subgraph TodoDomain["Todo Domain"]
        TDS["TodoItem.status<br/>4 values:<br/>pending | in_progress |<br/>completed | cancelled"]
        TDP["TodoItem.priority<br/>3 values:<br/>high | medium | low"]
    end

    subgraph ProviderDomain["Provider Domain"]
        PID["ProviderId<br/>15 values:<br/>anthropic | openai | google | xai |<br/>deepseek | moonshot | zai | bedrock |<br/>azure-foundry | ollama | openrouter |<br/>litellm | minimax | lmstudio | vertex"]
        PC["ProviderCategory<br/>7 values:<br/>classic | aws | gcp | azure |<br/>local | proxy | hybrid"]
        CS2["ConnectionStatus<br/>4 values:<br/>disconnected | connecting |<br/>connected | error"]
        TSS["ToolSupportStatus<br/>3 values:<br/>supported | unsupported | unknown"]
    end

    subgraph InfraDomain["Infrastructure"]
        CSS["ConnectorStatus<br/>4 values:<br/>connected | disconnected |<br/>error | connecting"]
        SKS["SkillSource<br/>3 values:<br/>official | community | custom"]
        TH["ThemePreference<br/>3 values:<br/>system | light | dark"]
        LL["LogLevel<br/>4 values:<br/>DEBUG | INFO | WARN | ERROR"]
        LS["LogSource<br/>6 values:<br/>main | mcp | browser |<br/>opencode | env | ipc"]
    end

    style TaskDomain fill:#dbeafe,stroke:#2563eb
    style CompletionDomain fill:#fef3c7,stroke:#d97706
    style ProgressDomain fill:#f0fdf4,stroke:#16a34a
    style PermissionDomain fill:#fdf2f8,stroke:#db2777
    style TodoDomain fill:#fef9c3,stroke:#a16207
    style ProviderDomain fill:#f3e8ff,stroke:#7c3aed
    style InfraDomain fill:#f9fafb,stroke:#6b7280
```

---

## 17. In-Memory vs. Persisted State Summary

| State                            | Owner                        | Persistence                  | Notes                                                   |
| -------------------------------- | ---------------------------- | ---------------------------- | ------------------------------------------------------- |
| `CompletionFlowState`            | CompletionState (agent-core) | **In-memory only**           | Reset per task execution; lost on crash                 |
| `continuationAttempts`           | CompletionState (agent-core) | **In-memory only**           | Counter up to 10                                        |
| `completeTaskArgs`               | CompletionState (agent-core) | **In-memory only**           | Last complete_task call arguments                       |
| Deferred permission promises     | permission-api.ts (Electron) | **In-memory only**           | Pending HTTP responses; timeout 5 min                   |
| Zustand store                    | React UI                     | **In-memory only**           | Rebuilt from IPC events on app restart                  |
| `hasCompleted`, `wasInterrupted` | OpenCodeAdapter (agent-core) | **In-memory only**           | Per-adapter instance flags                              |
| Task status, messages, todos     | TaskManager → SQLite         | **SQLite**                   | Survives restart                                        |
| Provider credentials             | SecureStorage                | **Encrypted file**           | AES-256-GCM                                             |
| OAuth tokens                     | SecureStorage                | **Encrypted file**           | Per-connector                                           |
| App settings, theme              | SQLite singleton row         | **SQLite**                   | Singleton (id=1)                                        |
| OpenCode conversation history    | OpenCode CLI                 | **~/.local/share/opencode/** | SQLite DB + session/message storage; enables resumption |
| Generated OpenCode config        | config-generator.ts          | **Temp file**                | Regenerated per task                                    |
| Skills (markdown files)          | Skills table + file system   | **SQLite + disk**            | Dual storage                                            |
| Theme preference                 | SQLite + localStorage        | **Both**                     | Synced across layers                                    |

---

## Key Architectural Decisions

1. **SQLite with WAL mode** — Enables concurrent reads during writes; critical for IPC-heavy architecture where UI reads while tasks write.
2. **Singleton settings rows** — `app_settings` and `provider_meta` use `CHECK id=1` constraint to prevent accidental multi-row configs.
3. **JSON-in-TEXT columns** — Provider credentials, model configs, and OAuth metadata stored as serialized JSON in TEXT columns. Trade-off: no SQL querying into JSON, but simpler schema evolution.
4. **Denormalized favorites** — `task_favorites` copies `prompt` and `summary` from `tasks` to allow independent display without JOIN. Trade-off: potential staleness vs. query simplicity.
5. **In-memory completion state** — `CompletionFlowState` deliberately not persisted. If the app crashes mid-task, the task is marked failed rather than attempting to reconstruct continuation state.
6. **Machine-derived encryption key** — SecureStorage uses PBKDF2 with machine-specific inputs (platform, homedir, username). Not as secure as OS keychain but avoids macOS permission prompts. Suitable for rotatable API keys.
7. **Ephemeral React state** — Zustand store is purely derived from IPC events. On restart, task history is reloaded from SQLite, but in-flight execution state (currentTool, startupStage, etc.) is lost.

---

## 18. userData Directory Reference

Location: `~/Library/Application Support/Accomplish/` (macOS)

All files and folders found in this directory at runtime:

### Accomplish Application Data

| Path                    | Owner               | Description                                                                                                                                                                         |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accomplish.db`         | agent-core (SQLite) | Main database — tasks, messages, todos, providers, settings, skills, connectors. All application state.                                                                             |
| `accomplish.db-wal`     | SQLite engine       | Write-Ahead Log — buffered writes not yet checkpointed to main DB. Auto-managed.                                                                                                    |
| `accomplish.db-shm`     | SQLite engine       | Shared memory index for WAL. Enables concurrent readers. Auto-managed.                                                                                                              |
| `accomplish-dev.db`     | agent-core (SQLite) | Development-mode database (used when running `pnpm dev`). Same schema as prod.                                                                                                      |
| `accomplish-dev.db-wal` | SQLite engine       | WAL for dev database.                                                                                                                                                               |
| `accomplish-dev.db-shm` | SQLite engine       | Shared memory for dev database.                                                                                                                                                     |
| `opencode/`             | config-generator.ts | Contains `opencode.json` — generated OpenCode CLI config (system prompt, MCP servers, provider settings). Regenerated before each task. Single file shared across concurrent tasks. |
| `skills/`               | SkillsManager       | Skill markdown files (official, community, custom). Each skill is a `.md` with frontmatter.                                                                                         |
| `logs/`                 | log-file-writer.ts  | Application log files written by Electron main process.                                                                                                                             |
| `dev-browser/`          | dev-browser-mcp     | Playwright browser profile data (cookies, localStorage) for the bundled Chromium used in browser automation tasks.                                                                  |

### Chromium / Electron Auto-Created

These are standard Chromium storage directories created automatically by Electron. Not managed by Accomplish code.

| Path                                                  | Owner           | Description                                                                                      |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `Cache/`                                              | Chromium        | HTTP cache for the renderer process (the Accomplish UI webview).                                 |
| `Code Cache/`                                         | Chromium        | Compiled/cached JavaScript bytecode for faster UI startup.                                       |
| `Cookies`                                             | Chromium        | Cookie database for the Electron renderer (Accomplish UI, not the automation browser).           |
| `Cookies-journal`                                     | Chromium        | SQLite journal for Cookies DB.                                                                   |
| `GPUCache/`                                           | Chromium        | Cached GPU shader compilations.                                                                  |
| `DawnGraphiteCache/`                                  | Chromium (Dawn) | WebGPU shader cache (Dawn graphics backend).                                                     |
| `DawnWebGPUCache/`                                    | Chromium (Dawn) | WebGPU pipeline cache.                                                                           |
| `DIPS`, `DIPS-shm`, `DIPS-wal`                        | Chromium        | Bounce Tracking Mitigations database (Detection of Indirect Proxy for Stateful bounce tracking). |
| `IndexedDB/`                                          | Chromium        | Browser IndexedDB storage for the Accomplish UI renderer.                                        |
| `Local Storage/`                                      | Chromium        | `localStorage` for the Accomplish React app (theme preference synced here).                      |
| `Session Storage/`                                    | Chromium        | `sessionStorage` for the Accomplish React app.                                                   |
| `Network Persistent State`                            | Chromium        | Network stack state (HSTS, transport security policies).                                         |
| `Preferences`                                         | Chromium        | Electron/Chromium browser preferences JSON.                                                      |
| `Shared Dictionary/`                                  | Chromium        | Shared Brotli/Zstandard compression dictionaries.                                                |
| `SharedStorage/`                                      | Chromium        | Shared Storage API data.                                                                         |
| `WebStorage/`                                         | Chromium        | Additional web storage data.                                                                     |
| `Trust Tokens`, `Trust Tokens-journal`                | Chromium        | Privacy Pass / Trust Token storage.                                                              |
| `TransportSecurity`                                   | Chromium        | HSTS and certificate pin state.                                                                  |
| `blob_storage/`                                       | Chromium        | Binary large object storage for the renderer.                                                    |
| `Crashpad/`                                           | Chromium        | Crash dump reports (minidumps). Useful for debugging Electron crashes.                           |
| `SingletonCookie`, `SingletonLock`, `SingletonSocket` | Chromium        | Electron single-instance lock files. Prevent multiple app instances from running simultaneously. |

### What to inspect when debugging

| Scenario                           | Look at                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Task not completing / wrong status | `accomplish.db` → `tasks` table (status, session_id)                              |
| Messages missing or corrupt        | `accomplish.db` → `task_messages` table (sort_order, content)                     |
| Provider connection issues         | `accomplish.db` → `providers` table (connection_status, credentials_type)         |
| API key not working                | `secure-storage.json` (encrypted — verify key exists, can't read value)           |
| OpenCode config wrong              | `opencode/opencode.json` (inspect generated system prompt, MCP servers)           |
| Browser automation state           | `dev-browser/` (Playwright profile with cookies/sessions from automated browsing) |
| App crashes                        | `Crashpad/` minidumps + `logs/` directory                                         |
| App won't start (locked)           | Delete `SingletonLock` file if stale from a crash                                 |
