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
