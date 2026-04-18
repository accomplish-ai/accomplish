# Functional Sequence Diagrams — Accomplish Architecture

> **Companion to** [functional-viewpoint.md](functional-viewpoint.md). That document describes **what** each component is and **how** they connect at a structural level. This one shows **in what order** messages flow across those components, for the three flows where the message order is load-bearing: task start-up, human-in-the-loop gating, and the Free-build LLM-gateway integration.

Each diagram shows only the participants that are active in that phase — participants that only stage data (e.g., `ConfigGenerator`, `ProviderConfigBuilder`) are collapsed into one node so the wire-level interaction stays legible.

## Transport legend

| Annotation            | Mechanism                                                | Direction / shape                          |
| --------------------- | -------------------------------------------------------- | ------------------------------------------ |
| **[IPC invoke]**      | `ipcRenderer.invoke` ↔ `ipcMain.handle` (Electron IPC)   | Renderer → Main, request/reply             |
| **[IPC push]**        | `webContents.send` → `ipcRenderer.on`                    | Main → Renderer, one-way notify            |
| **[JSON-RPC]**        | JSON-RPC 2.0 over Unix socket / Windows named pipe       | Main ↔ Daemon, request/reply               |
| **[JSON-RPC notify]** | `rpc.notify(channel, payload)` on the same socket        | Daemon → Main, one-way                     |
| **[HTTP]**            | OpenCode SDK v2 REST call on `http://127.0.0.1:<random>` | Daemon → `opencode serve`, request/reply   |
| **[SSE]**             | Server-Sent Events stream on the same loopback port      | `opencode serve` → Daemon, streaming push  |
| **[HTTPS]**           | Outbound TLS                                             | `opencode serve` / gateway → external APIs |
| **[spawn]**           | `child_process.spawn`                                    | OS process creation (not a wire protocol)  |

There is **no WebSocket anywhere** in the system — the SDK event channel is SSE, not WS.

---

## Overview — the two canonical round-trips

Before the per-phase diagrams, here are the two flows at the lowest useful granularity: a **task request** (user kicks off work, events stream back to the UI) and a **permission gate** (agent asks to do something risky, user responds). Both round-trips cross every process boundary in the system. The diagrams below compress each to four or five participants. Sections 1, 2, and 3 expand every hop.

### Task request — end to end

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant App as Desktop App<br/>(UI + Electron Main)
    participant Daemon as Daemon<br/>(TaskService + Adapter)
    participant OC as opencode serve<br/>(per task)
    participant AI as AI Provider

    User->>App: types prompt and clicks Start
    App->>Daemon: task.start(cfg)<br/>[JSON-RPC]
    Daemon->>OC: spawn, session.create, session.prompt<br/>[spawn + HTTP]
    OC->>AI: chat completion<br/>[HTTPS]
    AI-->>OC: streaming tokens and tool calls
    OC-->>Daemon: message.part.updated, todo.updated,<br/>session.idle<br/>[SSE]
    Daemon-->>App: rpc.notify then webContents.send<br/>[JSON-RPC notify then IPC push]
    App-->>User: messages, todos, final answer<br/>render live
    Note over Daemon,OC: On terminal event the daemon keeps<br/>opencode serve warm for 60s, then kills it
```

The per-hop breakdown is in §1 (six phases).

### Permission gate — end to end

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant App as Desktop App
    participant Daemon as Daemon<br/>(Adapter + RPC)
    participant OC as opencode serve

    OC-->>Daemon: permission.asked or question.asked<br/>[SSE]
    Daemon-->>App: permission.request notify<br/>[JSON-RPC notify then IPC push]
    App->>User: dialog opens<br/>(path, tool, or question)
    User-->>App: Allow, Deny, or answer
    App->>Daemon: permission.respond(resp)<br/>[IPC invoke then JSON-RPC]
    Daemon->>OC: permission.reply or question.reply<br/>[HTTP POST]
    OC->>OC: tool resumes or agent loop continues
```

