<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.ar.md">العربية</a> | <strong>Bahasa Indonesia</strong>
</p>

<p align="center">
  <img src="docs/banner.svg" alt="Accomplish - Agen desktop AI open source yang mengotomatisasi manajemen file, pembuatan dokumen, dan tugas browser dengan kunci API AI Anda sendiri" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="Lisensi MIT" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/stargazers"><img src="https://img.shields.io/github/stars/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Stars" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/issues"><img src="https://img.shields.io/github/issues/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="GitHub Issues" /></a>
  <a href="https://github.com/accomplish-ai/accomplish/commits"><img src="https://img.shields.io/github/last-commit/accomplish-ai/accomplish?style=flat-square&color=22c55e" alt="Commit Terakhir" /></a>
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg"><img src="https://img.shields.io/badge/Download-macOS-0ea5e9?style=flat-square" alt="Unduh untuk macOS" /></a>
</p>

# WaIA (sebelumnya Accomplish) - Agen Desktop AI Open Source

WaIA adalah agen desktop AI open source yang mengotomatisasi manajemen file, pembuatan dokumen, dan tugas browser secara lokal di mesin Anda. Gunakan kunci API Anda sendiri (OpenAI, Anthropic, Google, Z.AI/GLM, xAI) atau jalankan model lokal melalui Ollama.

<p align="center">
  <strong>Berjalan secara lokal di mesin Anda. Gunakan kunci API atau model lokal Anda sendiri. Berlisensi MIT.</strong>
</p>

<p align="center">
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/macos/WaIA-0.3.8-mac-arm64.dmg"><strong>Unduh untuk Mac (Apple Silicon)</strong></a>
  ·
  <a href="https://downloads.accomplish.ai/downloads/0.3.8/windows/WaIA-v2-0.3.8-win-x64.exe"><strong>Unduh untuk Windows 11</strong></a>
  ·
  <a href="https://www.waia.ai/">Website WaIA</a>
  ·
  <a href="https://www.waia.ai/blog/">Blog WaIA</a>
  ·
  <a href="https://github.com/accomplish-ai/accomplish/releases">Rilis WaIA</a>
</p>

<br />

---

<br />

## Apa yang membuatnya berbeda

<table>
<tr>
<td width="50%" valign="top" align="center">

### 🖥️ Berjalan secara lokal

<div align="left">

- File Anda tetap di mesin Anda
- Anda yang memutuskan folder mana yang bisa diakses
- Tidak ada yang dikirim ke Accomplish (atau siapa pun)

</div>

</td>
<td width="50%" valign="top" align="center">

### 🔑 Bawa AI Anda sendiri

<div align="left">

