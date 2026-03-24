# Task Flow — Slide-Ready Diagrams

> Simplified versions of `task-flow-phases.md` for presentations. The detailed 8-phase diagrams remain in that file for deep reference.

Example tasks: **"Please organize my Download folder"** (diagrams 1, 3–5) · **"What are the meetings on my Google Calendar for tomorrow?"** (diagrams 2a–2c)

---

## 1. End-to-End Task Lifecycle (Single Slide)

The complete happy path in one diagram — from user prompt to completion.

```mermaid
graph LR
  A["👤 User types prompt"] --> B["React UI"]
  B -->|"IPC"| C["Electron Main"]
  C -->|"spawn PTY"| D["OpenCode CLI"]
  D -->|"API call"| E["AI Provider"]
  E -->|"plan + tool calls"| D
  D -->|"execute tools"| F["Bash / Read / Write"]

  D -->|"MCP stdio"| MCP["MCP Tool Processes<br/><i>complete-task · start-task<br/>file-permission · ask-user<br/>dev-browser</i>"]

  MCP -->|"HTTP to :9226/:9227"| C
  C -->|"IPC permission<br/>dialog"| B
  B -->|"user response<br/>via IPC"| C
  C -->|"HTTP response"| MCP
  MCP -->|"stdio resume"| D

  D -->|"complete_task<br/>via MCP stdio"| C
  C -->|"persist + notify"| B
  B --> I["✅ Task Complete"]

  classDef user fill:#e1f5fe,stroke:#0277bd
  classDef ui fill:#fce4ec,stroke:#e53935
  classDef main fill:#e8f4fd,stroke:#1e88e5
  classDef oc fill:#fff3e0,stroke:#fb8c00
  classDef ext fill:#e8f5e9,stroke:#43a047
  classDef mcp fill:#ffccbc,stroke:#e64a19

  class A user
  class B,I ui
  class C main
  class D,E oc
  class F ext
  class MCP mcp
```

---

## 2a. Phase 1 — Setup

Example: **"What are the meetings on my Google Calendar for tomorrow?"**

User prompt travels through IPC to Electron Main, which persists to SQLite and spawns a PTY with MCP tool configs (including dev-browser-mcp for browser automation).

```mermaid
sequenceDiagram
  participant User
  participant UI as React UI
  participant Main as Electron Main
  participant OC as OpenCode CLI
  participant AI as AI Provider

  User->>UI: "What are the meetings on<br/>my Google Calendar for tomorrow?"
  UI->>Main: IPC: task:start
  Main->>Main: Save to SQLite · Create TaskManager
  Main->>OC: Spawn PTY with config + prompt<br/>(includes dev-browser-mcp for browser automation)
  OC->>AI: Send prompt + system instructions
```

---

## 2b. Phase 2 — Execution

The AI plans the task, then uses the dev-browser-mcp tool (stdio) to automate a Chromium browser — navigating to Google Calendar and reading the page via ARIA accessibility snapshots. If it needs clarification, it uses the `ask_user` MCP tool (stdio → HTTP :9227).

```mermaid
sequenceDiagram
  participant AI as AI Provider
  participant OC as OpenCode CLI
  participant MCP as MCP: dev-browser-mcp<br/>(stdio → Playwright)
  participant Browser as Chromium<br/>(user session)
  participant Main as Electron Main
  participant UI as React UI
  participant User

  AI-->>OC: Response: tool_call start_task (plan + todos)
  OC-->>Main: Todos → UI sidebar

  AI-->>OC: Response: tool_call browser_navigate<br/>(url: "https://calendar.google.com")
  OC->>MCP: MCP stdio: browser_navigate
  MCP->>Browser: Playwright: page.goto(url)
  Browser-->>MCP: Page loaded (user already logged in)
  MCP-->>OC: Tool result: "Page loaded"
  OC->>AI: Next API call with tool result

  AI-->>OC: Response: tool_call browser_snapshot
  OC->>MCP: MCP stdio: browser_snapshot
  MCP->>Browser: Extract ARIA accessibility tree
  Browser-->>MCP: DOM snapshot with element refs
  MCP-->>OC: Structured text: meetings, times, [ref=eN]
  OC->>AI: Next API call with snapshot text

  Note over AI: AI parses meeting info from<br/>ARIA snapshot text

  Note over OC,Main: Need clarification?
  AI-->>OC: Response: tool_call AskUserQuestion
  OC->>Main: MCP stdio → HTTP :9227
  Main->>UI: Question dialog
  UI->>User: "Include all-day events?"
  User->>UI: "Yes"
  UI->>Main: Resolve response
  Main->>OC: Answer → resume
```

---

## 2c. Phase 3 — Completion

The AI calls `complete_task` via MCP, the CompletionEnforcer validates, and the result is persisted and shown to the user.

```mermaid
sequenceDiagram
  participant AI as AI Provider
  participant OC as OpenCode CLI
  participant Main as Electron Main
  participant UI as React UI
  participant User

  AI->>OC: complete_task(success, summary)
  OC->>Main: PTY exits
  Main->>Main: CompletionEnforcer validates
  Main->>Main: Persist status + session ID
  Main->>UI: Task complete
  UI->>User: "✅ You have 3 meetings tomorrow:<br/>9am Standup, 11am Design Review,<br/>2pm Sprint Planning"
```

