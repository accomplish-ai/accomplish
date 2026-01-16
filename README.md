<p align="center">
  <img src="docs/banner.svg" alt="Openwork - The open source AI coworker that lives on your desktop" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/accomplish-ai/openwork/stargazers"><img src="https://img.shields.io/github/stars/accomplish-ai/openwork?style=flat-square&color=22c55e" alt="GitHub Stars" /></a>
  <a href="https://downloads.accomplish.ai/downloads/0.1.0/macos/Openwork-0.1.0-mac-arm64.dmg"><img src="https://img.shields.io/badge/Download-macOS-0ea5e9?style=flat-square" alt="Download" /></a>
  <a href="#linux"><img src="https://img.shields.io/badge/Download-Linux-f05032?style=flat-square" alt="Linux Download" /></a>
</p>

<p align="center">
  <a href="https://downloads.accomplish.ai/downloads/0.1.0/macos/Openwork-0.1.0-mac-arm64.dmg"><strong>Download for Mac (Apple Silicon)</strong></a>
</p>

<p align="center" id="linux">
  <a href="https://downloads.accomplish.ai/downloads/0.1.0/linux/Openwork-0.1.0-linux-x86_64.AppImage"><strong>Download for Linux (x86_64)</strong></a>
  <br />
  <small>AppImage format - works on all major Linux distributions</small>
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
- Nothing gets sent to Openwork (or anyone else)

</div>

</td>
<td width="50%" valign="top" align="center">

### 🔑  You bring your own AI

<div align="left">

- Use your own API key (OpenAI, Anthropic, etc.)
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

---

<br />

## How to use it

> **Takes 2 minutes to set up.**

### macOS

| Step | Action | Details |
|:----:|--------|---------|
| **1** | **Install the App** | Open the DMG and drag it into Applications |
| **2** | **Connect Your AI** | Use your own OpenAI or Anthropic API key. No subscriptions. |
| **3** | **Give It Access** | Choose which folders it can see. You stay in control. |
| **4** | **Start Working** | Ask it to summarize a doc, clean a folder, or create a report. You approve everything. |

### Linux (AppImage)

| Step | Action | Details |
|:----:|--------|---------|
| **1** | **Install Dependencies** | `sudo apt install libsecret-1-0` (Debian/Ubuntu) or `sudo pacman -S libsecret` (Arch) |
| **2** | **Download AppImage** | Get Openwork-0.1.0-linux-x86_64.AppImage |
| **3** | **Make Executable** | `chmod +x Openwork-*.AppImage` |
| **4** | **Run** | `./Openwork-*.AppImage` |

<div align="center">

[**Download for Mac (Apple Silicon)**](https://downloads.accomplish.ai/downloads/0.1.0/macos/Openwork-0.1.0-mac-arm64.dmg)

[**Download for Linux (x86_64)**](https://downloads.accomplish.ai/downloads/0.1.0/linux/Openwork-0.1.0-linux-x86_64.AppImage)

</div>

<br />

---

<br />

## See it in Action

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">
    <img src="docs/video-thumbnail.png" alt="Watch Demo" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">Watch the demo →</a>
</p>

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

**[Website](https://www.accomplish.ai/openwork/)** · **[GitHub](https://github.com/accomplish-ai/openwork)** · **[Issues](https://github.com/accomplish-ai/openwork/issues)**

<br />

MIT License · Built by [Accomplish](https://www.accomplish.ai)

</div>
