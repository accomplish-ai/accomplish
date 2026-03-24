# Accomplish Task Flow — Phase-by-Phase Sequence Diagrams

> Example: User types **"Please organize my Download folder"**, then follows up with **"Leave the pictures as is"**

---

## Phase 1: User Submits Prompt

The user types a prompt in the React UI. It travels through the preload bridge to the Electron main process, which validates it, persists to SQLite, and initializes the TaskManager + OpenCodeAdapter.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI<br/>(Zustand Store)
    participant Preload as Preload<br/>(contextBridge)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PermAPI as Permission API<br/>(HTTP Server)

    User->>React: Types "Please organize<br/>my Download folder"
    React->>React: set({ isLoading: true })
    React->>Preload: accomplish.startTask({ prompt })
    Preload->>IPC: ipcRenderer.invoke('task:start', config)

    Note over IPC: assertTrustedWindow()<br/>validateTaskConfig()

    IPC->>IPC: hasReadyProvider() check
    IPC->>IPC: createTaskId() → "tsk_001"

    Note over IPC, PermAPI: First task? Initialize permission servers

    IPC->>PermAPI: startPermissionApiServer() → port 9226
    IPC->>PermAPI: startQuestionApiServer() → port 9227

    IPC->>SQLite: storage.saveTask({ id, prompt, status:'running' })<br/>INSERT tasks + INSERT task_messages (user msg, sort_order=0)

    IPC->>TM: taskManager.startTask(taskId, config, callbacks)

    Note over TM: createTaskCallbacks() wires:<br/>onBatchedMessages → renderer + SQLite<br/>onComplete → status update<br/>onTodoUpdate → renderer + SQLite

    TM->>OCA: new OpenCodeAdapter(options, taskId)
    Note over OCA: Creates StreamParser<br/>Creates CompletionEnforcer<br/>Wires event listeners (12)

    IPC-->>Preload: return { id: 'tsk_001', status: 'running' }
    Preload-->>React: task object
    React->>React: set({ currentTask: task })
```

---

## Phase 2: PTY Spawns OpenCode CLI

The OpenCodeAdapter builds CLI arguments and environment, then spawns a PTY child process running the OpenCode CLI. The CLI loads its config and sends the prompt to the AI provider.

```mermaid
sequenceDiagram
    autonumber
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PTY as PTY Process<br/>(node-pty)
    participant CLI as OpenCode CLI
    participant AI as AI Provider<br/>(Claude/GPT/etc)
    participant React as React UI<br/>(Zustand Store)

    TM->>OCA: adapter.startTask(config)
    OCA->>OCA: buildCliArgs(config)<br/>→ ["run","--format","json",<br/>"--model","anthropic/claude-sonnet",<br/>"--agent","accomplish",<br/>"Please organize..."]
    OCA->>OCA: buildEnvironment(taskId)<br/>→ env with OPENCODE_CONFIG path
    OCA->>PTY: pty.spawn('/bin/zsh', ['-c', 'opencode run ...'])
    OCA->>React: emit('progress', { stage:'loading' })

    PTY->>CLI: Process starts
    CLI->>CLI: Load opencode.json config<br/>(system prompt, MCP servers, provider config)
    CLI->>AI: Send prompt with system instructions

    Note over AI: AI reads the prompt<br/>and decides on a plan...
```

---

## Phase 3: AI Responds — start_task (Planning)

The AI's first response is a `start_task` tool call declaring its plan. The StreamParser extracts JSON from the PTY byte stream, the adapter processes the tool call, and todo items appear in the UI.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process<br/>(node-pty)
    participant OCA as OpenCodeAdapter
    participant SP as StreamParser
    participant CE as CompletionEnforcer
    participant React as React UI<br/>(Zustand Store)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB

    AI-->>CLI: tool_call: start_task({<br/>needs_planning: true,<br/>goal: "Organize Downloads by type",<br/>steps: ["List files","Create folders","Move files"]<br/>})
    CLI-->>PTY: JSON on stdout
    PTY-->>OCA: onData(raw bytes)
    OCA->>OCA: Strip ANSI codes
    OCA->>SP: streamParser.feed(cleanData)
    SP->>SP: findJsonEnd()<br/>brace depth counting<br/>Parse complete JSON object
    SP-->>OCA: emit('message',<br/>{ type:'tool_call', tool:'start_task' })
    OCA->>OCA: handleToolCall('start_task', input)

    Note over OCA, CE: start_task processing

    OCA->>CE: markTaskRequiresCompletion()
    OCA->>React: emit('message', synthetic plan text)<br/>"Goal: Organize Downloads..."
    OCA->>CE: updateTodos([<br/>{content:"List files", status:"in_progress"},<br/>{content:"Create folders", status:"pending"},<br/>{content:"Move files", status:"pending"}<br/>])
    OCA->>React: emit('todo:update', todos)

    Note over React, SQLite: 50ms batch window

    React->>React: Display plan message + todo sidebar
    IPC->>SQLite: addTaskMessage(type='assistant', sort_order=1)
    IPC->>SQLite: saveTodosForTask(taskId, todos)
```

