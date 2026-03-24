# Completion Enforcer — Control Flow Diagrams

> The CompletionEnforcer is Accomplish's guardrail layer on top of OpenCode.
> It ensures tasks reach a defined endpoint by tracking a state machine, validating
> todo completeness, and spawning continuation sessions when the agent falls short.

---

## State Machine Overview

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> DONE : complete_task(success)<br/>+ all todos complete
    IDLE --> BLOCKED : complete_task(blocked)
    IDLE --> PARTIAL_CONTINUATION_PENDING : complete_task(partial)<br/>OR success downgraded<br/>(incomplete todos)
    IDLE --> CONTINUATION_PENDING : Agent stops without<br/>calling complete_task<br/>(tools were used)
    IDLE --> [*] : Agent stops, no tools used<br/>(conversational turn)

    CONTINUATION_PENDING --> IDLE : spawnSessionResumption()<br/>(new PTY with reminder prompt)
    CONTINUATION_PENDING --> MAX_RETRIES_REACHED : attempts > 10

    PARTIAL_CONTINUATION_PENDING --> IDLE : spawnSessionResumption()<br/>(new PTY with continuation plan)
    PARTIAL_CONTINUATION_PENDING --> MAX_RETRIES_REACHED : attempts > 10

    MAX_RETRIES_REACHED --> [*] : Forced completion
    DONE --> [*]
    BLOCKED --> [*]
```

---

## Flow 1: Happy Path — `complete_task(success)`, All Todos Done

The agent calls `complete_task` with `status: 'success'` and every todo is completed or cancelled. The enforcer validates and lets the task end normally.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant SP as StreamParser
    participant CE as CompletionEnforcer
    participant React as React UI

    AI-->>CLI: tool_call: complete_task({<br/>status: 'success',<br/>summary: 'Organized 47 files'<br/>})
    CLI-->>PTY: JSON on stdout
    PTY-->>OCA: onData → StreamParser
    SP-->>OCA: emit('message', tool_call)
    OCA->>OCA: handleToolCall('complete_task', input)
    OCA->>CE: handleCompleteTaskDetection(input)

    Note over CE: hasIncompleteTodos()? → NO<br/>status stays 'success'<br/>recordCompleteTaskCall(args)<br/>State → DONE

    OCA->>React: emit('message', summary text)

    AI-->>CLI: step_finish { reason: 'stop' }
    CLI-->>PTY: JSON
    PTY-->>OCA: StreamParser → handleMessage
    OCA->>CE: handleStepFinish('stop')

    Note over CE: isCompleteTaskCalled()? → YES<br/>State is DONE → return 'complete'

    CE-->>OCA: return 'complete'
    OCA->>OCA: hasCompleted = true
    OCA->>React: emit('complete', { status: 'success' })

    Note over PTY: CLI exits with code 0

    PTY-->>OCA: onExit({ exitCode: 0 })

    Note over OCA: hasCompleted is already true<br/>→ process exit is a NO-OP
```

---

## Flow 2: Agent Claims Success but Has Incomplete Todos

