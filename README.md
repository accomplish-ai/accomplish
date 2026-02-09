<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.ar.md">العربية</a> | <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <img src="docs/banner.svg" alt="Accomplish - Open source AI desktop agent that automates file management, document creation, and browser tasks with your own AI API keys" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/stargazers"><img src="https://img.shields.io/github/stars/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Stars" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/issues"><img src="https://img.shields.io/github/issues/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Issues" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/commits"><img src="https://img.shields.io/github/last-commit/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="Last Commit" /></a>
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg"><img src="https://img.shields.io/badge/Download-macOS-0ea5e9?style=flat-square" alt="Download for macOS" /></a>
</p>

# WaIA (formerly Accomplish) - Open Source AI Desktop Agent

> **📌 Note:** This is a personalized fork of Accomplish rebranded as "WaIA" with Spanish language support by [jivagrisma](https://github.com/jivagrisma/clone-Openwork). The original project is available at [accomplish-ai/accomplish](https://github.com/accomplish-ai/accomplish).

## 🤖 ¿Qué es WaIA?

**WaIA** es un **agente de escritorio de IA** que automatiza la gestión de archivos, la creación de documentos y las tareas del navegador **localmente en tu equipo**.

### Características principales:

- 🖥️ **Ejecución 100% local**: Tus archivos nunca salen de tu máquina
- 🔑 **Trae tu propia IA**: Usa tus claves API (OpenAI, Anthropic, Google, xAI, Z.AI/GLM) o modelos locales vía Ollama
- 🌍 **Español por defecto**: Idioma español (Latinoamérica) configurado como predeterminado
- 📂 **Gestión de archivos inteligente**: Organiza, renombra y mueve archivos según su contenido
- 📝 **Creación de documentos**: Redacta, resume y reescribe documentos y notas
- 🌐 **Automatización del navegador**: Automatiza flujos de trabajo en páginas web
- ⚙️ **Skills personalizados**: Define flujos de trabajo repetibles y guárdalos como skills
- 🛡️ **Control total**: Aprueba cada acción antes de ejecutarse

**🌍 Default Language:** This version comes with Spanish (Latin America) as the default language, with English available as a fallback.

<p align="center">
  <strong>Runs locally on your machine. Bring your own API keys or local models. MIT licensed.</strong>
</p>

<p align="center">
  <strong>Descargas disponibles:</strong>
  <br><br>
  <a href="https://github.com/jivagrisma/clone-Openwork/releases"><strong>📥 Releases de WaIA</strong></a>
  ·
  <a href="https://github.com/jivagrisma/clone-Openwork"><strong>💻 Código Fuente</strong></a>
</p>

<br />

---

<br />

## What makes it different

<table>
<tr>
<td width="50%" valign="top" align="center">

### 🖥️  It runs locally

<div align="left">

- Your files stay on your machine
- You decide which folders it can touch
- Nothing gets sent to Accomplish (or anyone else)

</div>

</td>
<td width="50%" valign="top" align="center">

### 🔑  You bring your own AI

<div align="left">

- Use your own API key (OpenAI, Anthropic, etc.)
- Or run with [Ollama](https://ollama.com) (no API key needed)
- No subscription, no upsell
- It's a tool—not a service

</div>

</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">

### 📖  It's open source

<div align="left">

- Every line of code is on GitHub
- MIT licensed
- Change it, fork it, break it, fix it

</div>

</td>
<td width="50%" valign="top" align="center">

### ⚡  It acts, not just chats

<div align="left">

- File management
- Document creation
- Custom automations
- Skill learning

</div>

</td>
</tr>
</table>

<br />

---

<br />

## What it actually does

| | | |
|:--|:--|:--|
| **📁 File Management** | **✍️ Document Writing** | **🔗 Tool Connections** |
| Sort, rename, and move files based on content or rules you give it | Prompt it to write, summarize, or rewrite documents | Works with Notion, Google Drive, Dropbox, and more (through local APIs) |
| | | |
| **⚙️ Custom Skills** | **🛡️ Full Control** | |
| Define repeatable workflows, save them as skills | You approve every action. You can see logs. You can stop it anytime. | |

<br />

## Use cases

- Clean up messy folders by project, file type, or date
- Draft, summarize, and rewrite docs, reports, and meeting notes
- Automate browser workflows like research and form entry
- Generate weekly updates from files and notes
- Prepare meeting materials from docs and calendars

<br />

## Supported models and providers

- Anthropic (Claude)
- OpenAI (GPT)
- Google AI (Gemini)
- xAI (Grok)
- DeepSeek
- Moonshot AI (Kimi)
- Z.AI (GLM)
- MiniMax
- Amazon Bedrock
- Azure Foundry
- OpenRouter
- LiteLLM
- Ollama (local models)
- LM Studio (local models)

<br />

## Privacy and local-first

WaIA runs locally on your machine. Your files stay on your device, and you choose which folders it can access.

**WaIA respeta tu privacidad:**
- ✅ Tus archivos nunca salen de tu máquina
- ✅ Tú eliges qué carpetas puede acceder
- ✅ Nada se envía a servicios externos sin tu consentimiento
- ✅ Código 100% abierto y auditable

<br />

## System requirements

- macOS (Apple Silicon)
- Windows 11
- **Linux (Ubuntu 24.04+, Debian, Fedora, etc.)** - Disponible como **AppImage** portable

### 📦 Instalar en Linux con AppImage

1. **Descargar el AppImage desde [Releases](https://github.com/jivagrisma/clone-Openwork/releases)**

2. **Hacer el archivo ejecutable:**
   ```bash
   chmod +x WaIA-*.AppImage
   ```

3. **Ejecutar:**
   ```bash
   ./WaIA-*.AppImage
   ```

Opcionalmente, puedes copiarlo a una carpeta en tu PATH:
```bash
sudo cp WaIA-*.AppImage /usr/local/bin/waia
sudo chmod +x /usr/local/bin/waia
```

### 🛠️ Construir AppImage desde el código fuente

Si prefieres construir el AppImage tú mismo:

```bash
# Clonar el repositorio
git clone https://github.com/jivagrisma/clone-Openwork.git
cd clone-Openwork/apps/desktop

# Instalar dependencias
pnpm install

# Descargar binarios de Node.js (requerido para el empaquetado)
pnpm download:nodejs

# Construir AppImage
pnpm package:linux

# El AppImage se generará en: release/WaIA-0.3.8-linux-x86_64.AppImage
```

<br />

---

<br />

## How to use it

> **Takes 2 minutes to set up.**

| Step | Action | Details |
|:----:|--------|---------|
| **1** | **Install the App** | Download the DMG and drag it into Applications |
| **2** | **Connect Your AI** | Use your own Google, OpenAI, Anthropic (or other) API key — or sign in with ChatGPT (Plus/Pro). No subscriptions. |
| **3** | **Give It Access** | Choose which folders it can see. You stay in control. |
| **4** | **Start Working** | Ask it to summarize a doc, clean a folder, or create a report. You approve everything. |

<br />


<br />

<div align="center">

[**Download for Mac (Apple Silicon)**](https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg) · [**Download for Windows 11**](https://downloads.accomplish.ai/downloads/0.3.8/windows/Accomplish-v2-0.3.8-win-x64.exe)

</div>

<br />

---

<br />

## Screenshots and Demo

A quick look at WaIA on macOS, plus a short demo video.

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">
    <img src="docs/video-thumbnail.png" alt="Accomplish demo - AI agent automating file management and browser tasks" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">Watch the demo →</a>
</p>

<br />

## FAQ

**Does Accomplish run locally?**  
Yes. Accomplish runs locally on your machine and you control which folders it can access.

**Do I need an API key?**  
You can use your own API keys (OpenAI, Anthropic, Google, xAI, etc.) or run local models via Ollama.

**Is Accomplish free?**  
Yes. Accomplish is open source and MIT licensed.

**Which platforms are supported?**
macOS (Apple Silicon) and Windows 11 are available now.

<br />

---

<br />

## Development

```bash
pnpm install
pnpm dev
```

That's it.

<details>
<summary><strong>Prerequisites</strong></summary>

- Node.js 20+
- pnpm 9+

</details>

<details>
<summary><strong>All Commands</strong></summary>

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run desktop app in dev mode |
| `pnpm dev:clean` | Dev mode with clean start |
| `pnpm build` | Build all workspaces |
| `pnpm build:desktop` | Build desktop app only |
| `pnpm lint` | TypeScript checks |
| `pnpm typecheck` | Type validation |
| `pnpm -F @accomplish/desktop test:e2e` | Playwright E2E tests |

</details>

<details>
<summary><strong>Environment Variables</strong></summary>

| Variable | Description |
|----------|-------------|
| `CLEAN_START=1` | Clear all stored data on app start |
| `E2E_SKIP_AUTH=1` | Skip onboarding flow (for testing) |

</details>

<details>
<summary><strong>Architecture</strong></summary>

```
apps/
  desktop/        # Electron app (main + preload + renderer)
packages/
  shared/         # Shared TypeScript types
```

The desktop app uses Electron with a React UI bundled via Vite. The main process spawns [OpenCode](https://github.com/sst/opencode) CLI using `node-pty` to execute tasks. API keys are stored securely in the OS keychain.

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

</details>

<br />

---

<br />

## Contributing

Contributions welcome! Feel free to open a PR.

```bash
# Fork → Clone → Branch → Commit → Push → PR
git checkout -b feature/amazing-feature
git commit -m 'Add amazing feature'
git push origin feature/amazing-feature
```

<br />

---

<br />

<div align="center">

**[Accomplish website](https://www.accomplish.ai/)** · **[Accomplish blog](https://www.accomplish.ai/blog/)** · **[Accomplish releases](https://github.com/accomplish-ai/accomplish/releases)** · **[Issues](https://github.com/accomplish-ai/accomplish/issues)** · **[Twitter](https://x.com/Accomplish_ai)**

<br />

MIT License · Built by [Accomplish](https://www.accomplish.ai)

<br />

**Keywords:** AI agent, AI desktop agent, desktop automation, file management, document creation, browser automation, local-first, macOS, privacy-first, open source, Electron, computer use, AI assistant, workflow automation, OpenAI, Anthropic, Google, xAI, Claude, GPT-4, Ollama

</div>
