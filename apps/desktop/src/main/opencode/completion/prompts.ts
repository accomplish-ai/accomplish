/**
 * Prompt templates for continuation and verification flows.
 *
 * PROMPT DESIGN RATIONALE:
 *
 * CONTINUATION PROMPT:
 * - Non-aggressive tone to avoid interrupting in-progress work
 * - Asks agent to self-assess "Have I actually finished?" before acting
 * - "CONTINUE WORKING" as first option - ensures agent finishes work before signaling completion
 * - Lists all three statuses so agent picks the appropriate one
 * - Explicit "Keep working if there's more to do" reinforces work-first priority
 *
 * VERIFICATION PROMPT:
 * - Uses screenshot because browser automation tasks often claim success without
 *   confirming UI state actually changed
 * - Echoes back the agent's own summary and original request for comparison
 * - Requires re-calling complete_task(success) only if screenshot proves completion
 * - If criteria not met, agent continues working (no complete_task call)
 */

export function getContinuationPrompt(): string {
  return `REMINDER: You must call complete_task when finished.

Before proceeding, ask yourself: "Have I actually finished everything the user asked?"

- If NO, you haven't finished yet → CONTINUE WORKING on the task
- If YES, all parts are done → Call complete_task with status: "success"
- If you hit a blocker → Call complete_task with status: "blocked"
- If some parts done, some not → Call complete_task with status: "partial"

Do NOT call complete_task until you have actually completed the user's request.
Keep working if there's more to do.`;
}

export function getVerificationPrompt(summary: string, originalRequest: string): string {
  return `VERIFICATION REQUIRED.

You claimed to have completed the task with this summary:
"${summary}"

The original request was:
"${originalRequest}"

Before I accept completion, you MUST verify your work:

1. Take a screenshot of the current browser state using the browser tool
2. Review your plan's completion criteria
3. Compare the screenshot against each criterion

Then either:
- If ALL criteria are met: Call complete_task again with status="success"
- If ANY criteria are NOT met: Continue working to complete them

Do NOT call complete_task with success unless the screenshot proves the task is done.`;
}
