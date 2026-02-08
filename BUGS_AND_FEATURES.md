# Bugs and Features

## Fixed Bugs

### ~~BUG-001: Permission API server never closed on app quit [HIGH]~~ FIXED
**File:** `apps/desktop/src/main/permission-api.ts` and `apps/desktop/src/main/index.ts`
**Fix:** Added `stopPermissionApiServer()` export that closes the server and rejects pending permissions. Called from `before-quit` in `index.ts`.

### ~~BUG-002: Duplicate IPC event listeners between Sidebar and Execution [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/renderer/components/layout/Sidebar.tsx` and `apps/desktop/src/renderer/stores/taskStore.ts`
**Fix:** Removed duplicate `onTaskUpdate` and `onTaskStatusChange` subscriptions from Sidebar. Moved status change and completion handling to global store listeners so sidebar always reflects current state regardless of which page is mounted.

### ~~BUG-003: Preload `startTask` parameter type mismatch [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/preload/index.ts:21`
**Fix:** Changed type from `{ description: string }` to `{ prompt: string; taskId?: string; sessionId?: string; workingDirectory?: string }` matching `TaskConfig`.

### ~~BUG-004: cancelTask sets ptyProcess to null before onExit fires [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/main/opencode/adapter.ts:242-248`
**Fix:** Removed `this.ptyProcess = null` from `cancelTask()`. Set `hasCompleted = true` before `kill()` to prevent duplicate completion. Let `handleProcessExit` handle cleanup consistently.

### ~~BUG-005: Stream parser buffer truncation can corrupt JSON messages [LOW]~~ FIXED
**File:** `apps/desktop/src/main/opencode/stream-parser.ts:25-29`
**Fix:** Changed buffer truncation to find the last newline boundary in the discard region, preserving complete JSON lines in the kept portion.

### ~~BUG-006: `accomplish.ts` interface has stale method names [LOW]~~ FIXED
**File:** `apps/desktop/src/renderer/lib/accomplish.ts:69-70`
**Fix:** Renamed `checkClaudeCli()` to `checkOpenCodeCli()` and `getClaudeVersion()` to `getOpenCodeVersion()` to match preload.

### ~~BUG-007: handleProcessExit clears currentTaskId prematurely [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/main/opencode/adapter.ts:633`
**Fix:** Removed `this.currentTaskId = null` from `handleProcessExit()`. Now only cleared in `dispose()`.

### ~~BUG-008: Sidebar `onTaskStatusChange` subscription inconsistency [LOW]~~ FIXED
**Fix:** Addressed as part of BUG-002 fix — removed all duplicate event subscriptions from Sidebar.

### ~~BUG-009: Execution page debounce timer not cleaned up on unmount [LOW]~~ FIXED
**File:** `apps/desktop/src/renderer/pages/Execution.tsx:46-52`
**Fix:** Added `cancel()` method to the debounce utility and call it in the useEffect cleanup, ensuring no stale timers fire after unmount.

### ~~BUG-010: Screen Agent responds with generic help offer instead of executing tasks [HIGH]~~ FIXED
**File:** `apps/desktop/src/main/opencode/config-generator.ts`
**Description:** The `screen-agent` (used by the OpenCode CLI for screen capture tasks) had no custom configuration in the generated `opencode.json`. The CLI's built-in default prompt causes the agent to respond with "I noticed you might need some help. Would you like me to look at your screen and assist you?" instead of actually executing the user's request (e.g., taking a screenshot).
**Fix:** Added a `screen-agent` agent definition to the generated config with a proper system prompt that instructs the agent to execute tasks immediately, take screenshots when asked, and never respond with generic help offers.

### ~~BUG-011: Screen Agent stuck on "Thinking..." forever [HIGH]~~ FIXED
**Description:** Related to BUG-010. Because the screen-agent responded with a generic help offer instead of executing tools, the task would never progress — no tool calls, no completion events. The UI shows "Thinking..." indefinitely because the task stays in `running` status with no new events.
**Fix:** Same as BUG-010 — with a proper system prompt, the agent executes tasks and produces completion events.

### ~~BUG-012: Home.tsx duplicate `onTaskUpdate` listener [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/renderer/pages/Home.tsx:91-104`
**Description:** Same class of issue as BUG-002. Home.tsx subscribed to `onTaskUpdate` and called `addTaskUpdate`, duplicating what the global store already handles for complete/error events.
**Fix:** Removed the `onTaskUpdate` subscription from Home.tsx. Kept `onPermissionRequest` subscription since it's needed during the brief window between task start and navigation to Execution page.

### ~~BUG-013: Summarizer API calls have no timeout [MEDIUM]~~ FIXED
**File:** `apps/desktop/src/main/services/summarizer.ts`
**Description:** All four LLM provider API calls (Anthropic, OpenAI, Google, xAI) in the summarizer used plain `fetch()` with no timeout. If a provider is slow or unresponsive, the summary generation hangs indefinitely, blocking the async task and wasting resources.
**Fix:** Added a `fetchWithTimeout` helper (matching the pattern already used in `handlers.ts`) with a 10-second timeout, and replaced all `fetch()` calls with `fetchWithTimeout()`.

## Open Bugs

_No open bugs remaining from this session._