The full round-trip — including the `PendingRequest` ID mapping and the non-UI auto-deny branch — is in §2.

---

## 1. Task start — six phases

A single user action ("run this task") walks six distinct layers — UI/preload, daemon RPC, server pool, SDK adapter, the agent loop itself, and the event fan-out back to the UI. Each phase gets its own diagram so the participant list stays short and the transport shift between phases stays obvious.

### 1a. UI → Daemon (renderer prompt hits JSON-RPC surface)

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI<br/>(task launcher)
    participant Pre as Preload<br/>(contextBridge)
    participant H as IPC Handler<br/>(task-handlers.ts)
    participant DC as DaemonClient<br/>(Electron main)
    participant RPC as DaemonRpcServer<br/>(daemon)
    participant TS as TaskService<br/>(daemon)

    UI->>Pre: window.accomplish.startTask(cfg)
    Pre->>H: ipcRenderer.invoke('task:start', cfg)<br/>[IPC invoke]
    H->>DC: client.call('task.start', cfg)
    DC->>RPC: JSON-RPC request 'task.start'<br/>[JSON-RPC, Unix socket / named pipe]
    RPC->>TS: startTask(params)
    TS-->>RPC: { taskId, status: 'queued' }
    RPC-->>DC: JSON-RPC response
    DC-->>H: resolved value
    H-->>Pre: invoke result
    Pre-->>UI: Promise resolves with task handle
```

**What this phase does:** converts a UI click into a daemon-side `TaskService.startTask` call, nothing more. No `opencode serve` yet, no LLM. The renderer is guaranteed a `taskId` it can start subscribing events for.

### 1b. Daemon spawns `opencode serve` for this task

```mermaid
sequenceDiagram
    autonumber
    participant TS as TaskService
    participant SM as OpenCodeServerManager
    participant RT as OpenCodeTaskRuntime
    participant CFG as ConfigGenerator<br/>+ syncApiKeysToOpenCodeAuth
    participant FS as Local disk
    participant OC as opencode serve<br/>(child process)

    TS->>SM: ensureTaskRuntime(taskId, ctx)
    Note over SM: lazy — returns<br/>cached runtime if<br/>within 60s warm window
    SM->>RT: start()
    RT->>CFG: onBeforeStart(ctx)
    CFG->>FS: write opencode.json<br/>+ ~/.local/share/opencode/auth.json
    RT->>OC: child_process.spawn<br/>'opencode serve --hostname=127.0.0.1 --port=0'<br/>[spawn]
    OC-->>RT: stdout "server listening on<br/>http://127.0.0.1:NNNN"
    RT-->>SM: serverUrl
    SM-->>TS: waitForServerUrl(taskId) resolves
```

**What this phase does:** lazily starts a per-task `opencode serve` HTTP+SSE server on a random loopback port. The runtime reads its provider credentials and session config from the two files `ConfigGenerator` just wrote — not from env vars.

### 1c. Agent-core adapter wires to the server

```mermaid
sequenceDiagram
    autonumber
    participant TS as TaskService
    participant TM as TaskManager<br/>(agent-core)
    participant A as OpenCodeAdapter<br/>(agent-core)
    participant OC as opencode serve

    TS->>TM: taskManager.startTask(cfg)
    TM->>A: new OpenCodeAdapter + startTask(cfg)
    Note over A: getServerUrl(taskId) resolves baseUrl<br/>via the OpenCodeServerManager closure
    A->>OC: createOpencodeClient(baseUrl)
    A->>OC: event.subscribe() - opens SSE stream<br/>[SSE]
    OC-->>A: SSE channel established
    A->>OC: session.create()<br/>[HTTP POST]
    OC-->>A: returns sessionID
    A->>OC: session.prompt(sessionID, system, text)<br/>[HTTP POST]
    Note over A,OC: HTTP returns fast. Work happens async<br/>and progress arrives over the SSE stream