---

## Phase 4: AI Executes Tools (e.g. Bash)

The AI calls tools like `Bash` to list files. Results flow back through the same StreamParser pipeline and are persisted incrementally.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process<br/>(node-pty)
    participant OCA as OpenCodeAdapter
    participant SP as StreamParser
    participant CE as CompletionEnforcer
    participant React as React UI<br/>(Zustand Store)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB

    AI-->>CLI: tool_call: Bash({ command: "ls ~/Downloads" })
    CLI->>CLI: Execute command locally
    CLI-->>PTY: tool_use JSON<br/>(status:'completed',<br/>output: "file1.pdf photo.jpg ...")
    PTY-->>OCA: onData → feed to StreamParser
    SP-->>OCA: emit('message',<br/>{ type:'tool_use', tool:'Bash' })
    OCA->>OCA: handleToolCall('Bash', input)
    OCA->>CE: markToolsUsed(true)

    Note over OCA: toTaskMessage() converts to<br/>type='tool', toolName='Bash'

    OCA->>React: emit via batched messages
    IPC->>SQLite: addTaskMessage(<br/>type='tool', tool_name='Bash', sort_order=2)
```

---

## Phase 5: File Permission Request (User Blocked)

When the AI wants to create/modify files, the MCP `file-permission` tool sends an HTTP request to the Permission API. The request **blocks** until the user clicks Allow/Deny in the UI.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant MCP_FP as MCP: file-permission
    participant PermAPI as Permission API<br/>(port 9226)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant React as React UI<br/>(Zustand Store)
    participant Preload as Preload<br/>(contextBridge)
    participant User

    AI-->>CLI: tool_call: request_file_permission(<br/>{ operation:'create',<br/>filePath:'~/Downloads/Documents' })
    CLI->>MCP_FP: MCP stdio call
    MCP_FP->>PermAPI: HTTP POST localhost:9226/permission<br/>{ operation:'create',<br/>filePath:'~/Downloads/Documents' }

    Note over PermAPI: Creates deferred promise<br/>HTTP connection stays OPEN

    PermAPI->>IPC: mainWindow.webContents.send(<br/>'permission:request', req)
    IPC->>React: Permission popup appears

    Note over MCP_FP, PermAPI: BLOCKED — waiting for user decision

    User->>React: Clicks "Allow"
    React->>Preload: accomplish.respondToPermission(<br/>{ decision:'allow' })
    Preload->>IPC: ipcRenderer.invoke(<br/>'permission:respond', response)
    IPC->>PermAPI: resolvePermission(requestId, true)

    Note over PermAPI: Deferred promise resolves!

    PermAPI-->>MCP_FP: HTTP 200 { allowed: true }
    MCP_FP-->>CLI: "allowed"
    CLI-->>AI: Tool result: "allowed"

    Note over AI: AI now proceeds to<br/>create the folder...
```

---

## Phase 6: AI Creates Folders & Moves Files (Loop)

The AI iterates: requesting permissions, creating folders, moving files. Each tool result is streamed back, parsed, and persisted. Todos are updated as steps complete.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process<br/>(node-pty)
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant React as React UI<br/>(Zustand Store)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB

    loop For each folder creation + file move
        AI-->>CLI: request_file_permission → Bash/Write
        CLI-->>PTY: tool_use results (JSON)
        PTY-->>OCA: StreamParser → handleMessage
        OCA->>React: batched messages
        IPC->>SQLite: addTaskMessage(sort_order=N)
    end

    Note over AI: All files moved.<br/>AI updates the todo list.

    AI-->>CLI: tool_call: todowrite({ todos: [<br/>{content:"List files", status:"completed"},<br/>{content:"Create folders", status:"completed"},<br/>{content:"Move files", status:"completed"}<br/>] })
    CLI-->>PTY: JSON
    PTY-->>OCA: StreamParser
    OCA->>CE: updateTodos(all completed)
    OCA->>React: emit('todo:update', updated todos)
    IPC->>SQLite: saveTodosForTask(taskId, todos)
