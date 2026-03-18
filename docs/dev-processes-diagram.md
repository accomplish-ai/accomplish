# Accomplish — Dev Mode Process Architecture

## What `pnpm dev` Spawns

```mermaid
flowchart TB
    subgraph terminal["Terminal: pnpm dev"]
        predev["predev (sync, exits)
        check-deps.cjs
        ensure-agent-core-built.cjs"]

        dev_cjs["dev.cjs (orchestrator)
        Spawns children, manages lifecycle"]
    end

    predev --> dev_cjs

    subgraph vite_proc["Process 1: Vite Dev Server (long-running)"]
        direction TB
        vite_core["Vite Core
        localhost:5173
        Serves React UI with HMR"]

        vite_electron_plugin["vite-plugin-electron
        Watches src/main/**
        Watches src/preload/**
        Rebuilds on file change"]

        bundler["Bundler (on each rebuild)
        hundreds of .ts files
        into one index-XXXXX.js
        + source map if ELECTRON_DEBUG=1"]

        vite_core --- vite_electron_plugin
        vite_electron_plugin --- bundler
    end

    subgraph electron_proc["Process 2: Electron (long-running)"]
        direction TB
        main["Main Process (Node.js)
        Runs dist-electron/main/index-XXXXX.js
        IPC handlers, TaskManager, SQLite,
        Permission API servers (9226, 9227, 9228)"]

        renderer["Renderer Process (Chromium)
        Loads http://localhost:5173
        React UI, Zustand store
        Communicates via IPC bridge"]

        preload_script["Preload Script
        dist-electron/preload/index.cjs
        contextBridge API"]

        main --- preload_script
        preload_script --- renderer
    end

    dev_cjs -- "spawn: pnpm -F @accomplish/web dev" --> vite_proc
    dev_cjs -- "spawn (after :5173 ready): pnpm -F @accomplish/desktop dev" --> electron_proc

    vite_proc -- "startup(argv) spawns Electron
    after build completes" --> electron_proc

    renderer -- "HTTP GET http://localhost:5173
    Hot Module Replacement (WebSocket)" --> vite_core

    vite_electron_plugin -- "File change detected
    Rebuild + restart Electron" --> electron_proc

    style terminal fill:#e8e8e8,stroke:#666
    style vite_proc fill:#dff0d8,stroke:#3c763d
    style electron_proc fill:#d9edf7,stroke:#31708f
```

## During Task Execution (additional processes)

```mermaid
flowchart TB
    subgraph electron["Process 2: Electron Main"]
        tm["TaskManager"]
        oca["OpenCodeAdapter"]
        perm_api["Permission API
        HTTP :9226 (files)
        HTTP :9227 (questions)
        HTTP :9228 (thought stream)"]
    end

    subgraph pty_proc["Process 3: OpenCode CLI (via PTY)"]
        cli["opencode run --format json
        --model openai/gpt-5.2
        --agent accomplish
        Reads session from ~/.opencode/sessions/
        Communicates with AI provider via HTTPS"]
    end

    subgraph mcp_fp["Process 4: MCP file-permission (stdio)"]
        fp["Runs as child of OpenCode CLI
        Calls HTTP POST :9226
        Waits for user response"]
    end

    subgraph mcp_aq["Process 5: MCP ask-user-question (stdio)"]
        aq["Runs as child of OpenCode CLI
        Calls HTTP POST :9227
        Waits for user response"]
    end

    subgraph mcp_ct["Process 6: MCP complete-task (stdio)"]
        ct["Runs as child of OpenCode CLI
        Signals task completion"]
    end

    subgraph mcp_st["Process 7: MCP start-task (stdio)"]
        st["Runs as child of OpenCode CLI
        Captures task plan"]
    end

    subgraph browser_proc["Process 8: Dev Browser Server"]
        browser["Node.js process
        Manages Chromium via CDP
        HTTP API on :9224
        CDP WebSocket on :9225"]
    end

    subgraph mcp_browser["Process 9: MCP dev-browser-mcp (stdio)"]
        db_mcp["Runs as child of OpenCode CLI
        Calls HTTP to :9224
        Browser automation tools"]
    end

    subgraph ai_cloud["Cloud: AI Provider"]
        ai["Anthropic / OpenAI / etc
        HTTPS API"]
    end

    tm --> oca
    oca -- "node-pty spawn" --> pty_proc
    oca -- "stdin/stdout JSON stream" --> pty_proc

    cli -- "MCP stdio" --> mcp_fp
    cli -- "MCP stdio" --> mcp_aq
    cli -- "MCP stdio" --> mcp_ct
    cli -- "MCP stdio" --> mcp_st
    cli -- "MCP stdio" --> mcp_browser
    cli -- "HTTPS" --> ai_cloud

    fp -- "HTTP POST :9226" --> perm_api
    aq -- "HTTP POST :9227" --> perm_api
    db_mcp -- "HTTP to :9224" --> browser_proc

    electron -- "spawn at first task" --> browser_proc

    style electron fill:#d9edf7,stroke:#31708f
    style pty_proc fill:#fcf8e3,stroke:#8a6d3b
    style mcp_fp fill:#f2dede,stroke:#a94442
    style mcp_aq fill:#f2dede,stroke:#a94442
    style mcp_ct fill:#f2dede,stroke:#a94442
    style mcp_st fill:#f2dede,stroke:#a94442
    style mcp_browser fill:#f2dede,stroke:#a94442
    style browser_proc fill:#dff0d8,stroke:#3c763d
    style ai_cloud fill:#e8daef,stroke:#6c3483
```

