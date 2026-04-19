# Development Viewpoint — Accomplish Architecture

> Rozanski & Woods Development Viewpoint: describes the code structure, module organization, build pipeline, and technology choices that developers need to understand.

---

## 1. Package Dependency Graph

The monorepo contains two apps and one shared library, coordinated by **pnpm workspaces**.

```mermaid
graph TD
  subgraph MONOREPO["Accomplish Monorepo (pnpm workspaces)"]
    direction TB

    DESKTOP["@accomplish/desktop<br/><i>Electron app · v0.3.8</i><br/>apps/desktop/"]
    WEB["@accomplish/web<br/><i>React UI · v0.0.1</i><br/>apps/web/"]
    CORE["@accomplish_ai/agent-core<br/><i>Shared library · v0.4.0</i><br/>packages/agent-core/"]
    MCP_TOOLS["MCP Tools<br/><i>8 standalone Node.js packages</i><br/>packages/agent-core/mcp-tools/"]
  end

  DESKTOP -->|"imports"| CORE
  DESKTOP -->|"embeds build output"| WEB
  DESKTOP -->|"bundles at build time"| MCP_TOOLS
  CORE -->|"contains"| MCP_TOOLS

  OC["opencode-ai<br/><i>Go binary · v1.14.18</i><br/>(npm package)"]
  DESKTOP -->|"optionalDependency<br/>(platform-specific)"| OC

  classDef app fill:#e8f4fd,stroke:#1e88e5,stroke-width:2px
  classDef lib fill:#fff3e0,stroke:#fb8c00,stroke-width:2px
  classDef ext fill:#e8f5e9,stroke:#43a047,stroke-width:2px
  classDef mcp fill:#ffccbc,stroke:#e64a19,stroke-width:2px

  class DESKTOP,WEB app
  class CORE lib
  class MCP_TOOLS mcp
  class OC ext
```

---

## 2. Source → Runtime Process Mapping

How source packages map to OS processes at runtime.

```mermaid
graph LR
  subgraph SOURCE["Source Packages"]
    direction TB
    S_WEB["apps/web/"]
    S_DESKTOP["apps/desktop/<br/>src/main/"]
    S_PRELOAD["apps/desktop/<br/>src/preload/"]
    S_CORE["packages/agent-core/"]
    S_MCP["packages/agent-core/<br/>mcp-tools/"]
  end

  subgraph RUNTIME["OS Processes"]
    direction TB
    R_RENDERER["Renderer Process<br/><i>Chromium (sandboxed)</i>"]
    R_MAIN["Main Process<br/><i>Node.js event loop</i>"]
    R_PTY["OpenCode PTY<br/><i>Go binary</i>"]
    R_MCP["MCP Tool Processes<br/><i>Node.js (stdio)</i>"]
    R_BROWSER["Dev-Browser<br/><i>Node.js (detached)</i>"]
  end

  S_WEB -->|"Vite bundle"| R_RENDERER
  S_PRELOAD -->|"contextBridge"| R_RENDERER
  S_DESKTOP -->|"Vite + tsc"| R_MAIN
  S_CORE -->|"imported by main"| R_MAIN
  S_MCP -->|"spawned by OpenCode"| R_MCP
  S_MCP -->|"dev-browser server"| R_BROWSER

  R_MAIN -->|"pty.spawn()"| R_PTY
  R_PTY -->|"MCP stdio"| R_MCP

  classDef source fill:#f3e5f5,stroke:#7b1fa2
  classDef runtime fill:#e8f4fd,stroke:#1e88e5

  class S_WEB,S_DESKTOP,S_PRELOAD,S_CORE,S_MCP source
  class R_RENDERER,R_MAIN,R_PTY,R_MCP,R_BROWSER runtime
```

---

## 3. Technology Stack by Layer

