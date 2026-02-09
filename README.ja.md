<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <strong>日本語</strong> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.ar.md">العربية</a> | <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <img src="docs/banner.svg" alt="Accomplish - 自分のAI APIキーでファイル管理、ドキュメント作成、ブラウザタスクを自動化するオープンソースAIデスクトップエージェント" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="MITライセンス" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/stargazers"><img src="https://img.shields.io/github/stars/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Stars" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/issues"><img src="https://img.shields.io/github/issues/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Issues" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/commits"><img src="https://img.shields.io/github/last-commit/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="最終コミット" /></a>
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg"><img src="https://img.shields.io/badge/Download-macOS-0ea5e9?style=flat-square" alt="macOS用ダウンロード" /></a>
</p>

# WaIA (旧Accomplish) - オープンソースAIデスクトップエージェント

WaIAは、お使いのマシン上でローカルにファイル管理、ドキュメント作成、ブラウザタスクを自動化するオープンソースAIデスクトップエージェントです。独自のAPIキー（OpenAI、Anthropic、Google、Z.AI/GLM、xAI）を使用するか、Ollama経由でローカルモデルを実行できます。

<p align="center">
  <strong>お使いのマシン上でローカルに実行。独自のAPIキーまたはローカルモデルを使用。MITライセンス。</strong>
</p>

<p align="center">
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/macos/WaIA-0.3.8-mac-arm64.dmg"><strong>Mac用ダウンロード（Apple Silicon）</strong></a>
  ·
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/windows/WaIA-v2-0.3.8-win-x64.exe"><strong>Windows 11用ダウンロード</strong></a>
  ·
  <a href="https://www.waia.ai/">WaIAウェブサイト</a>
  ·
  <a href="https://www.waia.ai/blog/">WaIAブログ</a>
  ·
  <a href="https://github.com/accomplish-ai/accomplish/releases">WaIAリリース</a>
</p>

<br />

---

<br />

## 他との違い

<table>
<tr>
<td width="50%" valign="top" align="center">

### 🖥️ ローカルで動作

<div align="left">

- ファイルはお使いのマシン上に保存
- アクセスできるフォルダを自分で決定
- WaIA（または他の誰か）にデータは送信されません

</div>

</td>
<td width="50%" valign="top" align="center">

### 🔑 自分のAIを使用

<div align="left">