## Full Process Tree

```mermaid
flowchart LR
    subgraph tree["OS Process Tree During Task Execution"]
        direction TB
        shell["Terminal Shell (zsh/bash)"]
        pnpm_dev["pnpm dev (dev.cjs)
        PID: parent orchestrator"]

        vite["Vite Dev Server
        Serves :5173 (React HMR)
        Builds Electron code"]

        electron_main["Electron
        Main: index-XXXXX.js
        Renderer: localhost:5173
        Ports: 9226, 9227, 9228"]

        pty_opencode["PTY: OpenCode CLI
        opencode run --format json ...
        Reads/writes ~/.opencode/sessions/"]

        mcp1["MCP: file-permission (stdio)"]
        mcp2["MCP: ask-user-question (stdio)"]
        mcp3["MCP: complete-task (stdio)"]
        mcp4["MCP: start-task (stdio)"]
        mcp5["MCP: dev-browser-mcp (stdio)"]

        browser_srv["Dev Browser Server
        Ports: 9224 (HTTP), 9225 (CDP)"]

        chromium["Chromium (browser automation)
        Controlled via CDP"]

        shell --> pnpm_dev
        pnpm_dev --> vite
        pnpm_dev --> electron_main
        electron_main --> pty_opencode
        electron_main --> browser_srv
        pty_opencode --> mcp1
        pty_opencode --> mcp2
        pty_opencode --> mcp3
        pty_opencode --> mcp4
        pty_opencode --> mcp5
        browser_srv --> chromium
    end

    style shell fill:#e8e8e8,stroke:#666
    style pnpm_dev fill:#e8e8e8,stroke:#666
    style vite fill:#dff0d8,stroke:#3c763d
    style electron_main fill:#d9edf7,stroke:#31708f
    style pty_opencode fill:#fcf8e3,stroke:#8a6d3b
    style mcp1 fill:#f2dede,stroke:#a94442
    style mcp2 fill:#f2dede,stroke:#a94442
    style mcp3 fill:#f2dede,stroke:#a94442
    style mcp4 fill:#f2dede,stroke:#a94442
    style mcp5 fill:#f2dede,stroke:#a94442
    style browser_srv fill:#dff0d8,stroke:#3c763d
    style chromium fill:#dff0d8,stroke:#3c763d
```

## Port Map

```mermaid
flowchart LR
    subgraph ports["Localhost Ports in Dev Mode"]
        direction TB
        p5173["**:5173** - Vite Dev Server
        React UI + HMR WebSocket
        Used by: Electron renderer"]

        p9224["**:9224** - Dev Browser HTTP API
        Browser automation commands
        Used by: dev-browser-mcp"]

        p9225["**:9225** - Chrome CDP WebSocket
        Chrome DevTools Protocol
        Used by: Dev Browser Server"]

        p9226["**:9226** - File Permission API
        Deferred promise pattern
        Used by: MCP file-permission"]

        p9227["**:9227** - Question API
        Deferred promise pattern
        Used by: MCP ask-user-question"]

        p9228["**:9228** - Thought Stream API
        Server-sent events
        Used by: Electron main"]

        p9229["**:9229** - V8 Inspector (debug only)
        Node.js debug protocol
        Used by: WebStorm debugger
        Only when ELECTRON_DEBUG=1"]
    end

    style p5173 fill:#dff0d8,stroke:#3c763d
    style p9224 fill:#dff0d8,stroke:#3c763d
    style p9225 fill:#dff0d8,stroke:#3c763d
    style p9226 fill:#f2dede,stroke:#a94442
    style p9227 fill:#f2dede,stroke:#a94442
    style p9228 fill:#d9edf7,stroke:#31708f
    style p9229 fill:#fcf8e3,stroke:#8a6d3b
```

## Dev vs Production Process Differences