```

**What this phase does:** the SDK client inside `OpenCodeAdapter` opens the event stream **before** kicking off the first prompt, so nothing is missed. This is the first point in the lifecycle where HTTP and SSE are both live.

### 1d. Execution — `opencode serve` drives tools and the LLM

```mermaid
sequenceDiagram
    autonumber
    participant A as OpenCodeAdapter
    participant OC as opencode serve<br/>(HTTP + SSE)
    participant SESS as Session runtime<br/>(inside opencode)
    participant TOOLS as Built-in + MCP tools<br/>(Bash, Read, Write, Edit, ...)
    participant AI as AI Provider API

    A->>OC: session.prompt(...)
    OC->>SESS: dispatch prompt
    loop agent loop (per turn)
      SESS->>AI: HTTPS chat completion<br/>[HTTPS]
      AI-->>SESS: streaming tokens + tool calls
      SESS-->>OC: emits message.part.delta<br/>message.part.updated
      OC-->>A: SSE message.part.delta / updated<br/>[SSE]
      SESS->>TOOLS: invoke tool(args)
      TOOLS-->>SESS: tool result
      SESS-->>OC: emits tool-part events<br/>+ todo.updated
      OC-->>A: SSE tool events / todo.updated
    end
    SESS-->>OC: session.idle<br/>(no more work this turn)
    OC-->>A: SSE session.idle
```

**What this phase does:** everything inside the opencode serve process. Accomplish is a passive observer on the SSE side — it never drives the LLM or the tool calls directly, it just reacts to events.

### 1e. Event fan-out — SSE event to React state

Participants are drawn right-to-left here because the data is flowing _outward_ from the daemon back to the UI — mirroring the direction reversal after §1a–1d went left-to-right.

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI
    participant Store as Zustand TaskStore
    participant NF as Notification<br/>Forwarder (main)
    participant RPC as DaemonRpcServer
    participant TCB as TaskCallbacks<br/>(daemon)
    participant A as OpenCodeAdapter<br/>(+ MessageProcessor)
    participant OC as opencode serve

    OC-->>A: SSE message.part.updated<br/>/ todo.updated / etc.<br/>[SSE]
    A->>A: MessageProcessor.toTaskMessage(part)
    A->>TCB: onMessage / onTodoUpdate
    TCB->>RPC: rpc.notify('task.message' /<br/>'todo.update', payload)<br/>[JSON-RPC notify]
    RPC-->>NF: socket notification
    NF->>Store: webContents.send('task:message', data)<br/>[IPC push]
    Store->>UI: state update triggers re-render
```

**What this phase does:** translates low-level SDK events into `TaskMessage` shapes the renderer understands, and pushes them into the Zustand store. This is the "typing animation" path users see in the execution page.

### 1f. Teardown & warm-reuse

```mermaid
sequenceDiagram
    autonumber
    participant A as OpenCodeAdapter
    participant TCB as TaskCallbacks
    participant TS as TaskService
    participant SM as OpenCodeServerManager
    participant OC as opencode serve

    A->>TCB: markComplete('success' | 'error')
    TCB->>TS: onTaskTerminal(taskId, status)
    TS->>SM: scheduleTaskRuntimeCleanup(taskId, 60_000)
    Note over SM: runtime stays alive for 60s in case<br/>user sends a follow-up prompt
    alt follow-up within 60s
      TS->>SM: ensureTaskRuntime(taskId) hits cache
      SM-->>TS: same serverUrl (no spawn)
    else no follow-up
      SM->>OC: kill process group<br/>POSIX kill(-pid, SIGKILL)<br/>/ Windows taskkill /T /F
    end
```

**What this phase does:** keeps the hot-path cost of follow-up prompts near zero while still reclaiming resources when conversations go idle.

---

## 2. Permission & Question gating

Triggered when the agent wants to run a file-mutating tool (`Write`, `Edit`, `Bash`) or explicitly asks the user a clarifying question via `ask-user-question`. The round-trip crosses every layer in the system and back.