```

---

## Phase 7: Task Completion

The AI calls `complete_task`, the CompletionEnforcer validates all todos are done, the CLI exits, and the main process persists the final status + session ID for future follow-ups.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant MCP_CT as MCP: complete-task
    participant PTY as PTY Process<br/>(node-pty)
    participant OCA as OpenCodeAdapter
    participant SP as StreamParser
    participant CE as CompletionEnforcer
    participant TM as TaskManager
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB
    participant React as React UI<br/>(Zustand Store)

    AI-->>CLI: tool_call: complete_task({<br/>status:'success',<br/>summary:'Organized 47 files into 4 folders'<br/>})
    CLI->>MCP_CT: MCP stdio call
    MCP_CT-->>CLI: "Task completed successfully."
    CLI-->>PTY: tool_call JSON
    PTY-->>OCA: onData → StreamParser
    SP-->>OCA: emit('message', tool_call)
    OCA->>OCA: handleToolCall('complete_task', input)
    OCA->>CE: handleCompleteTaskDetection(input)

    Note over CE: Check: hasIncompleteTodos()?<br/>All complete → status stays 'success'<br/>State → DONE

    OCA->>React: emit('message', summary text)
    IPC->>SQLite: addTaskMessage(type='assistant',<br/>content='Organized 47 files...', sort_order=N)

    AI-->>CLI: step_finish { reason:'stop' }
    CLI-->>PTY: JSON
    PTY-->>OCA: onData → StreamParser
    SP-->>OCA: emit('message', step_finish)
    OCA->>CE: handleStepFinish('stop')
    CE-->>OCA: return 'complete' (state is DONE)

    Note over CLI: CLI process exits with code 0

    PTY-->>OCA: onExit({ exitCode: 0 })
    OCA->>CE: handleProcessExit(0)
    CE->>OCA: callbacks.onComplete()
    OCA->>OCA: emit('complete', {<br/>status:'success',<br/>sessionId:'sess_abc123'<br/>})

    Note over TM: Flush message batcher<br/>Clean up adapter and task

    TM->>IPC: callbacks.onComplete(result)
    IPC->>React: forwardToRenderer('task:update',<br/>{ type:'complete', result })
    IPC->>SQLite: UPDATE tasks SET status='completed',<br/>session_id='sess_abc123'
    IPC->>SQLite: clearTodosForTask(taskId)

    React->>React: currentTask.status = 'completed'<br/>currentTask.sessionId = 'sess_abc123'<br/>Show follow-up input box

    Note over IPC, SQLite: Async: generateTaskSummary()
    IPC->>SQLite: UPDATE tasks SET<br/>summary='Organized Downloads folder'
```

---

## Phase 8: Follow-Up — "Leave the pictures as is"

The user sends a follow-up. The UI extracts the session ID from the completed task, a new PTY is spawned with `--session` flag, and the OpenCode CLI reloads the full conversation history so the AI has complete context.

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant React as React UI<br/>(Zustand Store)
    participant Preload as Preload<br/>(contextBridge)
    participant IPC as Electron Main<br/>(IPC Handlers)
    participant SQLite as SQLite DB
    participant TM as TaskManager
    participant OCA as OpenCodeAdapter
    participant PTY as PTY Process<br/>(node-pty)
    participant CLI as OpenCode CLI
    participant AI as AI Provider<br/>(Claude/GPT/etc)
    participant CE as CompletionEnforcer

    User->>React: Types "Leave the pictures as is"<br/>in follow-up input box

    React->>React: canFollowUp? = isComplete AND hasSession<br/>sessionId = 'sess_abc123'

    React->>React: Optimistic update:<br/>messages.push(userMessage)<br/>status → 'running'

    React->>Preload: accomplish.resumeSession(<br/>'sess_abc123',<br/>'Leave the pictures as is',<br/>'tsk_001')
    Preload->>IPC: ipcRenderer.invoke('session:resume',<br/>sessionId, prompt, existingTaskId)

    Note over IPC: session:resume handler

    IPC->>IPC: taskId = existingTaskId = 'tsk_001' (REUSED!)
    IPC->>SQLite: addTaskMessage('tsk_001',<br/>{ type:'user',<br/>content:'Leave pictures as is',<br/>sort_order=N+1 })
    IPC->>TM: taskManager.startTask('tsk_001',<br/>{ prompt, sessionId:'sess_abc123' },<br/>callbacks)

    TM->>OCA: new OpenCodeAdapter (fresh instance)
    OCA->>OCA: buildCliArgs({ prompt, sessionId })

    Note over OCA: sessionId present →<br/>args.push('--session', 'sess_abc123')

    OCA->>PTY: pty.spawn('opencode run<br/>--format json --model claude-sonnet<br/>--session sess_abc123<br/>--agent accomplish<br/>"Leave the pictures as is"')

    PTY->>CLI: New process starts

    Note over CLI: --session sess_abc123 →<br/>Load FULL conversation history<br/>from ~/.opencode/sessions/sess_abc123/

    CLI->>AI: Send to AI provider:<br/>[system prompt]<br/>[user: "Organize my Downloads"]<br/>[assistant: plan + all tool calls + results]<br/>[assistant: "Organized 47 files..."]<br/>[user: "Leave the pictures as is"]

    Note over AI: AI has FULL context<br/>of everything from Phase 1-7!

    AI-->>CLI: "I'll move the image files back<br/>to the root Downloads folder..."

    Note over CLI, React: Same flow as Phase 4-6:<br/>tool calls → permissions → file moves

    AI-->>CLI: complete_task({ status:'success',<br/>summary:'Moved pictures back' })

    CLI-->>PTY: exit 0
    PTY-->>OCA: onExit
    OCA->>CE: handleProcessExit → onComplete
    TM->>IPC: callbacks.onComplete(result)
    IPC->>SQLite: UPDATE tasks SET status='completed'<br/>(same tsk_001 row)
    IPC->>React: task:update { type:'complete' }

    React->>React: Show completion + follow-up box again<br/>All messages (original + follow-up) visible
```