---

## 3. Completion Enforcement — What Happens When Things Go Wrong

Three paths after the AI stops: happy path, missing completion, and partial completion.

```mermaid
graph TD
  START["AI stops responding<br/><i>(step_finish: 'stop')</i>"]

  START --> CHECK{"Did AI call<br/>complete_task?"}

  CHECK -->|"Yes, status=success"| TODO_CHECK{"All todos<br/>completed?"}
  CHECK -->|"No"| TOOLS_CHECK{"Did AI use<br/>any tools?"}

  TODO_CHECK -->|"Yes"| DONE["✅ DONE<br/><i>Task succeeds</i>"]
  TODO_CHECK -->|"No"| DOWNGRADE["Downgrade to partial<br/><i>Force continuation</i>"]

  TOOLS_CHECK -->|"Yes"| RETRY_CHECK{"Attempts<br/>< 10?"}
  TOOLS_CHECK -->|"No tools,<br/>no todos"| CONVERSATIONAL["Treat as conversational<br/><i>Complete normally</i>"]

  RETRY_CHECK -->|"Yes"| CONTINUE["Spawn new PTY<br/><i>Same session ID<br/>+ continuation prompt</i>"]
  RETRY_CHECK -->|"No"| MAX["⛔ MAX RETRIES<br/><i>Give up</i>"]

  DOWNGRADE --> PARTIAL_RETRY{"Attempts<br/>< 10?"}
  PARTIAL_RETRY -->|"Yes"| PARTIAL_CONTINUE["Spawn new PTY<br/><i>+ partial continuation prompt<br/>(includes remaining work)</i>"]
  PARTIAL_RETRY -->|"No"| MAX

  CONTINUE --> START
  PARTIAL_CONTINUE --> START

  classDef success fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px
  classDef fail fill:#ffcdd2,stroke:#c62828,stroke-width:2px
  classDef decision fill:#fff9c4,stroke:#f9a825
  classDef action fill:#bbdefb,stroke:#1565c0
  classDef neutral fill:#e0e0e0,stroke:#616161

  class DONE success
  class MAX fail
  class CHECK,TODO_CHECK,TOOLS_CHECK,RETRY_CHECK,PARTIAL_RETRY decision
  class CONTINUE,PARTIAL_CONTINUE,DOWNGRADE action
  class START,CONVERSATIONAL neutral
```

---

## 4. Follow-Up Message Flow

How a user continues an existing conversation — same task row, new PTY, full history loaded.

```mermaid
sequenceDiagram
  participant User
  participant UI as React UI
  participant Main as Electron Main
  participant OC as OpenCode CLI
  participant MCP as MCP: dev-browser-mcp
  participant OC_DB as OpenCode DB
  participant AI as AI Provider

  Note over User,AI: Task "tsk_001" already completed<br/>Session "sess_abc123" saved

  User->>UI: "Also show me Thursday's meetings"
  UI->>Main: IPC: session:resume<br/>(sessionId, prompt, existingTaskId)

  Main->>Main: Reuse taskId "tsk_001"<br/>Append user message to same row

  Main->>OC: Spawn new PTY<br/>--session sess_abc123

  OC->>OC_DB: Load full conversation history
  OC_DB-->>OC: All prior messages + context

  OC->>AI: [full history] + "Also show me Thursday's meetings"

  Note over AI: Has complete context<br/>from original task

  AI-->>OC: tool_call browser_navigate + browser_snapshot
  OC->>MCP: MCP stdio → Playwright → Chromium<br/>(Google Calendar → Thursday view)
  MCP-->>OC: ARIA snapshot with Thursday meetings
  OC-->>Main: Stream results → UI

  AI-->>OC: tool_call complete_task(success)
  OC-->>Main: PTY exits
  Main->>UI: Task complete (same tsk_001)
```

---

## 5. Permission Gate — The Blocking Pattern

The simplest view of how a human-in-the-loop permission works.

```mermaid
sequenceDiagram
  participant AI as AI Provider
  participant OC as OpenCode CLI
  participant MCP_FP as MCP: file-permission<br/>(stdio)
  participant HTTP as HTTP :9226
  participant Main as Electron Main
  participant UI as React UI
  participant User

  AI->>OC: request_file_permission<br/>{ operation:'create',<br/>filePath:'~/Downloads/Docs' }
  OC->>MCP_FP: MCP stdio call
  MCP_FP->>HTTP: HTTP POST /permission<br/>{ operation:'create', filePath:'~/Downloads/Docs' }

  Note over HTTP: Creates deferred promise<br/>Connection held open (up to 5 min)

  HTTP->>Main: Store pending request
  Main->>UI: IPC: permission:request<br/>{ operation:'create', filePath:'~/Downloads/Docs' }

  Note over UI: React renders structured data<br/>as human-readable dialog

  UI->>User: "Allow create ~/Downloads/Docs?"

  Note over OC: ⏳ Blocked waiting

  User->>UI: Click "Allow"
  UI->>Main: IPC: permission:respond { allow }
  Main->>HTTP: Resolve deferred promise
  HTTP-->>MCP_FP: HTTP 200 { allowed: true }
  MCP_FP-->>OC: "allowed"
  OC-->>AI: Tool result: "allowed"

  Note over AI: Resumes — proceeds to<br/>create the folder
```
