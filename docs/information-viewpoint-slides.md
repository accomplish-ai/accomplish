# Information Viewpoint — Slide-Ready Diagrams

> Simplified versions of the diagrams in `information-viewpoint.md`, designed for presentation slides.
> For full detail, refer to the complete document.

---

## 1. Where Data Lives

```mermaid
graph TB
  subgraph APP["Accomplish Desktop"]
    direction TB
    subgraph PERSIST["Persisted to Disk"]
      DB["🗄️ <b>SQLite DB</b><br/><i>Tasks · Messages · Todos<br/>Providers · Skills · Connectors<br/>App Settings</i>"]
      SEC["🔐 <b>Secure Storage</b><br/><i>API Keys · OAuth Tokens<br/>AES-256-GCM encrypted</i>"]
      SKILLS_FS["📁 <b>Skills Directory</b><br/><i>SKILL.md files<br/>(official + custom)</i>"]
    end

    subgraph EPHEMERAL["In-Memory Only"]
      CE["⚙️ <b>Completion State</b><br/><i>Flow state · retry count<br/>Lost on crash</i>"]
      PERM["⏳ <b>Permission Promises</b><br/><i>Deferred HTTP responses<br/>5 min timeout</i>"]
      UI_STATE["🖥️ <b>React Store</b><br/><i>Zustand — rebuilt<br/>from IPC on restart</i>"]
    end
  end

  subgraph EXTERNAL["External"]
    OC_SESS["📝 <b>OpenCode Data</b><br/><i>~/.local/share/opencode/<br/>Sessions · messages · own DB</i>"]
    CONFIG["📄 <b>opencode.json</b><br/><i>Generated per task<br/>System prompt + MCP config</i>"]
  end

  DB -.->|"source of truth"| UI_STATE
  CE -.->|"drives"| PERM

  classDef persist fill:#dbeafe,stroke:#2563eb,stroke-width:2px
  classDef ephemeral fill:#fef3c7,stroke:#d97706,stroke-width:2px
  classDef ext fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px

  class DB,SEC,SKILLS_FS persist
  class CE,PERM,UI_STATE ephemeral
  class OC_SESS,CONFIG ext
```

---

## 2. Database Schema (Simplified)

```mermaid
erDiagram
    app_settings {
        TEXT theme "system | light | dark"
        TEXT selected_model "JSON"
        TEXT ollama_config "JSON"
    }

    providers {
        TEXT provider_id PK "15 types"
        TEXT connection_status "connected | disconnected"
        TEXT selected_model_id
    }

    tasks {
        TEXT id PK
        TEXT prompt
        TEXT status "8 possible states"
        TEXT session_id "links to OpenCode"
    }

    task_messages {
        TEXT id PK
        TEXT task_id FK
        TEXT type "assistant | user | tool | system"
        TEXT content
    }

    task_todos {
        TEXT task_id FK
        TEXT content
        TEXT status "pending | in_progress | completed"
    }

    skills {
        TEXT id PK
        TEXT name
        TEXT source "official | community | custom"
        INTEGER is_enabled
    }

    connectors {
        TEXT id PK
        TEXT name
        TEXT url
        TEXT status "connected | disconnected | error"
    }

    tasks ||--o{ task_messages : "has"
    tasks ||--o{ task_todos : "has"
```

---

## 3. Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued : User submits task

    queued --> running : PTY spawned

    running --> completed : ✅ Success
    running --> failed : ❌ Error
    running --> cancelled : 🚫 User cancels
    running --> interrupted : ⏸️ User interrupts

    interrupted --> running : User sends follow-up

    running --> running : 🔄 Permission request\n(dialog shown → resolved)
```

---

## 4. Completion Enforcer State Machine

```mermaid
graph LR
  START(( )) --> IDLE

  IDLE -->|"complete_task(success)<br/>+ all todos done"| DONE
  IDLE -->|"complete_task(partial)<br/>OR success w/ incomplete todos"| PARTIAL["PARTIAL<br/>CONTINUATION<br/>PENDING"]
  IDLE -->|"Agent stopped<br/>without complete_task"| CONT["CONTINUATION<br/>PENDING"]
  IDLE -->|"complete_task(blocked)"| BLOCKED

  PARTIAL -->|"Retry with<br/>continuation prompt"| IDLE
  CONT -->|"Retry with<br/>reminder prompt"| IDLE

  PARTIAL -->|"10 attempts"| MAX["MAX RETRIES<br/>REACHED"]
  CONT -->|"10 attempts"| MAX

  DONE --> END1(( ))
  BLOCKED --> END2(( ))
  MAX --> END3(( ))

  classDef terminal fill:#e0e0e0,stroke:#757575,stroke-width:1px
  classDef done fill:#c8e6c9,stroke:#2e7d32
  classDef blocked fill:#ffcdd2,stroke:#c62828
  classDef pending fill:#fff9c4,stroke:#f9a825
  classDef idle fill:#bbdefb,stroke:#1565c0

  class START,END1,END2,END3 terminal
  class IDLE idle
  class DONE done
  class BLOCKED,MAX blocked
  class PARTIAL,CONT pending
```

---

## 5. Data Flow — Task Execution

```mermaid
graph LR
  USER["👤 User"] -->|"prompt"| UI["React UI"]
  UI -->|"IPC"| MAIN["Electron Main"]
  MAIN -->|"save"| DB[(SQLite)]
  MAIN -->|"spawn PTY"| OC["OpenCode"]

  OC -->|"messages\n(PTY stream)"| MAIN
  OC -->|"permissions\n(HTTP :9226)"| MAIN
  MAIN -->|"IPC events\n(50ms batch)"| UI

  OC -->|"tool calls"| FS["💾 Files"]
  OC -->|"prompts"| AI["☁️ AI Provider"]

  MAIN -->|"save messages"| DB

  classDef user fill:#e1f5fe,stroke:#0277bd
  classDef ui fill:#fce4ec,stroke:#e53935
  classDef main fill:#e8f4fd,stroke:#1e88e5
  classDef ext fill:#f3e5f5,stroke:#8e24aa
  classDef db fill:#f0f4c3,stroke:#827717

  class USER user
  class UI ui
  class MAIN main
  class OC,FS,AI ext
  class DB db
```

---

## 6. Permission Gate Flow

```mermaid
graph LR
  OC["OpenCode"] -->|"HTTP POST"| MCP["MCP Server\n(:9226 / :9227)"]
  MCP -->|"deferred\npromise"| WAIT["⏳ Waiting..."]
  MCP -->|"IPC event"| UI["React UI"]
  UI -->|"shows dialog"| USER["👤 User"]
  USER -->|"allow / deny"| UI
  UI -->|"IPC response"| MCP
  MCP -->|"HTTP 200"| OC

  style WAIT fill:#fef3c7,stroke:#d97706
```

---

## 7. Key Numbers

| Metric                       | Value                   |
| ---------------------------- | ----------------------- |
| **SQLite tables**            | 10 (+ schema_meta)      |
| **Task statuses**            | 8 (pending → cancelled) |
| **Completion states**        | 6 (IDLE → MAX_RETRIES)  |
| **AI providers**             | 15                      |
| **IPC channels**             | ~50                     |
| **Max continuation retries** | 10                      |
| **Permission timeout**       | 5 minutes               |
| **Message batch delay**      | 50ms                    |
| **Encryption**               | AES-256-GCM             |
| **DB mode**                  | WAL (concurrent reads)  |