- 独自のAPIキーを使用（OpenAI、Anthropicなど）
- または[Ollama](https://ollama.com)で実行（APIキー不要）
- サブスクリプションなし、アップセルなし
- サービスではなくツールです

</div>

</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">

### 📖 オープンソース

<div align="left">

- すべてのコードがGitHubに公開
- MITライセンス
- 変更、フォーク、壊す、修正する、自由自在

</div>

</td>
<td width="50%" valign="top" align="center">

### ⚡ チャットだけでなく実行

<div align="left">

- ファイル管理
- ドキュメント作成
- カスタム自動化
- スキル学習

</div>

</td>
</tr>
</table>

<br />

---

<br />

## 実際にできること

| | | |
|:--|:--|:--|
| **📁 ファイル管理** | **✍️ ドキュメント作成** | **🔗 ツール連携** |
| コンテンツやルールに基づいてファイルを整理、リネーム、移動 | ドキュメントの作成、要約、書き換えを指示 | Notion、Google Drive、Dropboxなどと連携（ローカルAPI経由） |
| | | |
| **⚙️ カスタムスキル** | **🛡️ 完全なコントロール** | |
| 繰り返しワークフローを定義してスキルとして保存 | すべてのアクションを承認。ログを確認可能。いつでも停止可能。 | |

<br />

## ユースケース

- プロジェクト、ファイルタイプ、日付でフォルダを整理
- ドキュメント、レポート、会議メモの作成、要約、書き換え
- 調査やフォーム入力などのブラウザワークフローを自動化
- ファイルとメモから週次アップデートを生成
- ドキュメントとカレンダーから会議資料を準備

<br />

## 対応モデルとプロバイダー

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
- Ollama（ローカルモデル）
- LM Studio（ローカルモデル）

<br />

## プライバシーとローカルファースト

Accomplishはお使いのマシン上でローカルに実行されます。ファイルはデバイス上に保存され、アクセスできるフォルダを選択できます。

<br />

## システム要件

- macOS（Apple Silicon）
- Windows 11

<br />

---

<br />

## 使い方

> **セットアップは2分で完了。**

| ステップ | アクション | 詳細 |
|:----:|--------|---------|
| **1** | **アプリをインストール** | DMGをダウンロードしてアプリケーションフォルダにドラッグ |
| **2** | **AIを接続** | Google、OpenAI、Anthropic（またはその他）のAPIキーを使用、またはChatGPT（Plus/Pro）でサインイン。サブスクリプションなし。 |
| **3** | **アクセス権を付与** | アクセス可能なフォルダを選択。あなたがコントロール。 |
| **4** | **作業開始** | ドキュメントの要約、フォルダの整理、レポートの作成を依頼。すべてを承認。 |

<br />


<br />

<div align="center">

[**Mac用ダウンロード（Apple Silicon）**](https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg) · [**Windows 11用ダウンロード**](https://downloads.accomplish.ai/downloads/0.3.8/windows/Accomplish-v2-0.3.8-win-x64.exe)

</div>

<br />

---

<br />

## スクリーンショットとデモ

macOSでのAccomplishの概要と、短いデモ動画。

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">
    <img src="docs/video-thumbnail.png" alt="Accomplishデモ - ファイル管理とブラウザタスクを自動化するAIエージェント" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">デモを見る →</a>
</p>

<br />

## よくある質問

**Accomplishはローカルで動作しますか？**
はい。Accomplishはお使いのマシン上でローカルに動作し、アクセスできるフォルダを制御できます。

**APIキーは必要ですか？**
独自のAPIキー（OpenAI、Anthropic、Google、xAIなど）を使用するか、Ollama経由でローカルモデルを実行できます。

**Accomplishは無料ですか？**
はい。AccomplishはオープンソースでMITライセンスです。

**どのプラットフォームに対応していますか？**
macOS（Apple Silicon）とWindows 11が利用可能です。

<br />

---

<br />

## 開発

```bash
pnpm install
pnpm dev
```

以上です。

<details>
<summary><strong>前提条件</strong></summary>

- Node.js 20+
- pnpm 9+

</details>

<details>
<summary><strong>すべてのコマンド</strong></summary>

| コマンド | 説明 |
|---------|-------------|
| `pnpm dev` | 開発モードでデスクトップアプリを実行 |
| `pnpm dev:clean` | クリーンスタートで開発モード |
| `pnpm build` | すべてのワークスペースをビルド |
| `pnpm build:desktop` | デスクトップアプリのみビルド |
| `pnpm lint` | TypeScriptチェック |
| `pnpm typecheck` | 型検証 |
| `pnpm -F @accomplish/desktop test:e2e` | Playwright E2Eテスト |

</details>

<details>
<summary><strong>環境変数</strong></summary>

| 変数 | 説明 |
|----------|-------------|
| `CLEAN_START=1` | アプリ起動時にすべての保存データをクリア |
| `E2E_SKIP_AUTH=1` | オンボーディングフローをスキップ（テスト用） |

</details>

<details>
<summary><strong>アーキテクチャ</strong></summary>

```
apps/
  desktop/        # Electronアプリ（main + preload + renderer）
packages/
  shared/         # 共有TypeScript型
```

デスクトップアプリはViteでバンドルされたReact UIを持つElectronを使用しています。メインプロセスは`node-pty`を使用して[OpenCode](https://github.com/sst/opencode) CLIを生成してタスクを実行します。APIキーはOSキーチェーンに安全に保存されます。

詳細なアーキテクチャドキュメントは[CLAUDE.md](CLAUDE.md)を参照してください。

</details>

<br />

---

<br />

## コントリビューション

コントリビューション歓迎！お気軽にPRを開いてください。

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

**[Accomplishウェブサイト](https://www.accomplish.ai/)** · **[Accomplishブログ](https://www.accomplish.ai/blog/)** · **[Accomplishリリース](https://github.com/accomplish-ai/accomplish/releases)** · **[Issues](https://github.com/accomplish-ai/accomplish/issues)** · **[Twitter](https://x.com/Accomplish_ai)**

<br />

MITライセンス · [Accomplish](https://www.accomplish.ai)製

<br />

**キーワード：** AIエージェント、AIデスクトップエージェント、デスクトップ自動化、ファイル管理、ドキュメント作成、ブラウザ自動化、ローカルファースト、macOS、プライバシーファースト、オープンソース、Electron、コンピューター使用、AIアシスタント、ワークフロー自動化、OpenAI、Anthropic、Google、xAI、Claude、GPT-4、Ollama

</div>
