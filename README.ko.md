<p align="right">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <strong>한국어</strong> | <a href="README.es.md">Español</a> | <a href="README.tr.md">Türkçe</a> | <a href="README.ar.md">العربية</a> | <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <img src="docs/banner.svg" alt="Openwork - 자체 AI API 키로 파일 관리, 문서 작성, 브라우저 작업을 자동화하는 오픈소스 AI 데스크톱 에이전트" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat-square" alt="MIT 라이선스" /></a>
  <a href="https://github.com/accomplish-ai/openwork/stargazers"><img src="https://img.shields.io/github/stars/accomplish-ai/openwork?style=flat-square&color=22c55e" alt="GitHub Stars" /></a>
  <a href="https://github.com/accomplish-ai/openwork/issues"><img src="https://img.shields.io/github/issues/accomplish-ai/openwork?style=flat-square&color=22c55e" alt="GitHub Issues" /></a>
  <a href="https://github.com/accomplish-ai/openwork/commits"><img src="https://img.shields.io/github/last-commit/accomplish-ai/openwork?style=flat-square&color=22c55e" alt="최근 커밋" /></a>
  <a href="https://downloads.openwork.me/downloads/0.3.5/macos/Openwork-0.3.5-mac-arm64.dmg"><img src="https://img.shields.io/badge/Download-macOS-0ea5e9?style=flat-square" alt="macOS 다운로드" /></a>
</p>

# Openwork™ - 오픈소스 AI 데스크톱 에이전트

Openwork는 로컬 머신에서 파일 관리, 문서 작성, 브라우저 작업을 자동화하는 오픈소스 AI 데스크톱 에이전트입니다. 자체 API 키(OpenAI, Anthropic, Google, xAI)를 사용하거나 Ollama를 통해 로컬 모델을 실행하세요.

<p align="center">
  <strong>로컬 머신에서 실행. 자체 API 키 또는 로컬 모델 사용. MIT 라이선스.</strong>
</p>

<p align="center">
  <a href="https://downloads.openwork.me/downloads/0.3.5/macos/Openwork-0.3.5-mac-arm64.dmg"><strong>Mac용 Openwork 다운로드 (Apple Silicon)</strong></a>
  ·
  <a href="https://www.openwork.me/">Openwork 웹사이트</a>
  ·
  <a href="https://www.openwork.me/blog/">Openwork 블로그</a>
  ·
  <a href="https://github.com/accomplish-ai/openwork/releases">Openwork 릴리스</a>
</p>

<br />

---

<br />

## 무엇이 다른가

<table>
<tr>
<td width="50%" valign="top" align="center">

### 🖥️ 로컬에서 실행

<div align="left">

- 파일은 내 머신에 저장
- 접근 가능한 폴더를 직접 결정
- Openwork(또는 누구에게도)에 데이터가 전송되지 않음

</div>

</td>
<td width="50%" valign="top" align="center">

### 🔑 자체 AI 사용

<div align="left">