The agent calls `complete_task(success)` but some todos are still pending/in_progress. The enforcer **downgrades** the status to `partial` and triggers a continuation that forces the agent to finish or update its todo list.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant CS as CompletionState

    AI-->>CLI: tool_call: complete_task({<br/>status: 'success',<br/>summary: 'Created folders and moved files'<br/>})
    CLI-->>PTY: JSON on stdout
    PTY-->>OCA: StreamParser → handleToolCall

    OCA->>CE: handleCompleteTaskDetection(input)

    Note over CE: hasIncompleteTodos()? → YES!<br/>Todos still pending:<br/>- "Move image files" (in_progress)<br/>- "Verify folder structure" (pending)

    CE->>CE: DOWNGRADE status:<br/>'success' → 'partial'
    CE->>CE: remaining_work =<br/>"- Move image files\n- Verify folder structure"
    CE->>CS: recordCompleteTaskCall({ status: 'partial' })

    Note over CS: State → PARTIAL_CONTINUATION_PENDING

    AI-->>CLI: step_finish { reason: 'stop' }
    CLI-->>PTY: JSON
    PTY-->>OCA: StreamParser → step_finish
    OCA->>CE: handleStepFinish('stop')

    Note over CE: isPendingPartialContinuation()? → YES<br/>return 'pending'

    CE-->>OCA: return 'pending'

    Note over OCA: Does NOT emit 'complete'<br/>Does NOT set hasCompleted

    Note over PTY: CLI exits with code 0

    PTY-->>OCA: onExit({ exitCode: 0 })
    OCA->>CE: handleProcessExit(0)

    Note over CE: isPendingPartialContinuation() + exitCode 0<br/>→ Build continuation prompt

    CE->>CE: getPartialContinuationPrompt(<br/>remainingWork, originalRequest,<br/>summary, incompleteTodos)

    Note over CE: Prompt says:<br/>"Your complete_task call was rejected<br/>because these todo items are still<br/>marked incomplete:<br/>- Move image files<br/>- Verify folder structure<br/><br/>Call todowrite to mark each item as<br/>completed or cancelled, then call<br/>complete_task with status=success."

    CE->>CS: startPartialContinuation()<br/>continuationAttempts++ (→ 1)
    CS-->>CE: return true (under max 10)
    CE->>CE: State → IDLE (reset for retry)
    CE->>OCA: callbacks.onStartContinuation(prompt)
    OCA->>OCA: spawnSessionResumption(prompt)

    Note over OCA: NEW PTY spawned with<br/>same sessionId + continuation prompt<br/>(see Flow 7 for details)
```

---

## Flow 3: Agent Reports Partial Completion

The agent voluntarily calls `complete_task(partial)` admitting it didn't finish. The enforcer forces a structured continuation with a mandatory plan.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant CS as CompletionState

    AI-->>CLI: tool_call: complete_task({<br/>status: 'partial',<br/>summary: 'Created folders but could not<br/>identify all file types',<br/>remaining_work: 'Need to categorize<br/>.dat and .tmp files',<br/>original_request_summary:<br/>'Organize Downloads folder'<br/>})
    CLI-->>PTY: JSON
    PTY-->>OCA: StreamParser → handleToolCall
    OCA->>CE: handleCompleteTaskDetection(input)

    Note over CE: No incomplete-todo downgrade needed<br/>(agent already said partial)

    CE->>CS: recordCompleteTaskCall({ status: 'partial' })

    Note over CS: State → PARTIAL_CONTINUATION_PENDING

    AI-->>CLI: step_finish { reason: 'stop' }
    PTY-->>OCA: handleStepFinish
    OCA->>CE: handleStepFinish('stop')
    CE-->>OCA: return 'pending'

    Note over PTY: CLI exits with code 0

    PTY-->>OCA: onExit({ exitCode: 0 })
    OCA->>CE: handleProcessExit(0)

    Note over CE: Build structured continuation prompt

    CE->>CE: getPartialContinuationPrompt(...)

    Note over CE: Prompt includes:<br/>"## Original Request<br/>'Organize Downloads folder'<br/><br/>## What You Completed<br/>Created folders but could not identify<br/>all file types<br/><br/>## What You Said Remains<br/>Need to categorize .dat and .tmp files<br/><br/>## REQUIRED: Create a Continuation Plan<br/>1. Review the original request<br/>2. Create a TODO list<br/>3. Execute the plan<br/>4. Call complete_task(success)<br/><br/>## IMPORTANT RULES<br/>- Do NOT call complete_task with 'partial'<br/>  again unless actual TECHNICAL blocker<br/>- Do NOT ask user 'would you like me to<br/>  continue?' — just continue working"

    CE->>CS: startPartialContinuation()
    CE->>OCA: callbacks.onStartContinuation(prompt)
    OCA->>OCA: spawnSessionResumption(prompt)

    Note over OCA: New PTY process spawned<br/>Agent gets full history + plan requirement
```

---

## Flow 4: Agent Stops Without Calling `complete_task`

