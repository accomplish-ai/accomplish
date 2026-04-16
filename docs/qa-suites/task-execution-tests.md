# Task Execution QA Suite

Tests covering task lifecycle, concurrency, and user-interaction prompts during execution.

---

## Task Lifecycle

| ID           | Scenario                          | Steps                                                         | Expected                                                                        |
| ------------ | --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| EXEC-LIFE-01 | Task starts successfully          | 1. Submit a prompt 2. Observe execution page                  | Task transitions to `running` state; execution log begins streaming             |
| EXEC-LIFE-02 | Task completes successfully       | 1. Submit a simple prompt with a deterministic outcome        | Task transitions to `completed`; result is displayed                            |
| EXEC-LIFE-03 | Task fails gracefully             | 1. Submit a prompt designed to trigger an unrecoverable error | Task transitions to `failed`; error message is displayed to the user            |
| EXEC-LIFE-04 | Task can be stopped mid-execution | 1. Start a long-running task 2. Click **Stop**                | Task transitions to `interrupted`; execution shows "Stopped" and stops promptly |

---

## Concurrency

| ID           | Scenario                                    | Steps                                                        | Expected                                                               |
| ------------ | ------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| EXEC-CONC-01 | Multiple tasks run in parallel              | 1. Submit three tasks back-to-back without waiting           | All three tasks run concurrently and each shows its own execution page |
| EXEC-CONC-02 | Switching between task pages                | 1. Start two tasks 2. Navigate between their execution pages | Each page shows the correct, isolated execution log for its task       |
| EXEC-CONC-03 | Completing one task does not affect another | 1. Run two tasks 2. Allow Task A to finish 3. Observe Task B | Task B continues running unaffected; its page updates correctly        |

---

## Execution Logs

| ID          | Scenario                          | Steps                                               | Expected                                                                     |
| ----------- | --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| EXEC-LOG-01 | Log streams in real time          | 1. Start a task 2. Watch the execution log          | New log lines appear as the agent produces them, without requiring a refresh |
| EXEC-LOG-02 | Log is scrollable                 | 1. Run a task that produces many log lines          | User can scroll through the full log history                                 |
| EXEC-LOG-03 | Log persists after task completes | 1. Let a task complete 2. Reload the execution page | Full log is still visible after reload                                       |

---

### Task-Scoped Permission Prompts

| ID             | Scenario                                   | Steps                                                                                              | Expected                                                              |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| EXEC-PROMPT-01 | Permission card scoped to originating task | 1. Start two tasks in parallel 2. One task triggers a file permission request                      | Permission card appears only on the originating task's execution page |
| EXEC-PROMPT-02 | Permission persists across task switches   | 1. Start a task that triggers a permission request 2. Switch to another task's page 3. Switch back | Permission card is still visible on the original task's page          |
| EXEC-PROMPT-03 | Question card scoped to originating task   | 1. Start a task that calls AskUserQuestion 2. Switch to another task's page                        | Question card appears only on the originating task's page             |

---

## OpenCode SDK Cutover Regression Suite (commercial PR #720 port)

Post-cutover checks that the PTY → SDK transition did not break user-facing behaviour. Run these after every release until a couple of releases have shipped cleanly.

| ID          | Scenario                                    | Steps                                                                                                                                           | Expected                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXEC-SDK-01 | Task spawns `opencode serve`, not the CLI   | 1. Cold-start daemon + desktop 2. Submit a task 3. Inspect daemon logs + process list                                                           | Daemon logs show `[OpenCode Server]` spawn line; no `opencode run --format json` invocation; no PTY process                                                                                                                                      |
| EXEC-SDK-02 | File-permission allow round-trip            | 1. Start a task that writes a file 2. When the permission card appears, click **Allow**                                                         | Task resumes; file is created; daemon logs show SDK `client.permission.reply({ reply: 'once' })` call                                                                                                                                            |
| EXEC-SDK-03 | File-permission deny round-trip             | 1. Start a task that writes a file 2. When the permission card appears, click **Deny**                                                          | Task reports the deny to the agent; agent either retries differently or completes with `denied`                                                                                                                                                  |
| EXEC-SDK-04 | Question prompt round-trip                  | 1. Start a task that calls the question equivalent in OpenCode 2. Answer the question                                                           | Task resumes with the user's selection; daemon logs show `client.question.reply(...)` call                                                                                                                                                       |
| EXEC-SDK-05 | Mid-task cancel propagates via SDK abort    | 1. Start a long-running task 2. Click **Stop**                                                                                                  | Task transitions to `interrupted` promptly; daemon logs show SDK abort, not SIGKILL of a CLI process                                                                                                                                             |
| EXEC-SDK-06 | Desktop reload mid-task hydrates            | 1. Start a task 2. Reload the desktop window while it is still running                                                                          | RPC reconnects; execution page hydrates with accumulated messages; task continues                                                                                                                                                                |
| EXEC-SDK-07 | WhatsApp-bound task auto-denies permissions | 1. Wire WhatsApp integration 2. Trigger a task from WhatsApp that hits a file-permission request                                                | No UI prompt appears; daemon logs show `wireTaskBridge` auto-deny via `taskService.sendResponse({ decision: 'deny' })`                                                                                                                           |
| EXEC-SDK-08 | Headless task (no UI connected) auto-denies | 1. Start daemon without desktop 2. Scheduler fires a task that hits a permission request                                                        | `task-callbacks.onPermissionRequest` auto-denies within ~100 ms (rpc.hasConnectedClients() → false); task does not hang                                                                                                                          |
| EXEC-SDK-09 | `dev-browser-mcp` frames still render       | 1. Start a task that uses `dev-browser-mcp` to navigate a page                                                                                  | Browser-preview panel shows page frames; adapter emits `'browser-frame'` events                                                                                                                                                                  |
| EXEC-SDK-11 | OpenAI ChatGPT OAuth sign-in end-to-end     | 1. Click "Sign in with ChatGPT" in Settings 2. Complete browser OAuth 3. Verify provider activates 4. Run a task using the ChatGPT subscription | Daemon logs show `auth.openai.startLogin` → `auth.openai.awaitCompletion` → `auth.openai.status` → `auth.openai.getAccessToken` RPCs; model dropdown populates with SDK-fetched OpenAI models (not hardcoded fallback); no PTY processes spawned |
| EXEC-SDK-12 | No `node-pty` bundled in packaged app       | 1. `electron-builder` build for macOS + Windows 2. Inspect packaged `.app` and daemon output                                                    | No `node_modules/node-pty/build/**/*.node` files; no `node-pty` dependency in either manifest                                                                                                                                                    |