```mermaid
graph TB
  subgraph UI_LAYER["UI Layer — Renderer Process"]
    direction LR
    REACT["React 19"] ~~~ ZUSTAND["Zustand 5"] ~~~ ROUTER["React Router 7"] ~~~ TAILWIND["Tailwind CSS 3"] ~~~ RADIX["Radix UI"] ~~~ I18N["i18next"] ~~~ FRAMER["Framer Motion"]
  end

  subgraph MAIN_LAYER["Application Layer — Electron Main Process"]
    direction LR
    ELECTRON["Electron 35"] ~~~ SQLITE["better-sqlite3"] ~~~ NODE_PTY["node-pty"] ~~~ ZOD["Zod 3"] ~~~ CRYPTO["AES-256-GCM<br/>(secure storage)"]
  end

  subgraph AGENT_LAYER["Agent Layer — PTY + MCP Tools"]
    direction LR
    OPENCODE["OpenCode CLI<br/>(Go binary)"] ~~~ MCP_SDK["MCP SDK 1.27"] ~~~ HONO["Hono 4<br/>(HTTP server)"] ~~~ PLAYWRIGHT["Playwright<br/>(rebrowser fork)"]
  end

  subgraph PROVIDER_LAYER["External — AI Providers"]
    direction LR
    ANTHROPIC["Anthropic"] ~~~ OPENAI["OpenAI"] ~~~ BEDROCK["AWS Bedrock"] ~~~ VERTEX["Google Vertex"] ~~~ AZURE["Azure Foundry"] ~~~ OLLAMA["Ollama / LM Studio"]
  end

  UI_LAYER --> MAIN_LAYER
  MAIN_LAYER --> AGENT_LAYER
  AGENT_LAYER --> PROVIDER_LAYER

  classDef ui fill:#fce4ec,stroke:#e53935
  classDef main fill:#e8f4fd,stroke:#1e88e5
  classDef agent fill:#fff3e0,stroke:#fb8c00
  classDef provider fill:#e8f5e9,stroke:#43a047

  class REACT,ZUSTAND,ROUTER,TAILWIND,RADIX,I18N,FRAMER ui
  class ELECTRON,SQLITE,NODE_PTY,ZOD,CRYPTO main
  class OPENCODE,MCP_SDK,HONO,PLAYWRIGHT agent
  class ANTHROPIC,OPENAI,BEDROCK,VERTEX,AZURE,OLLAMA provider
```

---

## 4. Build Pipeline

From source to distributable — how each package is compiled and how they combine.

```mermaid
graph LR
  subgraph BUILD_INPUTS["Source"]
    WEB_SRC["apps/web/<br/>React + TSX"]
    MAIN_SRC["apps/desktop/<br/>src/main/ + preload/"]
    CORE_SRC["packages/agent-core/<br/>TypeScript"]
    MCP_SRC["mcp-tools/<br/>TypeScript"]
  end

  subgraph BUILD_STEPS["Build Tools"]
    VITE_WEB["Vite 6<br/><i>bundle React app</i>"]
    VITE_ELECTRON["Vite 6<br/><i>+ vite-plugin-electron</i>"]
    TSC["tsc<br/><i>compile agent-core</i>"]
    ESBUILD["esbuild<br/><i>bundle MCP tools</i>"]
  end

  subgraph BUILD_OUTPUTS["Artifacts"]
    WEB_DIST["dist/client/<br/><i>HTML + JS + CSS</i>"]
    MAIN_DIST["dist-electron/<br/><i>main.js + preload.js</i>"]
    CORE_DIST["dist/<br/><i>index.js + .d.ts</i>"]
    MCP_DIST["dist/*.mjs<br/><i>bundled tools</i>"]
  end

  PACK["electron-builder<br/><i>.dmg · .AppImage · .exe</i>"]

  WEB_SRC --> VITE_WEB --> WEB_DIST
  MAIN_SRC --> VITE_ELECTRON --> MAIN_DIST
  CORE_SRC --> TSC --> CORE_DIST
  MCP_SRC --> ESBUILD --> MCP_DIST

  WEB_DIST --> PACK
  MAIN_DIST --> PACK
  CORE_DIST --> PACK
  MCP_DIST --> PACK

  classDef src fill:#f3e5f5,stroke:#7b1fa2
  classDef tool fill:#fff9c4,stroke:#f9a825
  classDef out fill:#e8f5e9,stroke:#43a047
  classDef pack fill:#ffccbc,stroke:#e64a19,stroke-width:2px

  class WEB_SRC,MAIN_SRC,CORE_SRC,MCP_SRC src
  class VITE_WEB,VITE_ELECTRON,TSC,ESBUILD tool
  class WEB_DIST,MAIN_DIST,CORE_DIST,MCP_DIST out
  class PACK pack
```

---

## 5. Module Structure — electron-app

Key directories inside `apps/desktop/src/main/` and their responsibilities.