```mermaid
sequenceDiagram
    autonumber
    participant SESS as Session runtime<br/>(inside opencode serve)
    participant OC as opencode serve<br/>(HTTP + SSE)
    participant A as OpenCodeAdapter<br/>(incl. PendingRequest map)
    participant TCB as TaskCallbacks<br/>(daemon)
    participant RPC as DaemonRpcServer
    participant NF as Notification<br/>Forwarder (main)
    participant UI as Permission / Question<br/>Dialog (React)
    participant H as IPC Handler<br/>(permission-handlers)
    participant TS as TaskService

    Note over SESS: tool gated OR<br/>ask-user-question fired
    SESS-->>OC: emits permission.asked /<br/>question.asked (with sdkRequestId)
    OC-->>A: SSE permission.asked / question.asked<br/>[SSE]
    Note over A: PendingRequest stores the pairing:<br/>sdkRequestId paired with ossRequestId
    A->>TCB: emit('permission-request', req)

    alt source = 'ui' AND UI connected
      TCB->>RPC: rpc.notify('permission.request', req)<br/>[JSON-RPC notify]
      RPC-->>NF: socket notification
      NF->>UI: webContents.send('permission:request', req)<br/>[IPC push]
      Note over UI: User clicks Allow / Deny<br/>or picks an answer option
      UI->>H: ipcRenderer.invoke('permission:respond', resp)<br/>[IPC invoke]
      H->>RPC: client.call('permission.respond', resp)<br/>[JSON-RPC]
      RPC->>TS: sendResponse(taskId, resp)
      TS->>A: adapter.sendResponse(resp)
    else source is not 'ui' OR no UI connected
      Note over TCB: auto-deny safeguard<br/>(WhatsApp / scheduler with no human)
      TCB->>A: adapter.sendResponse({ decision: 'deny' })
    end

    Note over A: PendingRequest.lookup(ossRequestId)<br/>resolves the matching sdkRequestId
    A->>OC: client.permission.reply(sdkRequestId, decision)<br/>or client.question.reply(sdkRequestId, answer)<br/>[HTTP POST]
    OC-->>SESS: unblock tool / resume agent loop
```

**Key points:**

- **Two IDs, one mapping.** The OSS request ID is what the UI sees. The SDK request ID is what `opencode serve` expects on the reply. `PendingRequest` is the only place both IDs coexist.
- **Reply transport is HTTP, not SSE.** The subscription stream is strictly inbound (`opencode serve → adapter`). Replies go out over the ordinary SDK HTTP methods.
- **Auto-deny is on the same wire.** For non-UI sources (WhatsApp inbound, scheduler-fired task), `TaskCallbacks` invokes `adapter.sendResponse({ decision: 'deny' })` directly — the reply still traverses the same `PendingRequest` → HTTP path, it just skips the RPC/IPC/UI hop.
- **No `:9226` / `:9227` shims.** The HTTP callback servers the PTY era used are gone; the entire gate rides on the SDK's native event model.

---

## 3. LLM-Gateway integration (Free build)

The private package `@accomplish/llm-gateway-client` is loaded via dynamic `import()` at daemon startup. In OSS builds the import fails and `noopRuntime` takes over — every call below becomes a no-op except for `isAvailable()` returning `false`. The two diagrams below only make sense in a Free build.

### 3a. Connect / usage reporting (user-driven)

```mermaid
sequenceDiagram
    autonumber
    participant UI as Settings UI<br/>("Use Accomplish AI")
    participant Pre as Preload
    participant H as IPC Handler<br/>(settings-handlers)
    participant DC as DaemonClient
    participant RPC as DaemonRpcServer
    participant RT as AccomplishRuntime<br/>(Free impl, dynamically loaded)
    participant GW as Accomplish LLM Gateway

    UI->>Pre: window.accomplish.connectAccomplishAi()
    Pre->>H: ipcRenderer.invoke('accomplish-ai:connect')<br/>[IPC invoke]
    H->>DC: client.call('accomplish-ai.connect')
    DC->>RPC: JSON-RPC 'accomplish-ai.connect'<br/>[JSON-RPC]
    RPC->>RT: runtime.connect(storageDeps)
    RT->>GW: OAuth / device-code flow<br/>[HTTPS, DPoP-signed]
    GW-->>RT: tokens + initial usage balance
    RT-->>RPC: { balance, plan }
    RPC-->>UI: resolved (through DC / H / Pre)

    Note over RT,GW: Long-lived listener subscription<br/>runtime.onUsageUpdate(listener)

    loop on each gateway response
      GW-->>RT: response header:<br/>X-Accomplish-Usage: { remaining, plan }
      RT->>RPC: rpc.notify('accomplish-ai.usage-update', usage)<br/>[JSON-RPC notify]
      RPC-->>UI: IPC push then Zustand update<br/>then badge re-renders
    end
```

