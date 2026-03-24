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

export function getPartialContinuationPrompt(
  remainingWork: string,
  originalRequest: string,
  completedSummary: string,
  incompleteTodos?: string,
): string {
  if (incompleteTodos) {
    return `Your complete_task call was rejected because these todo items are still marked incomplete:

${incompleteTodos}

Call todowrite to mark each item as "completed" or "cancelled", then call complete_task with status="success".

If any items are not done yet, complete them first.`;
  }

  return `You called complete_task with status="partial" but the task is not done yet.

## Original Request
"${originalRequest}"

## What You Completed
${completedSummary}

## What You Said Remains
${remainingWork}

## REQUIRED: Create a Continuation Plan

Before continuing, you MUST:

1. **Review the original request** - Re-read every requirement carefully
2. **Create a TODO list** showing what's done and what remains:

**Continuation Plan:**
✓ [Items you already completed]
□ [Next step] → verify: [how to confirm it's done]
□ [Following step] → verify: [how to confirm it's done]
...

3. **Execute the plan** - Work through each remaining step
4. **Call complete_task(success)** - Only when ALL original requirements are met

## IMPORTANT RULES

- Do NOT call complete_task with "partial" again unless you hit an actual TECHNICAL blocker
- If you hit a real blocker (login wall, CAPTCHA, rate limit, site error), use "blocked" status
- "partial" is NOT an acceptable final status - keep working until the task is complete
- Do NOT ask the user "would you like me to continue?" - just continue working

Now create your continuation plan and resume working on the remaining items.`;
}