The agent's turn ends (step_finish with reason `stop`/`end_turn`) but it never called `complete_task`. If tools were used, the enforcer re-prompts.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant CS as CompletionState

    AI-->>CLI: tool_call: Bash({ command: "mkdir ~/Downloads/Docs" })
    CLI-->>PTY: tool_use result
    PTY-->>OCA: StreamParser → handleToolCall
    OCA->>CE: markToolsUsed(true)

    Note over CE: taskToolsWereUsed = true<br/>taskToolsWereUsedEver = true

    AI-->>CLI: text: "I've created the Documents folder."
    CLI-->>PTY: text message

    Note over AI: Agent decides to stop<br/>WITHOUT calling complete_task

    AI-->>CLI: step_finish { reason: 'stop' }
    PTY-->>OCA: StreamParser → step_finish
    OCA->>CE: handleStepFinish('stop')

    Note over CE: isCompleteTaskCalled()? → NO<br/>isConversationalTurn()? → NO<br/>(tools WERE used)<br/>→ Schedule continuation

    CE->>CS: scheduleContinuation()
    CS->>CS: continuationAttempts++ (→ 1)<br/>1 ≤ 10 → OK

    Note over CS: State → CONTINUATION_PENDING

    CE-->>OCA: return 'pending'

    Note over PTY: CLI exits with code 0

    PTY-->>OCA: onExit({ exitCode: 0 })
    OCA->>CE: handleProcessExit(0)

    Note over CE: isPendingContinuation() + exitCode 0<br/>→ Build reminder prompt

    CE->>CE: getContinuationPrompt()

    Note over CE: Prompt says:<br/>"REMINDER: You must call complete_task<br/>when finished.<br/><br/>Before proceeding, ask yourself:<br/>'Have I actually finished everything<br/>the user asked?'<br/><br/>- If NO → CONTINUE WORKING on the task<br/>- If YES → Call complete_task(success)<br/>- If blocker → Call complete_task(blocked)<br/>- If some done, some not →<br/>  Call complete_task(partial)<br/><br/>Do NOT call complete_task until you<br/>have actually completed the request.<br/>Keep working if there's more to do."

    CE->>CS: startContinuation()<br/>State → IDLE (reset for retry)
    CE->>OCA: callbacks.onStartContinuation(prompt)
    OCA->>OCA: spawnSessionResumption(prompt)

    Note over OCA: New PTY with same session<br/>Agent sees full history +<br/>reminder to call complete_task
```

---

## Flow 5: Conversational Turn — No Enforcement Needed

The agent responds with only text (no tools used, no todos created). The enforcer recognizes this as a conversational exchange and lets it end without requiring `complete_task`.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer

    AI-->>CLI: text: "Sure, I can help organize<br/>your Downloads folder.<br/>What categories would you like?"
    CLI-->>PTY: text message

    Note over OCA: No tool calls intercepted<br/>taskToolsWereUsed = false<br/>taskToolsWereUsedEver = false<br/>taskRequiresCompletion = false

    AI-->>CLI: step_finish { reason: 'stop' }
    PTY-->>OCA: StreamParser → step_finish
    OCA->>CE: handleStepFinish('stop')

    Note over CE: isCompleteTaskCalled()? → NO<br/>isConversationalTurn()? → YES<br/>(no tools used, no todos, no completion required)<br/>→ Skip enforcement

    CE-->>OCA: return 'complete'
    OCA->>OCA: hasCompleted = true
    OCA->>OCA: emit('complete', { status: 'success' })

    Note over OCA: Task ends naturally<br/>No continuation spawned
```

---

## Flow 6: Max Retries Exhausted

After 10 continuation attempts (default), the enforcer gives up and forces the task to end regardless of completion state.