- 자체 API 키 사용 (OpenAI, Anthropic 등)
- 또는 [Ollama](https://ollama.com)로 실행 (API 키 불필요)
- 구독 없음, 업셀 없음
- 서비스가 아닌 도구

</div>

</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">

### 📖 오픈소스

<div align="left">

- 모든 코드가 GitHub에 공개
- MIT 라이선스
- 수정, 포크, 변경, 수정 자유

</div>

</td>
<td width="50%" valign="top" align="center">

### ⚡ 채팅만이 아닌 실행

<div align="left">

- 파일 관리
- 문서 작성
- 커스텀 자동화
- 스킬 학습

</div>

</td>
</tr>
</table>

<br />

---

<br />

## 실제 기능

| | | |
|:--|:--|:--|
| **📁 파일 관리** | **✍️ 문서 작성** | **🔗 도구 연결** |
| 콘텐츠나 규칙에 따라 파일 정리, 이름 변경, 이동 | 문서 작성, 요약, 재작성 지시 | Notion, Google Drive, Dropbox 등과 연동 (로컬 API 통해) |
| | | |
| **⚙️ 커스텀 스킬** | **🛡️ 완전한 제어** | |
| 반복 워크플로우를 정의하고 스킬로 저장 | 모든 작업을 승인. 로그 확인 가능. 언제든 중지 가능. | |

<br />

## 사용 사례

- 프로젝트, 파일 유형, 날짜별로 폴더 정리
- 문서, 보고서, 회의록 작성, 요약, 재작성
- 리서치 및 양식 작성 등 브라우저 워크플로우 자동화
- 파일과 노트에서 주간 업데이트 생성
- 문서와 캘린더에서 회의 자료 준비

<br />

## 지원 모델 및 제공업체

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
- Ollama (로컬 모델)
- LM Studio (로컬 모델)

<br />

## 프라이버시 및 로컬 우선

Openwork는 로컬 머신에서 실행됩니다. 파일은 기기에 저장되며, 접근 가능한 폴더를 선택할 수 있습니다.

<br />

## 시스템 요구 사항

- macOS (Apple Silicon)
- Windows 지원 예정

<br />

---

<br />

## 사용 방법

> **설정은 2분이면 완료.**

| 단계 | 작업 | 세부사항 |
|:----:|--------|---------|
| **1** | **앱 설치** | DMG 다운로드 후 응용 프로그램 폴더로 드래그 |
| **2** | **AI 연결** | Google, OpenAI, Anthropic (또는 기타) API 키 사용 또는 ChatGPT (Plus/Pro)로 로그인. 구독 없음. |
| **3** | **접근 권한 부여** | 접근 가능한 폴더 선택. 사용자가 제어. |
| **4** | **작업 시작** | 문서 요약, 폴더 정리, 보고서 생성 요청. 모든 작업 승인. |

<br />


<br />

<div align="center">

[**Mac용 다운로드 (Apple Silicon)**](https://downloads.openwork.me/downloads/0.3.5/macos/Openwork-0.3.5-mac-arm64.dmg)

</div>

<br />

---

<br />

## 스크린샷 및 데모

macOS에서의 Openwork 빠른 둘러보기와 짧은 데모 영상.

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">
    <img src="docs/video-thumbnail.png" alt="Openwork 데모 - 파일 관리 및 브라우저 작업을 자동화하는 AI 에이전트" width="600" />
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/UJ0FIufMOlc?si=iFcu3VTG4B4q9VCB">데모 보기 →</a>
</p>

<br />

## 자주 묻는 질문

**Openwork는 로컬에서 실행되나요?**
네. Openwork는 로컬 머신에서 실행되며, 접근 가능한 폴더를 제어할 수 있습니다.

**API 키가 필요한가요?**
자체 API 키 (OpenAI, Anthropic, Google, xAI 등)를 사용하거나 Ollama를 통해 로컬 모델을 실행할 수 있습니다.

**Openwork는 무료인가요?**
네. Openwork는 오픈소스이며 MIT 라이선스입니다.

**어떤 플랫폼을 지원하나요?**
macOS (Apple Silicon)는 현재 사용 가능합니다. Windows 지원은 곧 제공될 예정입니다.

<br />

---

<br />

## 개발

```bash
pnpm install
pnpm dev
```

끝입니다.

<details>
<summary><strong>사전 요구 사항</strong></summary>

- Node.js 20+
- pnpm 9+

</details>

<details>
<summary><strong>모든 명령어</strong></summary>

| 명령어 | 설명 |
|---------|-------------|
| `pnpm dev` | 개발 모드로 데스크톱 앱 실행 |
| `pnpm dev:clean` | 클린 스타트로 개발 모드 |
| `pnpm build` | 모든 워크스페이스 빌드 |
| `pnpm build:desktop` | 데스크톱 앱만 빌드 |
| `pnpm lint` | TypeScript 검사 |
| `pnpm typecheck` | 타입 검증 |
| `pnpm -F @accomplish/desktop test:e2e` | Playwright E2E 테스트 |

</details>

<details>
<summary><strong>환경 변수</strong></summary>

| 변수 | 설명 |
|----------|-------------|
| `CLEAN_START=1` | 앱 시작 시 모든 저장 데이터 삭제 |
| `E2E_SKIP_AUTH=1` | 온보딩 플로우 건너뛰기 (테스트용) |

</details>

<details>
<summary><strong>아키텍처</strong></summary>

```
apps/
  desktop/        # Electron 앱 (main + preload + renderer)
packages/
  shared/         # 공유 TypeScript 타입
```

데스크톱 앱은 Vite로 번들링된 React UI와 함께 Electron을 사용합니다. 메인 프로세스는 `node-pty`를 사용하여 [OpenCode](https://github.com/sst/opencode) CLI를 생성하여 작업을 실행합니다. API 키는 OS 키체인에 안전하게 저장됩니다.

자세한 아키텍처 문서는 [CLAUDE.md](CLAUDE.md)를 참조하세요.

</details>

<br />

---

<br />

## 기여

기여를 환영합니다! PR을 자유롭게 열어주세요.

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

**[Openwork 웹사이트](https://www.openwork.me/)** · **[Openwork 블로그](https://www.openwork.me/blog/)** · **[Openwork 릴리스](https://github.com/accomplish-ai/openwork/releases)** · **[Issues](https://github.com/accomplish-ai/openwork/issues)** · **[Twitter](https://x.com/openwork_ai)**

<br />

MIT 라이선스 · [Openwork](https://www.openwork.me) 제작

<br />

**키워드:** AI 에이전트, AI 데스크톱 에이전트, 데스크톱 자동화, 파일 관리, 문서 작성, 브라우저 자동화, 로컬 우선, macOS, 프라이버시 우선, 오픈소스, Electron, 컴퓨터 사용, AI 어시스턴트, 워크플로우 자동화, OpenAI, Anthropic, Google, xAI, Claude, GPT-4, Ollama

</div>
