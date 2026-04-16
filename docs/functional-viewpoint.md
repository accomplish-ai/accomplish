# Functional Viewpoint — Accomplish Architecture (PTY era — HISTORICAL)

> [!WARNING]
> **This document describes the pre-SDK-cutover PTY architecture. It is retained for historical reference only.**
>
> **→ For the current architecture, read [`functional-viewpoint-sdk.md`](functional-viewpoint-sdk.md).**
>
> The OpenCode SDK cutover port (commercial PR #720, landed in OSS as PR #938) replaced `node-pty` + `StreamParser` with `@opencode-ai/sdk` + `opencode serve`. In the current runtime, `apps/daemon/src/opencode/server-manager.ts` spawns `opencode serve` per task; `packages/agent-core/src/internal/classes/OpenCodeAdapter.ts` subscribes to the SDK SSE event stream; permissions/questions go through `client.permission.reply` / `client.question.reply` (not HTTP+MCP bridges on `:9226` / `:9227`).
>
> The diagrams below still have some structural value — the participants and data they exchange (adapter, TaskManager, daemon, UI) are roughly correct, as is the ordering and causality of events. But the `PTY Process` / `StreamParser` participants and the byte-stream fan-out are stale. Use them only as a baseline for understanding how the system evolved.

> Rozanski & Woods Functional Viewpoint: identifies the system's functional elements, their responsibilities, interfaces, and primary interactions.

These diagrams are **prerequisite reading** before diving into the sequence-level flow diagrams (`task-flow-phases.md`, `completion-enforcer-flows.md`). They show _what the building blocks are_ without prescribing _when things happen_.

---

## 1. High-Level Architecture Overview

Start here. This diagram shows the four major building blocks, their single-sentence purpose, and the communication channels between them. No internal details — just the shape of the system.

```mermaid
graph TB
  USER(["👤 User"])

  subgraph ELECTRON["Accomplish Desktop App"]
    direction TB

    subgraph UI["React UI"]
      UI_DESC["Task input · Chat view · Settings<br/>Permissions · Todos · History"]
    end

    subgraph MAIN_PROC["Electron Main Process"]
      direction LR
      IPC["IPC Bridge<br/><i>~50 channels</i>"]
      CORE["Agent Core<br/><i>TaskManager · CompletionEnforcer<br/>ConfigGenerator</i>"]
      GATES["Permission Gates<br/><i>HTTP :9226 · :9227 · :9228</i>"]
    end

    subgraph STORAGE["Storage"]
      direction LR
      DB["🗄️ SQLite DB<br/><i>Tasks · messages · todos<br/>providers · skills · connectors</i>"]
      KEYS["🔐 Secure Storage<br/><i>AES-256-GCM<br/>API keys · OAuth tokens</i>"]
    end
  end

  subgraph OC["OpenCode CLI  (PTY subprocess)"]
    OC_DESC["AI agent runtime<br/><i>LLM conversations · tool execution<br/>Bash · Read · Write · Edit · Glob · Grep</i>"]
    OC_DB["🗄️ OpenCode DB<br/><i>~/.local/share/opencode/<br/>Sessions · conversation history</i>"]
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
  IPC --> CORE
  CORE -->|"spawn + stdin/stdout"| OC
  GATES <-->|"MCP tool calls (HTTP)"| OC

  OC -->|"HTTPS API calls"| AI
  OC -->|"file operations"| FS
  OC -->|"browser automation"| BROWSER
  OC -->|"remote tools"| MCP_EXT

  CORE -->|"read/write"| DB
  CORE -->|"encrypt/decrypt"| KEYS

  UI -.->|"permission dialogs"| GATES

  classDef userClass fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
  classDef electronClass fill:#f5f5f5,stroke:#424242,stroke-width:2px
  classDef uiClass fill:#fce4ec,stroke:#e53935
  classDef mainClass fill:#e8f4fd,stroke:#1e88e5
  classDef ocClass fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef extClass fill:#f3e5f5,stroke:#8e24aa
  classDef storageClass fill:#f0f4c3,stroke:#827717

  class USER userClass
  class UI,UI_DESC uiClass
  class IPC,CORE,GATES mainClass
  class OC,OC_DESC,OC_DB ocClass
  class AI,FS,BROWSER,MCP_EXT extClass
  class DB,KEYS storageClass
```

**Key takeaway:** Accomplish never calls LLMs directly. It orchestrates OpenCode (a PTY subprocess) which does all AI interaction and file operations. Accomplish's role is configuration, gating, completion enforcement, and UI.

---

## 2. Detailed Functional Component Map

The same system exploded — every internal component, its responsibility, and data/control arrows. Refer back to Diagram 1 to stay oriented.

```mermaid
graph TB
  subgraph DESKTOP["<b>apps/desktop</b> — Electron Shell"]
    direction TB
    MAIN["Electron Main Process"]
    PRELOAD["Preload Bridge<br/><i>(contextBridge)</i>"]
    HANDLERS["IPC Handlers<br/><i>(handlers.ts)</i>"]
    CALLBACKS["Task Callbacks<br/><i>(task-callbacks.ts)</i>"]
    PERM_API["Permission API Server<br/><i>:9226 file · :9227 question</i>"]
    THOUGHT_API["Thought Stream Server<br/><i>:9228</i>"]
    STORAGE_DESKTOP["Storage Wiring<br/><i>(storage.ts)</i>"]
    SECURE_STORE["Secure Storage<br/><i>(AES-256-GCM)</i>"]
    AUTH_BROWSER["Auth Browser<br/><i>(OAuth flows)</i>"]
    SKILLS_DESKTOP["Skills Manager Wiring"]
    LOG_DESKTOP["Log Collector + Writer"]
    SUMMARIZER_DESKTOP["Summarizer Wiring"]
  end

  subgraph WEB["<b>apps/web</b> — React UI"]
    direction TB
    ROUTER["Router<br/><i>Home · Execution</i>"]
    TASK_STORE["Task Store<br/><i>(Zustand)</i>"]
    SETTINGS_UI["Settings Dialog<br/><i>Provider · Skills · Connectors</i>"]
    EXEC_PAGE["Execution Page<br/><i>Messages · Todos · Permissions</i>"]
    LAUNCHER["Task Launcher<br/><i>(Cmd+K)</i>"]
  end

  subgraph CORE["<b>packages/agent-core</b> — Core Logic (ESM)"]
    direction TB
    TASK_MGR["TaskManager"]
    OC_ADAPTER["OpenCodeAdapter"]
    CE["CompletionEnforcer"]
    CONFIG_GEN["Config Generator"]
    STREAM_PARSER["Stream Parser"]
    MSG_PROC["Message Processor"]
    PERM_HANDLER["Permission Request Handler"]
    THOUGHT_HANDLER["Thought Stream Handler"]
    SKILLS_MGR["Skills Manager"]
    SPEECH_SVC["Speech Service"]
    SUMMARIZER["Summarizer"]
    PROVIDERS["Provider Registry<br/><i>15 providers</i>"]
    MCP_OAUTH["MCP OAuth Client"]
    BROWSER_SVC["Browser Service<br/><i>Playwright/Chromium</i>"]
    PROXIES["API Proxies<br/><i>Azure Foundry · Moonshot</i>"]
    ENV_BUILDER["Environment Builder"]
    LOG_WATCHER["OpenCode Log Watcher"]
    DB["SQLite Database<br/><i>WAL mode · 8 migrations</i>"]
  end

  subgraph OPENCODE["<b>OpenCode CLI</b> — External Process"]
    direction TB
    OC_SESSION["Session + Conversation"]
    OC_LLM["LLM Interaction"]
    OC_TOOLS["Built-in Tools<br/><i>Bash · Read · Write · Edit · Glob · Grep</i>"]
    OC_MCP["MCP Client"]
  end

  %% UI → Desktop IPC
  ROUTER --> PRELOAD
  TASK_STORE --> PRELOAD
  SETTINGS_UI --> PRELOAD
  LAUNCHER --> PRELOAD
  PRELOAD -->|"ipcRenderer.invoke"| HANDLERS

  %% Desktop → Core
  HANDLERS -->|"startTask / cancelTask"| TASK_MGR
  HANDLERS --> STORAGE_DESKTOP
  HANDLERS --> SECURE_STORE
  HANDLERS --> SKILLS_DESKTOP
  CALLBACKS -->|"onMessage / onComplete"| TASK_STORE

  %% Core internal
  TASK_MGR -->|"creates per task"| OC_ADAPTER
  OC_ADAPTER -->|"spawns PTY"| OPENCODE
  OC_ADAPTER --> CE
  OC_ADAPTER --> STREAM_PARSER
  OC_ADAPTER --> MSG_PROC
  OC_ADAPTER --> CONFIG_GEN
  OC_ADAPTER --> ENV_BUILDER
  CONFIG_GEN --> SKILLS_MGR
  CONFIG_GEN --> MCP_OAUTH
  CE -->|"onStartContinuation"| OC_ADAPTER
  PERM_HANDLER <-->|"HTTP"| PERM_API
  THOUGHT_HANDLER <-->|"HTTP"| THOUGHT_API

  %% OpenCode ↔ MCP servers
  OC_MCP -->|"complete_task"| PERM_API
  OC_MCP -->|"start_task"| PERM_API
  OC_MCP -->|"ask_user_question"| PERM_API
  OC_MCP -->|"request_file_permission"| PERM_API
  OC_MCP -->|"report_thought"| THOUGHT_API
  OC_MCP -->|"dev-browser"| BROWSER_SVC

  %% OpenCode → External
  OC_LLM -->|"API calls"| PROVIDERS
  OC_TOOLS -->|"reads/writes"| FS["Local File System"]

  %% Styling
  classDef desktop fill:#e8f4fd,stroke:#1e88e5,stroke-width:2px
  classDef web fill:#fce4ec,stroke:#e53935,stroke-width:2px
  classDef core fill:#e8f5e9,stroke:#43a047,stroke-width:2px
  classDef opencode fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef external fill:#f3e5f5,stroke:#8e24aa,stroke-width:1px

  class MAIN,PRELOAD,HANDLERS,CALLBACKS,PERM_API,THOUGHT_API,STORAGE_DESKTOP,SECURE_STORE,AUTH_BROWSER,SKILLS_DESKTOP,LOG_DESKTOP,SUMMARIZER_DESKTOP desktop
  class ROUTER,TASK_STORE,SETTINGS_UI,EXEC_PAGE,LAUNCHER web
  class TASK_MGR,OC_ADAPTER,CE,CONFIG_GEN,STREAM_PARSER,MSG_PROC,PERM_HANDLER,THOUGHT_HANDLER,SKILLS_MGR,SPEECH_SVC,SUMMARIZER,PROVIDERS,MCP_OAUTH,BROWSER_SVC,PROXIES,ENV_BUILDER,LOG_WATCHER,DB core
  class OC_SESSION,OC_LLM,OC_TOOLS,OC_MCP opencode
  class FS external
```

---

## 3. Agent-Core Functional Decomposition

A focused view of `packages/agent-core` — the heart of the system — showing every class, its single responsibility, and the dependency arrows.

```mermaid
graph LR
  subgraph ORCHESTRATION["Orchestration Layer"]
    TM["<b>TaskManager</b><br/>Task lifecycle<br/>Queue management<br/>Event wiring"]
    OCA["<b>OpenCodeAdapter</b><br/>PTY lifecycle<br/>Tool call interception<br/>Message routing"]
  end

  subgraph COMPLETION["Completion Control"]
    CE["<b>CompletionEnforcer</b><br/>State machine<br/>Continuation logic<br/>Todo validation"]
    CS["<b>CompletionState</b><br/>State enum + transitions<br/>Attempt counting"]
    PR["<b>Prompts</b><br/>Continuation prompt text<br/>Partial continuation text"]
  end

  subgraph CONFIG["Configuration"]
    CG["<b>ConfigGenerator</b><br/>opencode.json generation<br/>System prompt assembly<br/>MCP server registration"]
    CB["<b>ConfigBuilder</b><br/>Provider-specific config<br/>Model mapping"]
    ENV["<b>Environment</b><br/>API key → env vars<br/>Credential mapping"]
    TC["<b>ToolClassification</b><br/>NON_TASK_CONTINUATION_TOOLS<br/>Tool categorization"]
  end

  subgraph PARSING["Stream Processing"]
    SP["<b>StreamParser</b><br/>PTY output parsing<br/>JSON event extraction"]
    MP["<b>MessageProcessor</b><br/>Raw → TaskMessage<br/>Content formatting"]
    LW["<b>LogWatcher</b><br/>OpenCode log file tailing<br/>Event extraction"]
  end

  subgraph GATING["Human-in-the-Loop Gating"]
    PRH["<b>PermissionRequestHandler</b><br/>Deferred promise pattern<br/>Timeout management<br/>Request validation"]
    TSH["<b>ThoughtStreamHandler</b><br/>Active task tracking<br/>Event validation"]
  end

  subgraph SERVICES["Services"]
    SKM["<b>SkillsManager</b><br/>Scan · sync · CRUD<br/>Official + custom + community"]
    SPE["<b>SpeechService</b><br/>ElevenLabs STT API<br/>Audio transcription"]
    SUM["<b>Summarizer</b><br/>LLM-powered task titles<br/>Multi-provider fallback"]
    MCO["<b>MCP OAuth</b><br/>Discovery · PKCE · token refresh<br/>Dynamic client registration"]
    BRO["<b>BrowserService</b><br/>Playwright Chromium management<br/>Dev-browser MCP server"]
    PXY["<b>API Proxies</b><br/>Azure Foundry proxy<br/>Moonshot proxy"]
  end

  subgraph STORAGE["Storage Layer"]
    DB["<b>Database</b><br/>SQLite + WAL<br/>Migration runner"]
    SS["<b>SecureStorage</b><br/>AES-256-GCM encryption<br/>API key vault"]
    R1["Repo: taskHistory"]
    R2["Repo: providerSettings"]
    R3["Repo: appSettings"]
    R4["Repo: skills"]
    R5["Repo: connectors"]
  end

  %% Dependencies
  TM --> OCA
  OCA --> CE
  OCA --> SP
  OCA --> MP
  OCA --> CG
  OCA --> ENV
  CE --> CS
  CE --> PR
  CG --> CB
  CG --> TC
  CG --> SKM
  CG --> MCO
  SKM --> R4
  DB --> R1
  DB --> R2
  DB --> R3
  DB --> R4
  DB --> R5
  SPE --> SS
  SUM -.->|"direct LLM calls"| EXTERNAL["AI Provider APIs"]

  classDef orch fill:#bbdefb,stroke:#1565c0
  classDef comp fill:#c8e6c9,stroke:#2e7d32
  classDef conf fill:#fff9c4,stroke:#f9a825
  classDef parse fill:#d1c4e9,stroke:#5e35b1
  classDef gate fill:#ffccbc,stroke:#e64a19
  classDef svc fill:#b2dfdb,stroke:#00695c
  classDef store fill:#f0f4c3,stroke:#827717

  class TM,OCA orch
  class CE,CS,PR comp
  class CG,CB,ENV,TC conf
  class SP,MP,LW parse
  class PRH,TSH gate
  class SKM,SPE,SUM,MCO,BRO,PXY svc
  class DB,SS,R1,R2,R3,R4,R5 store
```

---

## 4. IPC & Communication Channel Map

Shows every communication mechanism in the system — IPC channels, HTTP ports, PTY streams, and event buses.

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
    TASK_CB["Task Callbacks<br/><i>12 event listeners</i>"]
    HTTP_PERM["HTTP :9226<br/><i>File permissions</i>"]
    HTTP_Q["HTTP :9227<br/><i>User questions</i>"]
    HTTP_T["HTTP :9228<br/><i>Thought stream</i>"]
  end

  subgraph AGENT_CORE["Agent Core"]
    TM["TaskManager"]
    ADAPTER["OpenCodeAdapter"]
    PRH["PermissionRequestHandler"]
  end

  subgraph PTY_PROC["PTY Subprocess"]
    OC["OpenCode CLI"]
    MCP_C["MCP Client"]
  end

  %% Invoke (request/response)
  UI -->|"ipcRenderer.invoke(channel, ...args)"| CB
  CB -->|"ipcMain.handle(channel)"| IPC_H
  IPC_H -->|"return value"| CB
  CB -->|"Promise resolve"| UI

  %% Push events (main → renderer)
  TASK_CB -->|"webContents.send('task:update')"| CB
  TASK_CB -->|"webContents.send('task:update:batch')"| CB
  TASK_CB -->|"webContents.send('permission:request')"| CB
  TASK_CB -->|"webContents.send('task:progress')"| CB
  TASK_CB -->|"webContents.send('todo:update')"| CB
  TASK_CB -->|"webContents.send('task:summary')"| CB
  TASK_CB -->|"webContents.send('task:status-change')"| CB
  CB -->|"ipcRenderer.on()"| STORE

  %% Main ↔ Core
  IPC_H -->|"JS function calls"| TM
  TM -->|"EventEmitter callbacks"| TASK_CB

  %% Core ↔ PTY
  ADAPTER -->|"pty.write()"| OC
  OC -->|"pty.onData()"| ADAPTER

  %% MCP HTTP
  MCP_C -->|"HTTP POST /request"| HTTP_PERM
  MCP_C -->|"HTTP POST /request"| HTTP_Q
  MCP_C -->|"HTTP POST /thought"| HTTP_T
  HTTP_PERM -->|"deferred Promise"| PRH
  HTTP_Q -->|"deferred Promise"| PRH

  %% Styling
  classDef renderer fill:#fce4ec,stroke:#e53935
  classDef bridge fill:#e0e0e0,stroke:#616161
  classDef main fill:#e8f4fd,stroke:#1e88e5
  classDef core fill:#e8f5e9,stroke:#43a047
  classDef pty fill:#fff3e0,stroke:#fb8c00

  class UI,STORE renderer
  class CB bridge
  class IPC_H,TASK_CB,HTTP_PERM,HTTP_Q,HTTP_T main
  class TM,ADAPTER,PRH core
  class OC,MCP_C pty
```

---

## 5. MCP Tool Registration & Routing

Shows which MCP tools are registered, what they do, and how calls route from OpenCode through HTTP servers back into the application.

```mermaid
graph LR
  OC["OpenCode CLI<br/><i>MCP Client</i>"]

  subgraph MCP_SERVERS["MCP Servers (registered in opencode.json)"]
    direction TB
    CT["<b>complete-task</b><br/><i>:9226/complete-task</i><br/>Signal task completion<br/>with status + summary"]
    ST["<b>start-task</b><br/><i>:9226/start-task</i><br/>Create todo plan<br/>Mark requires-completion"]
    FP["<b>file-permission</b><br/><i>:9226/request</i><br/>Request file access<br/>from user"]
    AQ["<b>ask-user-question</b><br/><i>:9227/request</i><br/>Ask user for input<br/>with options"]
    DB["<b>dev-browser-mcp</b><br/><i>:9222</i><br/>Playwright browser<br/>control"]
  end

  subgraph INTERCEPT["OpenCodeAdapter Interception<br/><i>(handleToolCall)</i>"]
    direction TB
    I_CT["complete_task → CompletionEnforcer"]
    I_ST["start_task → create todos, mark requires-completion"]
    I_TW["todowrite → update CE todos"]
  end

  subgraph GATING["Human-in-the-Loop"]
    PERM_DIALOG["Permission Dialog<br/><i>(React UI)</i>"]
    Q_DIALOG["Question Dialog<br/><i>(React UI)</i>"]
  end

  OC -->|"tool_use"| CT
  OC -->|"tool_use"| ST
  OC -->|"tool_use"| FP
  OC -->|"tool_use"| AQ
  OC -->|"tool_use"| DB

  %% Adapter intercepts via PTY stream
  OC -.->|"PTY stream<br/>tool call events"| INTERCEPT

  FP -->|"HTTP stays open"| PERM_DIALOG
  AQ -->|"HTTP stays open"| Q_DIALOG
  PERM_DIALOG -->|"allow/deny"| FP
  Q_DIALOG -->|"response"| AQ

  classDef mcp fill:#fff3e0,stroke:#fb8c00
  classDef intercept fill:#e8f5e9,stroke:#43a047
  classDef gate fill:#fce4ec,stroke:#e53935

  class CT,ST,FP,AQ,DB mcp
  class I_CT,I_ST,I_TW intercept
  class PERM_DIALOG,Q_DIALOG gate
```

---

## 6. Provider & Configuration Pipeline

How provider settings flow from the UI through configuration generation to OpenCode spawning.

```mermaid
graph TB
  subgraph UI["Settings UI"]
    PROVIDER_GRID["Provider Grid<br/><i>15 provider cards</i>"]
    API_KEY_INPUT["API Key Input"]
    MODEL_SELECT["Model Selector"]
  end

  subgraph STORAGE["Storage Layer"]
    PROVIDER_SETTINGS["provider_settings table<br/><i>active provider · connected providers · selected models</i>"]
    SECURE["SecureStorage<br/><i>AES-256-GCM encrypted keys</i>"]
  end

  subgraph CONFIG_PIPELINE["Config Generation Pipeline<br/><i>(per task spawn)</i>"]
    ENV_BUILD["Environment Builder<br/><i>API keys → env vars</i>"]
    CONFIG_GEN["Config Generator<br/><i>→ opencode.json</i>"]
    CONFIG_BUILD["Config Builder<br/><i>Provider-specific model config</i>"]
    SKILL_INJECT["Skill Injection<br/><i>Enabled skills → system prompt</i>"]
    CONN_INJECT["Connector Injection<br/><i>Enabled connectors → MCP servers</i>"]
  end

  subgraph SPAWN["PTY Spawn"]
    PTY["node-pty<br/><i>OPENCODE_CONFIG=opencode.json</i>"]
    ENV_VARS["Process Environment<br/><i>ANTHROPIC_API_KEY, etc.</i>"]
  end

  subgraph PROXIES["Optional Proxies"]
    AZ_PROXY["Azure Foundry Proxy<br/><i>localhost:random</i>"]
    MOON_PROXY["Moonshot Proxy<br/><i>localhost:random</i>"]
  end

  %% Flow
  PROVIDER_GRID --> API_KEY_INPUT
  API_KEY_INPUT -->|"IPC: settings:add-api-key"| SECURE
  MODEL_SELECT -->|"IPC: model:set"| PROVIDER_SETTINGS

  PROVIDER_SETTINGS --> CONFIG_BUILD
  SECURE --> ENV_BUILD
  CONFIG_BUILD --> CONFIG_GEN
  SKILL_INJECT --> CONFIG_GEN
  CONN_INJECT --> CONFIG_GEN
  ENV_BUILD --> ENV_VARS
  CONFIG_GEN -->|"writes file"| PTY
  ENV_VARS --> PTY

  CONFIG_BUILD -.->|"if Azure Foundry"| AZ_PROXY
  CONFIG_BUILD -.->|"if Moonshot"| MOON_PROXY
  AZ_PROXY -.-> PTY
  MOON_PROXY -.-> PTY

  classDef ui fill:#fce4ec,stroke:#e53935
  classDef storage fill:#f0f4c3,stroke:#827717
  classDef config fill:#fff9c4,stroke:#f9a825
  classDef spawn fill:#fff3e0,stroke:#fb8c00
  classDef proxy fill:#e0e0e0,stroke:#616161

  class PROVIDER_GRID,API_KEY_INPUT,MODEL_SELECT ui
  class PROVIDER_SETTINGS,SECURE storage
  class ENV_BUILD,CONFIG_GEN,CONFIG_BUILD,SKILL_INJECT,CONN_INJECT config
  class PTY,ENV_VARS spawn
  class AZ_PROXY,MOON_PROXY proxy
```

---

## 7. Skills & Connectors Functional Model

How skills and MCP connectors are managed, stored, and injected into the agent's system prompt.

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
    TOKEN["exchangeCodeForTokens()<br/><i>Authorization code → tokens</i>"]
    REFRESH["refreshAccessToken()<br/><i>Token renewal</i>"]
  end

  subgraph DB["SQLite Storage"]
    SKILLS_TBL["skills table<br/><i>id · name · command · source · enabled · filePath</i>"]
    CONN_TBL["connectors table<br/><i>id · name · url · enabled · auth status · tokens</i>"]
  end

  subgraph INJECTION["Injection into Agent"]
    SYS_PROMPT["System Prompt<br/><i>Enabled skill content appended</i>"]
    MCP_CONF["MCP Server Config<br/><i>Enabled connectors → opencode.json</i>"]
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

## Component Responsibility Matrix

| Component                    | Package    | Responsibility                                                      | Key Interfaces                                                               |
| ---------------------------- | ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **TaskManager**              | agent-core | Task queue, lifecycle, event wiring (12 listeners)                  | `startTask()`, `cancelTask()`, EventEmitter callbacks                        |
| **OpenCodeAdapter**          | agent-core | PTY spawn/kill, tool call interception, message routing             | `spawn()`, `handleToolCall()`, `spawnSessionResumption()`                    |
| **CompletionEnforcer**       | agent-core | State machine ensuring task completion via retries                  | `handleCompleteTaskDetection()`, `handleStepFinish()`, `handleProcessExit()` |
| **ConfigGenerator**          | agent-core | Generates `opencode.json` with prompt, MCP servers, provider config | `generateConfig()` → JSON file                                               |
| **StreamParser**             | agent-core | Parses raw PTY bytes into structured events                         | `parse(data)` → events                                                       |
| **MessageProcessor**         | agent-core | Converts raw events into `TaskMessage` objects                      | `process(event)` → `TaskMessage`                                             |
| **PermissionRequestHandler** | agent-core | Deferred promise pattern for human-in-the-loop gating               | `createPermissionRequest()` → `{ requestId, promise }`                       |
| **ThoughtStreamHandler**     | agent-core | Validates thought/checkpoint events from MCP tools                  | `validateThoughtEvent()`, `validateCheckpointEvent()`                        |
| **SkillsManager**            | agent-core | Skill CRUD, filesystem scan, GitHub import                          | `resync()`, `addSkill()`, `getEnabledSkills()`                               |
| **SpeechService**            | agent-core | ElevenLabs STT transcription                                        | `transcribeAudio()` → text                                                   |
| **Summarizer**               | agent-core | LLM-powered task title generation (multi-provider fallback)         | `generateTaskSummary()` → 3-5 word title                                     |
| **MCP OAuth**                | agent-core | OAuth 2.0 discovery, PKCE, token lifecycle for connectors           | `discoverOAuthMetadata()`, `exchangeCodeForTokens()`                         |
| **BrowserService**           | agent-core | Playwright Chromium install, dev-browser MCP server spawn           | `ensureDevBrowserServer()`                                                   |
| **API Proxies**              | agent-core | Protocol translation for Azure Foundry and Moonshot                 | `ensureAzureFoundryProxy()`, `ensureMoonshotProxy()`                         |
| **Database**                 | agent-core | SQLite with WAL mode, 8 migrations, 5 repositories                  | `better-sqlite3` via repositories                                            |
| **SecureStorage**            | agent-core | AES-256-GCM encrypted key/value store                               | `getApiKey()`, `setApiKey()`                                                 |
| **IPC Handlers**             | desktop    | ~50 `ipcMain.handle()` calls bridging UI to core                    | `task:start`, `session:resume`, `permission:respond`, etc.                   |
| **Task Callbacks**           | desktop    | 12 event listeners translating core events to IPC pushes            | `onMessage`, `onComplete`, `onToolCallComplete`, etc.                        |
| **Permission API**           | desktop    | HTTP servers on :9226/:9227 bridging MCP to Electron UI             | `startPermissionApiServer()`, `startQuestionApiServer()`                     |
| **Preload Bridge**           | desktop    | `contextBridge.exposeInMainWorld('accomplish', ...)`                | ~70 API methods exposed to renderer                                          |
| **Task Store**               | web        | Zustand store: single source of truth for UI state                  | `useTaskStore()` with ~25 actions                                            |
| **Router**                   | web        | Hash router: `/` (Home) and `/execution/:id`                        | `createHashRouter()`                                                         |

---

## Key Architectural Boundaries

```mermaid
graph LR
  subgraph TRUST_BOUNDARY["Security Trust Boundary"]
    direction TB
    A["React Renderer<br/><i>(sandboxed)</i>"]
    B["Preload<br/><i>(contextBridge)</i>"]
    C["Electron Main<br/><i>(full Node.js)</i>"]
  end

  subgraph PROCESS_BOUNDARY["Process Boundary"]
    direction TB
    D["Electron Main<br/><i>(Node.js)</i>"]
    E["OpenCode PTY<br/><i>(child process)</i>"]
  end

  subgraph NETWORK_BOUNDARY["Network Boundary"]
    direction TB
    F["OpenCode CLI"]
    G["AI Provider APIs<br/><i>(HTTPS)</i>"]
  end

  A -->|"structured IPC only<br/>no node access"| B
  B -->|"ipcMain bridge"| C
  D -->|"PTY stdin/stdout"| E
  F -->|"HTTPS + API keys<br/>in env vars"| G

  classDef trust fill:#ffcdd2,stroke:#c62828
  classDef process fill:#fff9c4,stroke:#f57f17
  classDef network fill:#c8e6c9,stroke:#2e7d32

  class A,B,C trust
  class D,E process
  class F,G network
```

**Three distinct boundaries:**

1. **Security boundary** — Renderer is sandboxed; can only call methods explicitly exposed via `contextBridge`. No `require()`, no `fs`, no direct IPC.
2. **Process boundary** — OpenCode runs as a separate PTY subprocess. Communication is limited to stdin/stdout text streams + HTTP (MCP).
3. **Network boundary** — Only OpenCode makes outbound HTTPS calls to AI providers. API keys are injected as environment variables, never sent via IPC or stored in the renderer.