```mermaid
sequenceDiagram
    autonumber
    participant AI as AI Provider
    participant CLI as OpenCode CLI
    participant PTY as PTY Process
    participant OCA as OpenCodeAdapter
    participant CE as CompletionEnforcer
    participant CS as CompletionState

    Note over CE: Previous 9 continuation attempts<br/>have all ended without complete_task

    AI-->>CLI: Bash({ command: "ls ~/Downloads" })
    PTY-->>OCA: tool_use result
    OCA->>CE: markToolsUsed(true)

    AI-->>CLI: text: "Still working on it..."
    AI-->>CLI: step_finish { reason: 'stop' }
    PTY-->>OCA: step_finish
    OCA->>CE: handleStepFinish('stop')

    Note over CE: isCompleteTaskCalled()? → NO<br/>isConversationalTurn()? → NO

    CE->>CS: scheduleContinuation()
    CS->>CS: continuationAttempts++ (→ 10)

    Note over CS: 10 > maxContinuationAttempts (10)?<br/>→ NO (equal, not greater)<br/>State → CONTINUATION_PENDING

    CE-->>OCA: return 'pending'

    Note over PTY: CLI exits with code 0

    PTY-->>OCA: onExit(0)
    OCA->>CE: handleProcessExit(0)
    CE->>OCA: callbacks.onStartContinuation(prompt)
    OCA->>OCA: spawnSessionResumption(prompt)

    Note over OCA: 10th continuation attempt runs...

    AI-->>CLI: step_finish { reason: 'stop' }
    PTY-->>OCA: step_finish
    OCA->>CE: handleStepFinish('stop')

    CE->>CS: scheduleContinuation()
    CS->>CS: continuationAttempts++ (→ 11)

    Note over CS: 11 > 10? → YES!<br/>State → MAX_RETRIES_REACHED<br/>return false

    CE-->>OCA: return 'complete'

    Note over CE: console.warn:<br/>"Agent stopped without complete_task.<br/>Attempts: 11/10"

    OCA->>OCA: hasCompleted = true
    OCA->>OCA: emit('complete', { status: 'success' })

    Note over OCA: Task forcefully ended<br/>No more continuations
```

---

## Flow 7: Session Resumption Mechanism — `spawnSessionResumption()`

This is the engine behind all continuation flows. When the CompletionEnforcer decides the task isn't done, it calls back into the adapter which spawns a brand new PTY process using the same session ID, so OpenCode loads the full conversation history plus the continuation prompt.

```mermaid
sequenceDiagram
    autonumber
    participant CE as CompletionEnforcer
    participant OCA as OpenCodeAdapter
    participant SP as StreamParser
    participant PTY1 as PTY Process #1<br/>(exited)
    participant PTY2 as PTY Process #2<br/>(new)
    participant CLI as OpenCode CLI
    participant AI as AI Provider

    Note over PTY1: Process already exited<br/>with code 0

    CE->>OCA: callbacks.onStartContinuation(prompt)
    OCA->>OCA: spawnSessionResumption(prompt)

    Note over OCA: Preconditions:<br/>currentSessionId must exist<br/>(from original task's step_start)

    OCA->>SP: streamParser.reset()<br/>(clear buffer for new process)

    OCA->>OCA: Build config:<br/>{ prompt: continuationPrompt,<br/>  sessionId: currentSessionId,<br/>  workingDirectory: lastWorkingDirectory }

    OCA->>OCA: buildCliArgs(config)<br/>→ includes --session <sessionId>

    OCA->>OCA: buildEnvironment(taskId)<br/>→ same env as original task

    OCA->>PTY2: pty.spawn(shell, ['-c',<br/>'opencode run --format json<br/>--session sess_abc123<br/>"REMINDER: You must call<br/>complete_task when finished..."'])

    Note over PTY2: Brand new PTY process<br/>Same session, new prompt

    PTY2->>CLI: Process starts

    Note over CLI: --session sess_abc123 →<br/>Loads FULL conversation history<br/>from ~/.opencode/sessions/sess_abc123/<br/><br/>AI sees:<br/>1. Original user prompt<br/>2. All previous tool calls + results<br/>3. Previous assistant responses<br/>4. NEW: continuation prompt

    CLI->>AI: Send continuation prompt<br/>with full session context

    Note over AI: AI reads the reminder/plan<br/>and resumes working...

    AI-->>CLI: tool calls, text, etc.
    CLI-->>PTY2: JSON on stdout
    PTY2-->>OCA: onData → StreamParser

    Note over OCA: Same event handlers still wired:<br/>message, progress, complete, error,<br/>todo:update, etc.<br/><br/>CompletionEnforcer is still active<br/>and tracking this continuation attempt

    PTY2-->>OCA: onExit({ exitCode })
    OCA->>CE: handleProcessExit(exitCode)

    Note over CE: Cycle repeats:<br/>Did agent call complete_task?<br/>If yes → DONE<br/>If no → another continuation<br/>(up to max 10 attempts)
```
