# Accomplish — System Context Diagram

> **Viewpoint**: Context (Rozanski & Woods)
>
> Shows the system as a single box, surrounded by the users and external entities
> it interacts with. No internal structure is exposed at this level.

### Simplified View

The essential shape: one user, one system, six categories of external entities.

```mermaid
graph TB
    classDef person fill:#08427B,color:#fff,stroke:#073B6F,stroke-width:2px
    classDef system fill:#1168BD,color:#fff,stroke:#0E5AA7,stroke-width:2px
    classDef external fill:#999,color:#fff,stroke:#6B6B6B,stroke-width:2px
    classDef local fill:#438DD5,color:#fff,stroke:#3C7FC0,stroke-width:2px

    User["👤 <b>User</b><br/><i>[Person]</i>"]:::person

    Accomplish["<b>Accomplish</b><br/><i>[Software System]</i><br/><br/>AI desktop agent that automates<br/>tasks via natural language"]:::system

    AI["☁️ <b>AI Providers</b><br/><i>Anthropic · OpenAI · Google<br/>+ 12 more (cloud & local)</i>"]:::external
    FS["💾 <b>Local File System</b><br/><i>User's files & folders</i>"]:::local
    BROWSER["🌐 <b>Web / SaaS</b><br/><i>Gmail · Slack · Notion<br/>Any website (via Playwright)</i>"]:::external
    MCP["🔌 <b>MCP Connectors</b><br/><i>Remote tools (OAuth 2.0)</i>"]:::external
    VOICE["🎤 <b>ElevenLabs</b><br/><i>Speech-to-text</i>"]:::external
    SKILLS["📦 <b>GitHub</b><br/><i>Skill imports</i>"]:::external

    User -->|"natural language tasks<br/>+ approvals"| Accomplish
    Accomplish -->|"progress · results<br/>· permission requests"| User
    Accomplish <-->|"LLM prompts / responses"| AI
    Accomplish <-->|"read · write · organize"| FS
    Accomplish -->|"browse · click · extract"| BROWSER
    Accomplish <-->|"remote tool calls"| MCP
    Accomplish -->|"voice input"| VOICE
    Accomplish -->|"download skills"| SKILLS
```

---

### Detailed View

The same context exploded — every individual provider, SaaS app, and integration method.

```mermaid
graph TB
    classDef person fill:#08427B,color:#fff,stroke:#073B6F,stroke-width:2px
    classDef system fill:#1168BD,color:#fff,stroke:#0E5AA7,stroke-width:2px
    classDef external fill:#999,color:#fff,stroke:#6B6B6B,stroke-width:2px
    classDef local fill:#438DD5,color:#fff,stroke:#3C7FC0,stroke-width:2px

    User["<b>User</b><br/><i>[Person]</i><br/><br/>Uses the desktop app to<br/>describe tasks in natural<br/>language and approve<br/>file operations"]:::person

    Accomplish["<b>Accomplish</b><br/><i>[Software System]</i><br/><br/>AI desktop agent that automates<br/>file management, document creation,<br/>and browser tasks locally"]:::system

    %% ── AI Model Providers ──────────────────────────────

    subgraph CloudAI["Cloud AI Providers"]
        Anthropic["<b>Anthropic API</b><br/><i>[External Service]</i><br/>Claude models"]:::external
        OpenAI["<b>OpenAI API</b><br/><i>[External Service]</i><br/>GPT models"]:::external
        GoogleAI["<b>Google AI API</b><br/><i>[External Service]</i><br/>Gemini models"]:::external
        xAI["<b>xAI API</b><br/><i>[External Service]</i><br/>Grok models"]:::external
        DeepSeek["<b>DeepSeek API</b><br/><i>[External Service]</i><br/>DeepSeek models"]:::external
        Bedrock["<b>Amazon Bedrock</b><br/><i>[AWS Service]</i><br/>Multi-model gateway"]:::external
        AzureFoundry["<b>Azure Foundry</b><br/><i>[Azure Service]</i><br/>Microsoft AI models"]:::external
        OpenRouter["<b>OpenRouter</b><br/><i>[External Service]</i><br/>Model aggregator"]:::external
        OtherProviders["<b>Moonshot / Z.AI /<br/>MiniMax / LiteLLM</b><br/><i>[External Services]</i>"]:::external
    end

    subgraph LocalAI["Local AI Runtimes"]
        Ollama["<b>Ollama</b><br/><i>[Local Service]</i><br/>Local LLM inference"]:::local
        LMStudio["<b>LM Studio</b><br/><i>[Local Service]</i><br/>Local LLM inference"]:::local
    end

    %% ── Local Resources ────────────────────────────────

    FileSystem["<b>Local File System</b><br/><i>[OS Resource]</i><br/><br/>User's files and folders<br/>(Downloads, Documents, Desktop, etc.)"]:::local

    ChromeBrowser["<b>Chromium Browser</b><br/><i>[Bundled Runtime]</i><br/><br/>Playwright-controlled browser<br/>for web automation"]:::local

    %% ── Web & SaaS ─────────────────────────────────────

    subgraph SaaS["SaaS / Web Applications<br/>(via browser automation or MCP connectors)"]
        Google["<b>Google Workspace</b><br/><i>[Web Application]</i><br/>Gmail, Drive, Sheets,<br/>Calendar, Docs"]:::external
        Microsoft["<b>Microsoft 365</b><br/><i>[Web Application]</i><br/>Outlook, OneDrive,<br/>Office Online"]:::external
        Notion["<b>Notion</b><br/><i>[Web Application]</i><br/>Databases, wikis, docs"]:::external
        Slack["<b>Slack</b><br/><i>[Web Application]</i><br/>Team messaging"]:::external
        Dropbox["<b>Dropbox</b><br/><i>[Web Application]</i><br/>Cloud file storage"]:::external
        AnyWebsite["<b>Any Website</b><br/><i>[Web]</i><br/>Research, forms,<br/>data extraction"]:::external
    end

    subgraph MCPRemote["Remote MCP Servers"]
        MCPConnectors["<b>MCP Connectors</b><br/><i>[External Services]</i><br/><br/>Any MCP-compatible remote<br/>server with OAuth 2.0<br/>(user-configured)"]:::external
    end

    %% ── Other External Services ────────────────────────

    ElevenLabs["<b>ElevenLabs API</b><br/><i>[External Service]</i><br/><br/>Speech-to-text<br/>transcription"]:::external

    GitHub["<b>GitHub</b><br/><i>[External Service]</i><br/><br/>Custom skill imports<br/>(SKILL.md files)"]:::external

    %% ── Relationships ──────────────────────────────────

    User -- "Describes tasks,<br/>approves file operations,<br/>answers questions" --> Accomplish
    Accomplish -- "Shows progress,<br/>asks permissions,<br/>presents results" --> User

    Accomplish -- "Sends prompts,<br/>receives AI responses<br/>(via OpenCode CLI)" --> CloudAI
    Accomplish -- "Sends prompts,<br/>receives AI responses<br/>(via OpenCode CLI)" --> LocalAI

    Accomplish -- "Reads, creates, moves,<br/>renames, deletes files<br/>(with user permission)" --> FileSystem

    Accomplish -- "Launches, navigates,<br/>clicks, fills forms,<br/>extracts data" --> ChromeBrowser
    ChromeBrowser -- "Accesses" --> SaaS

    Accomplish -- "Connects via OAuth 2.0,<br/>calls remote tools" --> MCPRemote

    Accomplish -- "Transcribes<br/>voice input" --> ElevenLabs
    Accomplish -- "Downloads<br/>skill definitions" --> GitHub
```