**What this phase does:** the UI opens a device-code / browser flow, exchanges it for credits, and then keeps a live usage counter in sync. `onUsageUpdate` is wired at daemon boot regardless of whether the user is currently looking at Settings — that way any task-driven gateway call refreshes the number silently.

### 3b. Per-task LLM call tagging (hot path)

```mermaid
sequenceDiagram
    autonumber
    participant TS as TaskService
    participant A as OpenCodeAdapter
    participant RT as AccomplishRuntime
    participant OC as opencode serve
    participant GW as Accomplish LLM Gateway
    participant AI as Upstream AI Provider

    Note over TS,A: Task start (see §1c)
    A->>RT: setProxyTaskId(taskId)

    A->>OC: session.prompt(...)<br/>[HTTP]

    Note over OC,GW: opencode.json's provider block<br/>routes LLM calls through the<br/>gateway URL instead of provider API

    OC->>GW: POST /v1/chat/completions<br/>(task attribution via DPoP / proxy env)<br/>[HTTPS]
    GW->>GW: debit credits on RT's<br/>current proxyTaskId bucket
    GW->>AI: upstream forward<br/>[HTTPS]
    AI-->>GW: response stream + usage metadata
    GW-->>OC: streamed completion +<br/>X-Accomplish-Usage header
    GW-->>RT: (also) usage-update listener fires<br/>(see §3a last loop)
    OC-->>A: SSE message.part.delta / tool events<br/>[SSE]

    Note over A,TS: Task teardown
    A->>RT: setProxyTaskId(undefined)
```

**Key points:**

- **Where the taskId is injected.** `setProxyTaskId` is the single hot-path call between OSS code and the private runtime. It runs at `OpenCodeAdapter.startTask` and again (with `undefined`) at `teardown`. Every gateway-bound LLM request in between gets attributed to that task.
- **OpenCode doesn't know about the gateway.** From `opencode serve`'s point of view it is calling a normal provider endpoint — the swap happens inside the provider config that `buildAccomplishAiConfig` emits. That's why the integration survives OpenCode SDK upgrades without changes.
- **Two usage signal paths.** The response header feeds the in-UI balance; the gateway's own accounting tracks per-task credit spend for rate-limiting and abuse detection.
- **OSS parity.** In the OSS build `setProxyTaskId` is `undefined` (optional-chain short-circuits), `buildAccomplishAiConfig` returns empty, and `accomplish-ai.*` RPCs throw `accomplish_runtime_unavailable`. None of these diagrams' Free-specific arrows fire.

---

## How to read these alongside the other docs

| If you want…                                                    | Read…                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| The set of components and their responsibilities                | [functional-viewpoint.md](functional-viewpoint.md) §1–3 |
| The list of every transport / channel                           | [functional-viewpoint.md](functional-viewpoint.md) §4   |
| Why `opencode serve` is per-task, 60s TTL                       | [functional-viewpoint.md](functional-viewpoint.md) §5   |
| The message **order** on start / gate / gateway (this document) | §1, §2, §3 above                                        |
| Completion-enforcer state machine                               | [functional-viewpoint.md](functional-viewpoint.md) §10  |
| Concurrency invariants / which thread owns what                 | [concurrency-viewpoint.md](concurrency-viewpoint.md)    |
