/**
 * CompletionEnforcer coordinates the completion enforcement flow.
 * Uses the explicit CompletionState machine and delegates actual task
 * spawning to the adapter via callbacks.
 *
 * PURPOSE: Ensures agents properly finish tasks instead of stopping prematurely.
 *
 * ENFORCEMENT MECHANISMS:
 *
 * 1. CONTINUATION PROMPTS (if agent stops without calling complete_task):
 *    - Agent sometimes stops mid-task (API limits, confusion, etc.)
 *    - We detect this on step_finish with reason='stop' but no complete_task call
 *    - Spawn a session resumption with a firm reminder to call complete_task
 *    - Retry up to 50 times before giving up
 *
 * 2. PARTIAL CONTINUATION (if agent calls complete_task with partial status):
 *    - Agent completed some work but not all (or success downgraded due to incomplete todos)
 *    - Spawn a session resumption with remaining work context
 *    - Agent continues working on remaining items
 *
 * CALLBACK PATTERN:
 * - Enforcer is decoupled from adapter via callbacks
 * - onStartContinuation: adapter spawns session resumption
 * - onComplete: adapter emits the 'complete' event
 * - onDebug: adapter emits debug info for the UI debug panel
 */

import { CompletionState, CompletionFlowState, CompleteTaskArgs } from './completion-state';
import { getContinuationPrompt, getPartialContinuationPrompt } from './prompts';
import type { TodoItem } from '@accomplish/shared';

export interface CompletionEnforcerCallbacks {
  onStartContinuation: (prompt: string) => Promise<void>;
  onComplete: () => void;
  onDebug: (type: string, message: string, data?: unknown) => void;
}

export type StepFinishAction = 'continue' | 'pending' | 'complete';

export class CompletionEnforcer {
  private state: CompletionState;
  private callbacks: CompletionEnforcerCallbacks;
  private currentTodos: TodoItem[] = [];
  private toolsWereUsed: boolean = false;

  constructor(callbacks: CompletionEnforcerCallbacks, maxContinuationAttempts: number = 20) {
    this.callbacks = callbacks;
    this.state = new CompletionState(maxContinuationAttempts);
  }

  /**
   * Update current todos from todowrite tool.
   */
  updateTodos(todos: TodoItem[]): void {
    this.currentTodos = todos;
    this.callbacks.onDebug(
      'todo_update',
      `Todo list updated: ${todos.length} items`,
      { todos }
    );
  }

  /**
   * Mark that tools were used during this task invocation.
   * Called by the adapter when any tool_call or tool_use is detected.
   */
  markToolsUsed(): void {
    this.toolsWereUsed = true;
  }

  /**
   * Called by adapter when complete_task tool detected.
   * Returns true if this was a new detection (not already processed).
   */
  handleCompleteTaskDetection(toolInput: unknown): boolean {
    // Already processed complete_task in current flow
    if (this.state.isCompleteTaskCalled()) {
      return false;
    }

    const args = toolInput as {
      status?: string;
      summary?: string;
      original_request_summary?: string;
      remaining_work?: string;
    };

    const completeTaskArgs: CompleteTaskArgs = {
      status: args?.status || 'unknown',
      summary: args?.summary || '',
      original_request_summary: args?.original_request_summary || '',
      remaining_work: args?.remaining_work,
    };

    // If claiming success but have incomplete todos, downgrade to partial BEFORE recording state
    // This ensures the state machine enters the partial continuation path instead of success/verification
    if (completeTaskArgs.status === 'success' && this.hasIncompleteTodos()) {
      this.callbacks.onDebug(
        'incomplete_todos',
        'Agent claimed success but has incomplete todos - downgrading to partial',
        { incompleteTodos: this.getIncompleteTodosSummary() }
      );
      // Downgrade status to partial and set remaining work
      completeTaskArgs.status = 'partial';
      completeTaskArgs.remaining_work = this.getIncompleteTodosSummary();
    }

    this.state.recordCompleteTaskCall(completeTaskArgs);

    this.callbacks.onDebug(
      'complete_task',
      `complete_task detected with status: ${completeTaskArgs.status}`,
      { args: completeTaskArgs, state: CompletionFlowState[this.state.getState()] }
    );

    return true;
  }