---

## Relationship Summary

| External Entity                                          | Integration Method                                      | Direction                | Auth                                 |
| -------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------------ |
| **Cloud AI Providers** (Anthropic, OpenAI, Google, etc.) | HTTP API via OpenCode CLI                               | Bidirectional            | API keys (AES-256-GCM encrypted)     |
| **Local AI Runtimes** (Ollama, LM Studio)                | HTTP API on localhost                                   | Bidirectional            | None (local)                         |
| **Local File System**                                    | OS file operations via OpenCode's Bash/Write/Read tools | Read + Write             | User permission dialog per operation |
| **Chromium Browser**                                     | Playwright CDP protocol (bundled)                       | Control                  | None (local process)                 |
| **Google Workspace**                                     | Browser automation (Playwright)                         | Read + Write             | User's browser session               |
| **Microsoft 365**                                        | Browser automation (Playwright)                         | Read + Write             | User's browser session               |
| **Notion / Slack / Dropbox**                             | Browser automation (Playwright)                         | Read + Write             | User's browser session               |
| **Any Website**                                          | Browser automation (Playwright)                         | Read + Write             | User's browser session               |
| **Remote MCP Servers**                                   | MCP protocol over HTTPS with OAuth 2.0                  | Bidirectional            | OAuth 2.0 + PKCE                     |
| **ElevenLabs**                                           | REST API                                                | Send audio, receive text | API key                              |
| **GitHub**                                               | HTTPS raw content download                              | Read only                | None (public repos)                  |

## Key Architectural Decisions at Context Level

1. **Local-first**: Accomplish runs entirely on the user's machine. No Accomplish backend exists. Data stays local.

2. **Bring-your-own-AI**: Users provide their own API keys or run local models. Accomplish is a tool, not a service.

3. **Browser as integration layer**: SaaS apps (Gmail, Sheets, Notion, Slack) are accessed via browser automation, not dedicated API integrations. This means no OAuth per service and no stored SaaS credentials — the user's existing browser sessions are reused.

4. **MCP for extensibility**: For direct API-level integrations, users can connect any MCP-compatible remote server with OAuth 2.0. This is the structured alternative to browser automation.

5. **Permission-gated file access**: Every file operation requires explicit user approval via a dialog. The gate is prompt-instructed (not hard-enforced) — see `task-flow-phases.md` Phase 5.