```mermaid
graph TD
  MAIN["apps/desktop/src/main/"]

  MAIN --> INDEX["index.ts<br/><i>App bootstrap · window creation</i>"]
  MAIN --> IPC["ipc/<br/><i>~50 IPC channel handlers<br/>+ Zod validation</i>"]
  MAIN --> OC["opencode/<br/><i>Config builder · CLI resolver<br/>Environment · Auth</i>"]
  MAIN --> PROVIDERS["providers/<br/><i>LLM provider factory<br/>Vertex · Bedrock</i>"]
  MAIN --> STORE["store/<br/><i>SQLite storage · Secure storage<br/>Migrations · Repositories</i>"]
  MAIN --> SERVICES["services/<br/><i>Permission handler<br/>Thought stream · Speech</i>"]
  MAIN --> SKILLS["skills/<br/><i>SkillsManager<br/>Discovery · Loading</i>"]

  PRELOAD["src/preload/index.ts<br/><i>contextBridge — ~70 API methods</i>"]
  MAIN -.-> PRELOAD

  classDef dir fill:#e8f4fd,stroke:#1e88e5
  classDef file fill:#fafafa,stroke:#bdbdbd

  class MAIN dir
  class IPC,OC,PROVIDERS,STORE,SERVICES,SKILLS dir
  class INDEX,PRELOAD file
```

---

## 6. Module Structure — Web (Renderer)

Key directories inside `apps/web/src/client/`.

```mermaid
graph TD
  CLIENT["apps/web/src/client/"]

  CLIENT --> PAGES["pages/<br/><i>Home · Execution<br/>History · Settings</i>"]
  CLIENT --> COMPONENTS["components/<br/><i>UI primitives (Radix)<br/>Layout · TaskLauncher<br/>Execution · Skills</i>"]
  CLIENT --> STORES["stores/<br/><i>Zustand stores<br/>Task · Settings · Provider</i>"]
  CLIENT --> HOOKS["hooks/<br/><i>useTask · useProviders</i>"]
  CLIENT --> LIB["lib/<br/><i>IPC client · Theme<br/>Formatters · Providers</i>"]
  CLIENT --> I18N_DIR["i18n/<br/><i>Translations (en, ...)<br/>i18next config</i>"]

  classDef dir fill:#fce4ec,stroke:#e53935
  class CLIENT,PAGES,COMPONENTS,STORES,HOOKS,LIB,I18N_DIR dir
```

---

## 7. Module Structure — agent-core

Key directories inside `packages/agent-core/src/`.

```mermaid
graph TD
  CORE["packages/agent-core/src/"]

  CORE --> COMMON["common/<br/><i>Shared types · Zod schemas<br/>Constants · Utils</i>"]
  CORE --> OC["opencode/<br/><i>Config builder · CLI resolver<br/>Message processor<br/>Tool classification</i>"]
  CORE --> PROV["providers/<br/><i>Bedrock · Vertex · Azure<br/>Ollama · LiteLLM · OpenRouter<br/>Model definitions</i>"]
  CORE --> STORAGE["storage/<br/><i>SQLite · Secure storage<br/>Migrations · Repositories</i>"]
  CORE --> FACTORIES["factories/<br/><i>TaskManager · Storage<br/>PermissionHandler<br/>SkillsManager · Speech</i>"]
  CORE --> INTERNAL["internal/classes/<br/><i>TaskManager · Storage<br/>(implementation details)</i>"]
  CORE --> BROWSER["browser/<br/><i>Playwright server<br/>Element detection</i>"]

  MCP["mcp-tools/<br/><i>start-task · complete-task<br/>dev-browser · dev-browser-mcp<br/>whatsapp · request-connector-auth · …</i>"]
  CORE --> MCP

  classDef dir fill:#fff3e0,stroke:#fb8c00
  classDef mcp fill:#ffccbc,stroke:#e64a19

  class CORE,COMMON,OC,PROV,STORAGE,FACTORIES,INTERNAL,BROWSER dir
  class MCP mcp
```

---

## Summary

| Aspect               | Details                                                             |
| -------------------- | ------------------------------------------------------------------- |
| **Monorepo**         | pnpm workspaces (`apps/*`, `packages/*`)                            |
| **Apps**             | `@accomplish/desktop` (Electron 35), `@accomplish/web` (React 19)   |
| **Shared library**   | `@accomplish_ai/agent-core` (TypeScript ESM)                        |
| **Build tools**      | Vite 6, tsc, esbuild, electron-builder                              |
| **OpenCode CLI**     | Go binary v1.14.18, distributed as npm packages (platform-specific) |
| **Database**         | SQLite (better-sqlite3) + AES-256-GCM encrypted secure storage      |
| **Process spawning** | node-pty for PTY lifecycle management                               |
| **MCP tools**        | 8 standalone Node.js packages, bundled with esbuild                 |
| **UI stack**         | React 19 + Zustand 5 + Tailwind CSS + Radix UI + i18next            |
| **Testing**          | Vitest + Playwright E2E                                             |
| **Node requirement** | ≥ 20.0.0                                                            |
| **Package manager**  | pnpm 9.15.0                                                         |
