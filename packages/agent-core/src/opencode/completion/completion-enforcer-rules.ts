/**
 * Completion enforcer rule helpers
 *
 * Pure utility functions for evaluating completion conditions,
 * todo status checks, and conversational turn detection.
 * Also exports StepFinishAction type for shared use.
 * Extracted from CompletionEnforcer to keep file sizes under 200 lines.
 */

import type { TodoItem } from '../../common/types/todo.js';

export type StepFinishAction = 'continue' | 'pending' | 'complete';

/**
 * Returns true if any todo item is incomplete (pending or in_progress).
 */
export function hasIncompleteTodos(todos: TodoItem[]): boolean {
  return todos.some((t) => t.status === 'pending' || t.status === 'in_progress');
}

/**
 * Returns a formatted summary string of all incomplete todos.
 */
export function getIncompleteTodosSummary(todos: TodoItem[]): string {
  const incomplete = todos.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  return incomplete.map((t) => `- ${t.content}`).join('\n');
}

/**
 * Returns true if the current turn should be treated as a conversational
 * response (no task tools used, no task completion required).
 */
export function isConversationalTurn(
  taskToolsWereUsed: boolean,
  taskToolsWereUsedEver: boolean,
  taskRequiresCompletion: boolean,
): boolean {
  return !taskToolsWereUsed && !taskToolsWereUsedEver && !taskRequiresCompletion;
}
