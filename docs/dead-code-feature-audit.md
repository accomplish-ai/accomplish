# Dead Code Feature Audit

Static review date: 2026-04-16
Last updated: 2026-04-16 (post PR #947, #948)

Scope: broad static scan for large dead or half-dead feature areas after the
thought-stream cleanup. This is not a full reachability proof. It highlights
high-value candidates for team review.

## Status snapshot

Of the 10 drop candidates + 1 live wiring gap surfaced on 2026-04-16:

- **9 resolved** — daemon task-config wiring (PR #947), GWS runtime gap
  (PR #947), 4 low-risk orphan deletions (PR #948: daemon/types.ts,
  daemon/cron-utils.ts, `__scratch__/`, desktop shims, `ws` dep),
  thought-stream stale docs (PR #950 — scan confirmed the only stale
  current-state mention was `daemon-final-architecture.md` line 16;
  other hits are already-correct tombstones or pre-marked historical),
  desktop OpenCode config generator (PR #951 — verified all 7
  exports had zero live callers; net −245 lines), and the desktop-control
  MCP feature + dead permission/question port plumbing.
- **2 still open** — completion continuation loop and "other task config
  features" follow-up audit (the latter is now largely closed by #947,
  but left open until product confirms knowledge-notes / cloud-browser /
  language flows end-to-end).

## Summary

The biggest remaining risks are not small unused helpers. They are either dead
feature surfaces that should be removed, or live features whose old wiring did
not fully survive the daemon migration.

Recommended sequence (updated):

1. ~~Finish current thought-stream cleanup leftovers.~~ **Resolved in
   PR #950** — one stale line removed from `daemon-final-architecture.md`
   (the only current-state doc still claiming the daemon was responsible
   for "thought streaming"); other hits are already-correct tombstones
   or pre-marked historical.
2. ~~Remove or rebuild `desktop-control`.~~ **Resolved** — the package,
   MCP registration, prompt advertising, bundle entry, UI permission
   branch, types, storage (column dropped via v031 migration), and the
   dead `permissionApiPort` / `questionApiPort` plumbing were all removed.
3. ~~Treat GWS as a live feature with a daemon-wiring gap; do not delete it.~~
   **Resolved in PR #947.** Daemon now materializes the GWS accounts manifest
   via `prepareGwsManifest` and registers `gws-mcp` / `gmail-mcp` /
   `calendar-mcp` per task.
4. ~~Decide product direction for connectors, cloud browser, knowledge notes,
   and language prompting.~~ **Wiring resolved in PR #947** — all five
   dropped features (GWS, connectors, knowledge notes, cloud browser,
   OpenAI `store: false`, UI language) now flow through `resolveTaskConfig`
   on the daemon path. Product audit still recommended to confirm UX.
5. ~~Remove old desktop OpenCode config generation after any needed behavior is
   migrated to the daemon.~~ **Resolved in PR #951** — deleted
   `apps/desktop/src/main/opencode/config-generator.ts` (−245 LOC) after
   verifying zero live importers for all 7 exported symbols. GWS manifest
   prep already lives in agent-core per PR #947.
6. ~~Clean small duplicate utilities and scratch files.~~ **Resolved in
   PR #948** — 6 P3 items deleted (-1483 LOC).

## Drop Candidates

| Candidate                                      | Priority | Status                           |                                      Rough size | Files to drop/edit                                                                                                                                                                                                                                                                                                                              | Original purpose                                                                                                                    | Why it appears dead now                                                                                                                                                                                                  | Recommendation                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | -------: | -------------------------------- | ----------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop-control` MCP feature                  |       P1 | **Resolved**                     | ~300 source LOC; larger with docs/tests/storage | Dropped `packages/agent-core/mcp-tools/desktop-control/`, MCP generator entry, bundle config, system-prompt advertising, desktop types, UI `desktop` permission branch, storage repository + `DesktopControlStorageAPI`, column (v031 drop migration), and the `permissionApiPort` / `questionApiPort` plumbing that only this package consumed | Let the agent control the desktop through screenshot, click, type, permissions, and blocklist actions                               | It was registered as a local MCP server, but the implementation only exported `serve()` and never set up an MCP stdio transport                                                                                          | Removed. Package deleted; prompt no longer advertises `desktop.*` tools; UI `PermissionDialog` narrows to `tool`/`file`/`question`; v031 migration drops the `app_settings.desktop_blocklist` column.                                                                                                                                 |
| Daemon bypasses old task-feature resolver      |       P1 | **Resolved (PR #947)**           |          Medium/large scattered feature surface | Mainly `apps/daemon/src/task-config-builder.ts`; possibly old resolver code after migration                                                                                                                                                                                                                                                     | Old resolver injected connectors, cloud browser config, knowledge notes, language prompting, and GWS manifests into OpenCode config | Live daemon task config is built directly and skips `resolveTaskConfig`, so multiple UI/storage features may not affect actual tasks                                                                                     | Daemon `task-config-builder.ts` now routes through `resolveTaskConfig`; all 6 dropped features restored. See PR #947 for wiring details.                                                                                                                                                                                              |
| Desktop OpenCode config generator              |       P2 | **Resolved (PR #951)**           |                                    ~250-350 LOC | Dropped `apps/desktop/src/main/opencode/config-generator.ts`                                                                                                                                                                                                                                                                                    | Desktop used to generate OpenCode config before daemon-owned task execution                                                         | Desktop OpenCode barrel no longer exports it, Slack OAuth notes the old call was removed, and daemon owns runtime config. GWS manifest prep (the last behavior this held that mattered) is now in agent-core per PR #947 | Deleted in PR #951 (−245 LOC). Per-symbol verification confirmed all 7 exports (`ACCOMPLISH_AGENT_NAME` re-export, `getMcpToolsPath`, `getOpenCodeConfigDir`, `generateOpenCodeConfig`, `getOpenCodeConfigPath`, `getOpenCodeAuthPath` re-export, `syncApiKeysToOpenCodeAuth` wrapper) had zero live callers outside the file itself. |
| Completion continuation loop                   |       P2 | **Open (deferred from PR #948)** |            ~150-300 LOC plus tests/prompts/docs | Edit `completion-enforcer.ts`, `OpenCodeAdapter.ts`, continuation prompts/tests/docs                                                                                                                                                                                                                                                            | PTY-era safety loop that nudged the agent to continue after partial completion or process exit                                      | SDK runtime no longer calls `handleStepFinish` or `handleProcessExit`; live completion uses SDK idle and complete-task observation                                                                                       | Remove carefully. The dormant branch shares state with live completion behavior, so keep complete-task detection and rewrite tests with care. PR #948 explicitly deferred this item because its ~600 LOC of test cascade does not fit a deletion-only sweep.                                                                          |
| Thought-stream stale docs                      |       P3 | **Resolved (PR #950)**           |                                       Docs only | Edit `docs/daemon-final-architecture.md`                                                                                                                                                                                                                                                                                                        | Document live thought/checkpoint streaming to UI                                                                                    | Runtime pipeline was deleted (PR #945), but docs still describe it as live                                                                                                                                               | Removed "thought streaming" from the daemon owner row of `daemon-final-architecture.md` (the only current-state doc still implying the feature was live). Other hits are already-correct tombstones (`functional-viewpoint.md:422`, `apps/daemon/src/index.ts:215-218`) or pre-marked HISTORICAL (`daemon-code-audit.md`).            |
| `ws` daemon dependency                         |       P3 | **Resolved (PR #948)**           |                                 Dependency only | `apps/daemon/package.json` and lockfile                                                                                                                                                                                                                                                                                                         | Supported deleted daemon WebSocket module                                                                                           | `apps/daemon/src/websocket.ts` is deleted and no daemon source imports `ws`                                                                                                                                              | Dropped from `apps/daemon/package.json` in PR #948. `ws` still appears in the lockfile via transitive consumers (Baileys, dev-browser), which is expected.                                                                                                                                                                            |
| `packages/agent-core/src/daemon/types.ts`      |       P3 | **Resolved (PR #948)**           |                                        ~200 LOC | Drop 1 file; update comments/tests if needed                                                                                                                                                                                                                                                                                                    | Alternate daemon RPC type definitions                                                                                               | Appears unimported and duplicates canonical daemon types in `common/types/daemon.ts`                                                                                                                                     | Deleted in PR #948. Canonical types live in `common/types/daemon.ts`.                                                                                                                                                                                                                                                                 |
| `packages/agent-core/src/daemon/cron-utils.ts` |       P3 | **Resolved (PR #948)**           |                                        ~150 LOC | Drop 1 file; update tests if needed                                                                                                                                                                                                                                                                                                             | Shared cron parsing helpers                                                                                                         | Appears unimported. Live scheduler/storage code carries its own cron parsing                                                                                                                                             | Deleted in PR #948. The two local `parseCronField` copies remain in `scheduler-service.ts` and `storage/repositories/scheduled-tasks.ts` (consolidating those into a shared helper is a separate, optional cleanup).                                                                                                                  |
| `apps/daemon/__scratch__/`                     |       P3 | **Resolved (PR #948)**           |                                          ~40 KB | Drop scratch directory                                                                                                                                                                                                                                                                                                                          | SDK spike and smoke-test experiments                                                                                                | Not runtime product code                                                                                                                                                                                                 | Deleted in PR #948; companion `**/__scratch__/**` ESLint ignore removed alongside.                                                                                                                                                                                                                                                    |
| Small desktop shims                            |       P3 | **Resolved (PR #948)**           |                                  <300 LOC total | Review `apps/desktop/src/main/config.ts`, `readJsonBody.ts`, `task-notification.ts`, `cli-error-utils.ts`, deprecated summarizer re-export                                                                                                                                                                                                      | Helpers from older desktop/main-process flows                                                                                       | Runtime imports appear absent in static search                                                                                                                                                                           | Deleted in PR #948 (4 of 5 listed): `config.ts` + its test + dead `vi.mock('@main/config', ...)` entries, `readJsonBody.ts` (parent dir gone), `task-notification.ts`, `cli-error-utils.ts`. Deprecated summarizer re-export was not part of the sweep — still pending a separate check.                                              |

## Live Wiring Gaps

| Area                              | Priority | Status                 |                                                 Rough size | Keep                                                                                          | Original purpose                                                                         | Current gap                                                                                                                     | Recommendation                                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------: | ---------------------- | ---------------------------------------------------------: | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GWS / Google Workspace task tools |       P1 | **Resolved (PR #947)** | Large: ~1.7k TS source LOC plus ~100k generated `dist` LOC | Google account UI/auth/storage, `gmail-mcp`, `calendar-mcp`, `gws-mcp`, file-picker MCP, docs | Let tasks use connected Google accounts for Gmail, Calendar, Workspace, and file picking | Daemon task config does not currently pass a GWS accounts manifest, so the MCP servers are not registered for real daemon tasks | `prepareGwsManifest` (pure helper in `packages/agent-core/src/google-accounts/`) now reads connected accounts, lazy-refreshes near-expiry tokens inline, and writes the per-task manifest. `resolveTaskConfig` step 7 wires it into the generated config. Daemon task config flows GWS end-to-end. |

## Notes By Area

### Desktop Control

**Status: resolved.** Removed in full.

The `desktop-control` MCP package, its local MCP registration, the system-prompt
"Desktop Automation" advertising, the bundle entry, the UI `'desktop'`
permission branch, the `BlocklistEntry` / `DesktopControlStorageAPI` types, the
storage repository, and the `app_settings.desktop_blocklist` column (dropped by
migration v031) are all gone. The dead `PERMISSION_API_PORT` (9226) /
`QUESTION_API_PORT` (9227) constants and the `permissionApiPort` /
`questionApiPort` option plumbing that only this package consumed were removed
in the same pass.

### GWS

**Status: resolved in PR #947.**

GWS is fully live on the daemon path as of PR #947. The per-task `gws-mcp` /
`gmail-mcp` / `calendar-mcp` servers are registered through `resolveTaskConfig`
step 7, which calls `prepareGwsManifest` to materialize the per-task manifest
file and lazy-refresh any near-expiry tokens inline.

Post-PR #947 state:

- `packages/agent-core/src/google-accounts/prepare-manifest.ts` reads
  `google_accounts` rows via direct SQL, refreshes tokens that are within
  `TOKEN_REFRESH_MARGIN_MS`, and writes both per-account token files and the
  manifest atomically.
- `resolveTaskConfig` consumes the returned manifest path + summary and sets
  `gwsAccountsManifestPath` + `gwsAccountsSummary` on the generated config.
- Desktop still owns the background refresh timer via `TokenManager`; daemon
  does best-effort lazy refresh as a belt-and-braces last line of defense for
  scheduled / WhatsApp tasks running without a live desktop.

Remaining desktop cleanup: ~~the old manifest producer at
`apps/desktop/src/main/opencode/config-generator.ts` is now fully orphan.~~
**Resolved in PR #951** — file deleted (−245 LOC).

### Other Task Config Features

**Status: wiring resolved in PR #947; workspace-meta split retired by the
v030 consolidation (this PR).**

User connectors, cloud browser config, workspace knowledge notes, language
prompting, and OpenAI `store: false` all now flow through `resolveTaskConfig`
on the daemon path per PR #947. The workspace-meta portion of that PR — the
daemon-side `initializeMetaDatabase` band-aid — has been superseded: the
`workspaces`, `workspace_meta`, and `knowledge_notes` tables now live in the
main `accomplish.db` (migration v030), and the retired `workspace-meta.db`
file is deleted from disk after a verified import. The daemon no longer
needs a second DB handle.

Evidence:

- Daemon `task-config-builder.ts` routes through `resolveTaskConfig` with
  `accomplishRuntime`, `accomplishStorageDeps`, `configFileName`, and the
  workspace-scoped `OnBeforeStartContext`.
- `apps/daemon/src/storage-service.ts` passes `legacyMetaDbPath` into
  `createStorage({ databasePath, legacyMetaDbPath, ... })` and, after
  `this.storage.initialize()` runs the in-DB import helper, calls
  `deleteLegacyWorkspaceMetaFiles(legacyMetaDbPath)` to retire the old
  file. No separate meta-DB handle is opened anywhere; the three
  workspace tables live in `accomplish.db` now.

### Completion Continuation

**Status: still open, explicitly deferred.**

Do not delete the whole completion system. The complete-task detection path is
still important. The likely-dead part is the older continuation-nudge branch
that depended on PTY-era lifecycle callbacks. Removal should be surgical because
the continuation state machine shares types/state with live completion handling.

Why it was deferred from PR #948: the dormant surface (`handleStepFinish`,
`handleProcessExit`, `onStartContinuation` callback, `getContinuationPrompt` /
`getPartialContinuationPrompt`, and most of the continuation-attempt
state-machine internals) is covered by ~600 LOC of tests that exercise behavior
no longer reachable from the runtime. Bundling that test refactor into a
deletion-only sweep would have blown up the diff. It needs its own PR where
the state-machine surgery and test changes can be reviewed as one unit.

Live parts to preserve: `handleCompleteTaskDetection`, `markTaskRequiresCompletion`,
`markToolsUsed`, `updateTodos`, `getState`, and the `complete_task` tool wiring
in `OpenCodeAdapter.handlePartUpdated`.

### Thought Stream

**Status: runtime deleted in PR #945; docs cleanup closed in PR #950.**

Runtime removal landed in PR #945. Post-cleanup scan (PR #950) found the only
remaining stale line in a current-state doc was `daemon-final-architecture.md`
line 16, which still listed "thought streaming" as a daemon responsibility in
the Owner table — removed. Other references are already-correct tombstones
that explicitly document the removal (e.g. `functional-viewpoint.md:422`,
`apps/daemon/src/index.ts:215-218`), or live inside `daemon-code-audit.md`
which is pre-marked HISTORICAL at the top of the file.

## PR cross-reference

| PR                                                           | Summary                                                                 | Audit items closed                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [#945](https://github.com/accomplish-ai/accomplish/pull/945) | Remove dead thought-stream reporting pipeline                           | Thought Stream runtime (docs closed by #950)                                                                                                |
| [#947](https://github.com/accomplish-ai/accomplish/pull/947) | Route daemon task config through resolveTaskConfig (restore 6 features) | Daemon resolver bypass (P1); GWS wiring gap (P1); connectors / cloud browser / knowledge notes / language / `store:false` (follow-up audit) |
| [#948](https://github.com/accomplish-ai/accomplish/pull/948) | Drop orphan files & unused ws dep (dead-code sweep P3)                  | `daemon/types.ts`, `daemon/cron-utils.ts`, `__scratch__/`, 4 desktop shims, `ws` daemon dep, eslint ignore cleanup                          |
| [#950](https://github.com/accomplish-ai/accomplish/pull/950) | Close thought-stream stale-docs item                                    | Thought-stream stale docs (P3) — `daemon-final-architecture.md` Owner table edit                                                            |
| [#951](https://github.com/accomplish-ai/accomplish/pull/951) | Drop orphan `apps/desktop/src/main/opencode/config-generator.ts`        | Desktop OpenCode config generator (P2) — −245 LOC, zero live callers across all 7 exports                                                   |
