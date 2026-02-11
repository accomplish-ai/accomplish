## Description

Add full internationalization (i18n) support to Accomplish. Ships English and Simplified Chinese, with architecture designed for easy addition of new languages.

**Three capabilities:**

1. **Static UI translation** — All user-facing strings across 38 components, 4 pages, store errors, and IPC messages are externalized into JSON locale files and rendered via `react-i18next`. Language switching is instant from Settings.

2. **Runtime agent translation** — The agent pipeline always runs in English in order to keep the logic in tact. For non-English users, translation happens at the boundaries: assistant messages, tool names, tool descriptions, progress messages, permission/question popups, and task summaries are all translated before reaching the UI. Uses the user's own connected API keys (Haiku, GPT-4o-mini, Gemini Flash — whichever is available).

3. **Developer tooling** — Scripts to auto-translate missing locale keys via Claude API, validate translation completeness in CI, and a guide for adding new languages.

---

### Architecture

**Four independent layers:**

**Layer 1 — Locale files** (`apps/desktop/locales/{en,zh-CN}/*.json`)
Seven namespaces (common, errors, execution, history, home, settings, sidebar) as plain JSON. Translators edit directly. The sync script diffs English vs target and fills missing keys with AI.

**Layer 2 — i18n modules** (one per Electron process)
- Main process (`src/main/i18n/index.ts`): reads JSON from disk, caches in memory, exposes `t()`, resolves `'auto'` via `app.getLocale()`.
- Renderer process (`src/renderer/i18n/index.ts`): initializes `i18next` + `react-i18next`, loads translations from main via IPC before React mounts, subscribes to language change broadcasts.
- Language preference persisted in SQLite (`app_settings.language`, migration v007).

**Layer 3 — Runtime translation service** (`src/main/services/translationService.ts`)
- Local language detection via Unicode codepoint ranges (CJK, Arabic, Cyrillic, Hebrew, Hangul, Kana) — instant, no API call.
- Translation via user's connected providers in priority order: Anthropic → OpenAI → Google → xAI → DeepSeek.
- LRU cache (500 entries) to avoid repeated API calls.
- Translates at the boundary in `task-callbacks.ts`: assistant messages, tool names/descriptions, progress messages, and permission request popups (header, question, options).
- Tool name display uses a curated `TOOL_DISPLAY_NAMES` map for known tools, with dynamic API translation fallback for unknown/external MCP tools.

**Layer 4 — MCP translation skill** (`skills/translate-content/`)
When the agent creates user-facing files (READMEs, docs), it calls `translate_to_user_language()` MCP tool → HTTP bridge on port 9228 → main process translation service. Separate Node process can't import Electron modules directly.

---

### IPC Channels Added

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `i18n:get-language` | Renderer → Main | Read stored preference |
| `i18n:set-language` | Renderer → Main | Write preference, trigger broadcast |
| `i18n:get-translations` | Renderer → Main | Load all JSON for a language |
| `i18n:get-supported-languages` | Renderer → Main | Return `['en', 'zh-CN']` |
| `i18n:get-resolved-language` | Renderer → Main | Return concrete language (never `'auto'`) |
| `i18n:language-changed` | Main → Renderer | Broadcast after switch |

---

### Product Decisions

- **Respond in the user's language**: When a user writes a message in a given language, the assistant's response is translated into that same language before it reaches the UI. The principle is simple: speak to me in my language, get an answer in my language. Language detection is automatic via Unicode codepoint analysis — no explicit user action needed. Not every langauge is supported. 
- **Translate the full surface, not just chat**: Translation extends beyond assistant messages to tool names, tool descriptions, progress indicators, permission/question popups, and task summaries. The entire experience feels native, not partially localized.
- **Disable "Auto" when the system language isn't supported**: If the OS locale doesn't map to any shipped language, the "Auto" option in Settings is grayed out and English is pre-selected. This avoids a confusing state where "Auto" silently falls back to English without explanation.
- **Agent-generated files can be translated too**: When the agent produces user-facing files (READMEs, docs), it can invoke the `translate_to_user_language()` MCP tool to deliver them in the user's language rather than always in English.
- **No extra API keys for translation**: Translation piggybacks on the user's already-connected provider keys, using the cheapest/fastest model available (Haiku, GPT-4o-mini, Gemini Flash). ~50-token calls keep cost and latency negligible — users don't need to opt into anything extra.
- **Language preference is explicit and persistent**: Users pick their language once in Settings. The choice is stored in SQLite and survives restarts. "Auto" resolves to the OS locale at startup so first-run experience matches the system language when supported.
- **English and Simplified Chinese ship first**: Chinese was chosen as the first non-English language. The architecture is designed so adding a new language is additive (new JSON files + one config entry).

---

### Key Design Decisions

- **Boundary translation over full-pipeline translation**: The agent, CLI, tool calls, and MCP servers all stay in English. Only user-visible input/output is translated. Surgical and low-risk.
- **User's own API keys for translation**: No extra credentials needed. ~50-token calls on small/fast models keep cost and latency negligible.
- **Local language detection**: Pure function over Unicode ranges. Runs on every message — an API call would add latency to every task start.
- **i18n init before React mount**: `main.tsx` awaits `initI18n()` before `createRoot().render()`, eliminating flash of untranslated keys.
- **Main process as language source of truth**: Persists to SQLite, broadcasts to all windows, resolves `'auto'` once. Renderer never sees `'auto'`.
- **Tool names handled at runtime, not in locale files**: Tool names are unbounded (any MCP server can expose any name). Known tools get curated display names from `TOOL_DISPLAY_NAMES` map; unknown tools are translated dynamically via the translation service.
- **Auto language disabled when unsupported**: If the system language doesn't match any supported language, the "Auto" option is grayed out and English is selected.

---

### Files Changed Summary

**83 files changed | ~6,800 lines added | ~550 removed**

| Category | Count | Details |
|----------|-------|---------|
| Locale files | 14 | 7 EN + 7 zh-CN JSON files |
| i18n infrastructure | 4 | Main i18n module, renderer i18n module, translation service, translation HTTP API |
| MCP skill | 4 | translate-content skill (SKILL.md, server, package.json, tsconfig) |
| Database migration | 1 | v007: `language` column on `app_settings` |
| Scripts & CI | 5 | sync-translations, validate-translations, README, 2 GitHub workflows |
| UI components | 38 | All pages, layout, settings, skills, and misc components |
| IPC/preload | 3 | handlers.ts (6 i18n handlers + summary translation), task-callbacks.ts (boundary translation), preload (i18n API) |
| Renderer bootstrap | 2 | main.tsx (await initI18n), App.tsx (error translations) |
| Core package | 2 | index.ts (i18n exports), appSettings.ts (UILanguage type, get/setLanguage) |
| Package configs | 3 | package.json scripts, desktop dependencies, CONTRIBUTING.md |

---

### New Dependencies

| Package | Purpose |
|---------|---------|
| `i18next` | Core i18n framework |
| `react-i18next` | React bindings for i18next |
| `i18next-browser-languagedetector` | Browser language detection |

## Type of Change

- [x] `feat`: New feature or functionality

## Checklist

- [x] PR title follows conventional commit format (e.g., `feat: add dark mode support`)
- [x] Changes have been tested locally
- [x] Any new dependencies are justified

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->
