export function getContinuationPrompt(): string {
  return `You stopped without calling complete_task.

Check: have you finished everything the user asked?

- If yes → call complete_task with status: "success"
- If you hit a technical blocker → call complete_task with status: "blocked"
- Otherwise, keep working on the remaining items.`;
}

export function getPartialContinuationPrompt(
  remainingWork: string,
  originalRequest: string,
  completedSummary: string,
  incompleteTodos?: string,
): string {
  if (incompleteTodos) {
    return `Some todo items are still incomplete:

${incompleteTodos}

Mark each item as "completed" or "cancelled" using todowrite, then call complete_task.
If any items still need work, complete them first.`;
  }

  return `You indicated the task is only partially complete.

## Original Request
"${originalRequest}"

## What You Completed
${completedSummary}

## What Remains
${remainingWork}

## Continue Working

Review the original request, then:
1. Create a TODO list of remaining steps
2. Work through each item
3. Call complete_task with status "success" when done

If you hit a technical blocker (login wall, CAPTCHA, rate limit, site error), call complete_task with "blocked" status instead.
Keep working until the task is complete.`;
}