```mermaid
flowchart TB
    subgraph dev_mode["DEV MODE (pnpm dev)"]
        direction TB
        d1["Vite Dev Server (:5173)
        Serves React UI
        Hot Module Replacement
        Rebuilds Electron code on change"]

        d2["Electron
        Renderer loads from localhost:5173
        Main runs bundled JS from dist-electron/
        Source maps available for debugging"]

        d1 --> d2
    end

    subgraph prod_mode["PRODUCTION (packaged .app/.exe)"]
        direction TB
        p1["No Vite - not running"]

        p2["Electron (single app)
        Renderer loads from file://
        bundled HTML/CSS/JS in resources/web-ui/
        Main runs from app.asar
        No source maps, no HMR"]

        p1 ~~~ p2
    end

    style dev_mode fill:#dff0d8,stroke:#3c763d
    style prod_mode fill:#d9edf7,stroke:#31708f
    style p1 fill:#f5f5f5,stroke:#ccc,stroke-dasharray: 5 5
```

## WebStorm Debug: Why Two Steps?

### Normal Run (no debug) — one step

```mermaid
sequenceDiagram
    participant WS as WebStorm
    participant PNPM as pnpm dev
    participant Vite as Vite Dev Server
    participant E as Electron

    WS->>PNPM: Click Play on "Dev (Full App)"
    PNPM->>Vite: spawn Vite (:5173)
    PNPM->>Vite: wait for :5173 ready
    Vite->>Vite: Build main process .ts into bundle .js
    Vite->>E: startup() spawns Electron
    Note over E: Electron runs normally
    Note over E: No debug port open
    Note over WS: WebStorm just shows console output
    Note over WS: Cannot set breakpoints
```

### Debug Run — two steps needed

```mermaid
sequenceDiagram
    participant WS as WebStorm
    participant PNPM as pnpm dev
    participant Vite as Vite Dev Server
    participant E as Electron
    participant DBG as WebStorm Debugger

    rect rgb(255, 245, 230)
        Note over WS,E: STEP 1: Click Play on "Debug: Electron Main (1. Start)"
        WS->>PNPM: Run pnpm dev with ELECTRON_DEBUG=1
        PNPM->>Vite: spawn Vite (:5173)
        Vite->>Vite: Build .ts into bundle .js + SOURCE MAPS
        Vite->>E: startup(['.',  '--no-sandbox',  '--inspect=9229'])
        Note over E: Electron starts
        E->>E: V8 opens debug socket on :9229
        Note over E: Waiting for debugger on :9229...
        Note over E: App runs normally meanwhile
    end

    rect rgb(230, 245, 255)
        Note over WS,DBG: STEP 2: Click Debug on "Debug: Electron Main (2. Attach)"
        WS->>DBG: Launch "Attach to Node.js"
        DBG->>E: TCP connect to localhost:9229
        E-->>DBG: V8 debug protocol handshake
        DBG->>E: Request source map
        E-->>DBG: index-XXXXX.js.map
        DBG->>DBG: Parse source map
        Note over DBG: handlers.ts:148 maps to bundle:8581
        DBG->>E: Set breakpoint at bundle line 8581
        Note over WS: Breakpoints now work!
    end

    Note over WS,E: User types prompt in Electron window
    E->>E: IPC handler runs, hits line 8581
    E-->>DBG: Paused at breakpoint
    DBG-->>WS: Show handlers.ts:148 with variables
```

### Why can't it be one step?

```mermaid
flowchart TB
    subgraph problem["The Problem: Nested Process Spawning"]
        direction TB

        ws_npm["WebStorm npm runner
        Can only debug the process
        IT DIRECTLY STARTS"]

        pnpm["pnpm (child #1)
        Just a package manager"]

        dev_cjs["dev.cjs (child #2)
        Just an orchestrator script"]

        vite["Vite (child #3)
        A build tool"]

        electron["Electron (child #4)
        THIS is what we want to debug!
        But it is 4 levels deep"]

        ws_npm -- "spawns" --> pnpm
        pnpm -- "spawns" --> dev_cjs
        dev_cjs -- "spawns" --> vite
        vite -- "spawns" --> electron
    end

    subgraph solution["The Solution: Two Configs"]
        direction TB

        step1["Step 1: npm runner
        Starts the whole chain
        Sets ELECTRON_DEBUG=1
        Electron opens port :9229"]

        step2["Step 2: Attach debugger
        Connects DIRECTLY to Electron
        via port :9229
        Skips the 4 layers in between"]

        step1 -. "port 9229 bridge" .-> step2
    end

    problem ~~~ solution

    style electron fill:#fcf8e3,stroke:#8a6d3b,stroke-width:3px
    style step2 fill:#d9edf7,stroke:#31708f,stroke-width:3px
    style problem fill:#f9f9f9,stroke:#999
    style solution fill:#f0fff0,stroke:#3c763d
```