  /**
   * Called by adapter on step_finish event.
   * Returns action to take:
   * - 'continue': More steps expected, don't emit complete
   * - 'pending': Verification or continuation pending, don't emit complete
   * - 'complete': Task is done, emit complete
   */
  handleStepFinish(reason: string): StepFinishAction {
    // Only handle 'stop' or 'end_turn' (final completion)
    if (reason !== 'stop' && reason !== 'end_turn') {
      return 'continue';
    }

    // Check if partial continuation is needed
    if (this.state.isPendingPartialContinuation()) {
      this.callbacks.onDebug(
        'partial_continuation',
        'Scheduling continuation for partial completion',
        { remainingWork: this.state.getCompleteTaskArgs()?.remaining_work }
      );
      return 'pending'; // Let handleProcessExit start partial continuation
    }

    // Check if agent stopped without calling complete_task
    if (!this.state.isCompleteTaskCalled()) {
      // If no tools were used, this was a conversational response (e.g., "hey").
      // Don't force continuation — just complete the task.
      if (!this.toolsWereUsed) {
        this.callbacks.onDebug(
          'skip_continuation',
          'No tools used and no complete_task called — treating as conversational response'
        );
        return 'complete';
      }

      // Tools were used but no complete_task — agent stopped prematurely
      if (this.state.scheduleContinuation()) {
        this.callbacks.onDebug(
          'continuation',
          `Scheduled continuation prompt (attempt ${this.state.getContinuationAttempts()})`
        );
        return 'pending';
      }

      // Max retries reached or invalid state
      console.warn(`[CompletionEnforcer] Agent stopped without complete_task. State: ${CompletionFlowState[this.state.getState()]}, attempts: ${this.state.getContinuationAttempts()}/${this.state.getMaxContinuationAttempts()}`);
    }

    // Task is complete (either complete_task called and verified, or max retries)
    return 'complete';
  }

  /**
   * Called by adapter on process exit.
   * Triggers verification or continuation if pending.
   */
  async handleProcessExit(exitCode: number): Promise<void> {
    // Check if we need to continue after partial completion
    if (this.state.isPendingPartialContinuation() && exitCode === 0) {
      const args = this.state.getCompleteTaskArgs();
      const prompt = getPartialContinuationPrompt(
        args?.remaining_work || 'No remaining work specified',
        args?.original_request_summary || 'Unknown request',
        args?.summary || 'No summary provided'
      );

      const canContinue = this.state.startPartialContinuation();

      if (!canContinue) {
        console.warn('[CompletionEnforcer] Max partial continuation attempts reached');
        this.callbacks.onComplete();
        return;
      }

      this.callbacks.onDebug(
        'partial_continuation',
        `Starting partial continuation (attempt ${this.state.getContinuationAttempts()})`,
        { remainingWork: args?.remaining_work, summary: args?.summary }
      );

      // Reset tool-use flag so the next invocation is evaluated fresh
      this.toolsWereUsed = false;
      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    // Check if we need to continue (agent stopped without complete_task)
    if (this.state.isPendingContinuation() && exitCode === 0) {
      const prompt = getContinuationPrompt();

      this.state.startContinuation();

      this.callbacks.onDebug(
        'continuation',
        `Starting continuation task (attempt ${this.state.getContinuationAttempts()})`
      );

      // Reset tool-use flag so the next invocation is evaluated fresh
      this.toolsWereUsed = false;
      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    // No pending actions - complete the task
    // This handles:
    // - DONE: complete_task called with success status
    // - BLOCKED: complete_task called with blocked status
    // - IDLE: process exited cleanly without triggering completion flow
    // - MAX_RETRIES_REACHED: exhausted all continuation attempts
    this.callbacks.onComplete();
  }

  /**
   * Check if state indicates task should be marked complete.
   */
  shouldComplete(): boolean {
    return this.state.isDone() ||
           this.state.getState() === CompletionFlowState.BLOCKED ||
           this.state.getState() === CompletionFlowState.MAX_RETRIES_REACHED;
  }

  /**
   * Reset for new task.
   */
  reset(): void {
    this.state.reset();
    this.currentTodos = [];
    this.toolsWereUsed = false;
  }

  private hasIncompleteTodos(): boolean {
    return this.currentTodos.some(
      t => t.status === 'pending' || t.status === 'in_progress'
    );
  }

  private getIncompleteTodosSummary(): string {
    const incomplete = this.currentTodos.filter(
      t => t.status === 'pending' || t.status === 'in_progress'
    );
    return incomplete.map(t => `- ${t.content}`).join('\n');
  }

  /**
   * Get current state for debugging/testing.
   */
  getState(): CompletionFlowState {
    return this.state.getState();
  }

  /**
   * Get continuation attempts count.
   */
  getContinuationAttempts(): number {
    return this.state.getContinuationAttempts();
  }
}
