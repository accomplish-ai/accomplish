const HIDDEN_TOOL_BASENAMES = ['discard', 'extract', 'context_info', 'prune', 'distill'] as const;

export const NON_TASK_CONTINUATION_TOOLS = [
  ...HIDDEN_TOOL_BASENAMES,
  'todowrite',
  'complete_task',
  'request_connector_auth',
  'AskUserQuestion',
  'report_checkpoint',
  'report_thought',
  'request_file_permission',
] as const;

function matchesToolNameOrSuffix(toolName: string, baseName: string): boolean {
  return toolName === baseName || toolName.endsWith(`_${baseName}`);
}

export function isNonTaskContinuationToolName(toolName: string): boolean {
  if (toolName === 'skill' || toolName.endsWith('_skill')) {
    return true;
  }
  if (toolName === 'start_task' || toolName.endsWith('_start_task')) {
    return true;
  }
  return NON_TASK_CONTINUATION_TOOLS.some((tool) => matchesToolNameOrSuffix(toolName, tool));
}

export function isHiddenToolName(toolName: string): boolean {
  return HIDDEN_TOOL_BASENAMES.some((tool) => matchesToolNameOrSuffix(toolName, tool));
}