- Gunakan kunci API Anda sendiri (OpenAI, Anthropic, dll.)
- Atau jalankan dengan [Ollama](https://ollama.com) (tanpa kunci API)
- Tanpa langganan, tanpa upsell
- Ini alat—bukan layanan

</div>

</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">

### 📖 Open source

<div align="left">

- Setiap baris kode ada di GitHub
- Berlisensi MIT
- Ubah, fork, rusak, perbaiki

</div>

</td>
<td width="50%" valign="top" align="center">

### ⚡ Bertindak, bukan hanya mengobrol

<div align="left">

- Manajemen file
- Pembuatan dokumen
- Otomatisasi kustom
- Pembelajaran skill

</div>

</td>
</tr>
</table>

<br />

---

<br />

## Apa yang sebenarnya dilakukan

| | | |
|:--|:--|:--|
| **📁 Manajemen File** | **✍️ Penulisan Dokumen** | **🔗 Koneksi Tools** |
| Urutkan, ganti nama, dan pindahkan file berdasarkan konten atau aturan yang Anda berikan | Minta untuk menulis, meringkas, atau menulis ulang dokumen | Bekerja dengan Notion, Google Drive, Dropbox, dan lainnya (melalui API lokal) |
| | | |
| **⚙️ Skill Kustom** | **🛡️ Kontrol Penuh** | |
| Tentukan workflow yang dapat diulang, simpan sebagai skill | Anda menyetujui setiap tindakan. Anda bisa melihat log. Anda bisa menghentikannya kapan saja. | |

<br />

## Kasus penggunaan

- Bersihkan folder berantakan berdasarkan proyek, tipe file, atau tanggal
- Buat draf, ringkas, dan tulis ulang dokumen, laporan, dan catatan rapat
- Otomatisasi workflow browser seperti riset dan pengisian formulir
- Hasilkan update mingguan dari file dan catatan
- Siapkan materi rapat dari dokumen dan kalender

<br />

## Model dan provider yang didukung

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
- Ollama (model lokal)
- LM Studio (model lokal)

<br />

## Privasi dan lokal-first

Accomplish berjalan secara lokal di mesin Anda. File Anda tetap di perangkat Anda, dan Anda memilih folder mana yang dapat diakses.

<br />

## Persyaratan sistem

- macOS (Apple Silicon)
- Windows 11

<br />

---

<br />

## Cara menggunakan

> **Setup hanya 2 menit.**

| Langkah | Aksi | Detail |
|:----:|--------|---------|
| **1** | **Install Aplikasi** | Unduh DMG dan seret ke Applications |
| **2** | **Hubungkan AI Anda** | Gunakan kunci API Google, OpenAI, Anthropic (atau lainnya) — atau masuk dengan ChatGPT (Plus/Pro). Tanpa langganan. |
| **3** | **Berikan Akses** | Pilih folder mana yang bisa dilihat. Anda tetap memegang kontrol. |
| **4** | **Mulai Bekerja** | Minta untuk meringkas dokumen, membersihkan folder, atau membuat laporan. Anda menyetujui semuanya. |

<br />


<br />

<div align="center">

[**Unduh untuk Mac (Apple Silicon)**](https://downloads.accomplish.ai/downloads/0.3.8/macos/Accomplish-0.3.8-mac-arm64.dmg) · [**Unduh untuk Windows 11**](https://downloads.accomplish.ai/downloads/0.3.8/windows/Accomplish-v2-0.3.8-win-x64.exe)

</div>

<br />

---

<br />

## Screenshot dan Demo

Sekilas tentang Accomplish di macOS, plus video demo singkat.

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">
    <img src="docs/video-thumbnail.png" alt="Demo Accomplish - Agen AI mengotomatisasi manajemen file dan tugas browser" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">Tonton demo →</a>
</p>

<br />

## FAQ

**Apakah Accomplish berjalan secara lokal?**
Ya. Accomplish berjalan secara lokal di mesin Anda dan Anda mengontrol folder mana yang dapat diakses.

**Apakah saya butuh kunci API?**
Anda bisa menggunakan kunci API Anda sendiri (OpenAI, Anthropic, Google, xAI, dll.) atau menjalankan model lokal melalui Ollama.

**Apakah Accomplish gratis?**
Ya. Accomplish adalah open source dan berlisensi MIT.

**Platform apa yang didukung?**
macOS (Apple Silicon) dan Windows 11 tersedia sekarang.

<br />

---

<br />

## Development

```bash
pnpm install
pnpm dev
```

Itu saja.

<details>
<summary><strong>Prasyarat</strong></summary>

- Node.js 20+
- pnpm 9+

</details>

<details>
<summary><strong>Semua perintah</strong></summary>

| Perintah | Deskripsi |
|---------|-------------|
| `pnpm dev` | Jalankan aplikasi desktop dalam mode dev |
| `pnpm dev:clean` | Mode dev dengan start bersih |
| `pnpm build` | Build semua workspace |
| `pnpm build:desktop` | Build aplikasi desktop saja |
| `pnpm lint` | Pemeriksaan TypeScript |
| `pnpm typecheck` | Validasi tipe |
| `pnpm -F @accomplish/desktop test:e2e` | Test E2E Playwright |

</details>

<details>
<summary><strong>Environment variables</strong></summary>

| Variabel | Deskripsi |
|----------|-------------|
| `CLEAN_START=1` | Hapus semua data tersimpan saat aplikasi mulai |
| `E2E_SKIP_AUTH=1` | Lewati alur onboarding (untuk testing) |

</details>

<details>
<summary><strong>Arsitektur</strong></summary>

```
apps/
  desktop/        # Aplikasi Electron (main + preload + renderer)
packages/
  shared/         # Tipe TypeScript bersama
```

Aplikasi desktop menggunakan Electron dengan UI React yang dibundle via Vite. Proses utama memunculkan [OpenCode](https://github.com/sst/opencode) CLI menggunakan `node-pty` untuk menjalankan tugas. Kunci API disimpan dengan aman di keychain OS.

Lihat [CLAUDE.md](CLAUDE.md) untuk dokumentasi arsitektur detail.

</details>

<br />

---

<br />

## Kontribusi

Kontribusi diterima! Silakan buka PR.

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

**[Website Accomplish](https://www.accomplish.ai/)** · **[Blog Accomplish](https://www.accomplish.ai/blog/)** · **[Rilis Accomplish](https://github.com/accomplish-ai/accomplish/releases)** · **[Issues](https://github.com/accomplish-ai/accomplish/issues)** · **[Twitter](https://x.com/Accomplish_ai)**

<br />

Lisensi MIT · Dibuat oleh [Accomplish](https://www.accomplish.ai)

<br />

**Kata kunci:** agen AI, agen desktop AI, otomatisasi desktop, manajemen file, pembuatan dokumen, otomatisasi browser, lokal-first, macOS, privasi-first, open source, Electron, penggunaan komputer, asisten AI, otomatisasi workflow, OpenAI, Anthropic, Google, xAI, Claude, GPT-4, Ollama

</div>
