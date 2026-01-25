/**
 * CompletionEnforcer coordinates the completion enforcement flow.
 * Uses the explicit CompletionState machine and delegates actual task
 * spawning to the adapter via callbacks.
 *
 * PURPOSE: Ensures agents properly finish tasks instead of stopping prematurely.
 *
 * TWO MAIN ENFORCEMENT MECHANISMS:
 *
 * 1. CONTINUATION PROMPTS (if agent stops without calling complete_task):
 *    - Agent sometimes stops mid-task (API limits, confusion, etc.)
 *    - We detect this on step_finish with reason='stop' but no complete_task call
 *    - Spawn a session resumption with a firm reminder to call complete_task
 *    - Retry up to 50 times before giving up
 *
 * 2. VERIFICATION (if agent claims status="success"):
 *    - Agent may claim success without actually verifying work is done
 *    - Especially problematic for browser automation where UI state matters
 *    - On success claim, spawn verification task asking agent to:
 *      a) Take a screenshot of current browser state
 *      b) Compare against the plan's completion criteria
 *      c) Only re-call complete_task(success) if screenshot proves completion
 *    - If agent finds issues during verification, it continues working instead
 *
 * CALLBACK PATTERN:
 * - Enforcer is decoupled from adapter via callbacks
 * - onStartVerification/onStartContinuation: adapter spawns session resumption
 * - onComplete: adapter emits the 'complete' event
 * - onDebug: adapter emits debug info for the UI debug panel
 */

import { CompletionState, CompletionFlowState, CompleteTaskArgs } from './completion-state';
import { getContinuationPrompt, getVerificationPrompt, getPartialContinuationPrompt } from './prompts';

export interface CompletionEnforcerCallbacks {
  onStartVerification: (prompt: string) => Promise<void>;
  onStartContinuation: (prompt: string) => Promise<void>;
  onComplete: () => void;
  onDebug: (type: string, message: string, data?: unknown) => void;
}

export type StepFinishAction = 'continue' | 'pending' | 'complete';

export class CompletionEnforcer {
  private state: CompletionState;
  private callbacks: CompletionEnforcerCallbacks;

  constructor(callbacks: CompletionEnforcerCallbacks, maxContinuationAttempts: number = 20) {
    this.callbacks = callbacks;
    this.state = new CompletionState(maxContinuationAttempts);
  }

  /**
   * Called by adapter when complete_task tool detected.
   * Returns true if this was a new detection (not already processed).
   */
  handleCompleteTaskDetection(toolInput: unknown): boolean {
    // Already processed complete_task in current flow
    if (this.state.isCompleteTaskCalled() && !this.state.isInVerificationMode()) {
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

    // Check if verification is needed
    if (this.state.isPendingVerification()) {
      this.callbacks.onDebug(
        'verification',
        'Scheduling verification for completion claim',
        { summary: this.state.getCompleteTaskArgs()?.summary }
      );
      return 'pending'; // Let handleProcessExit start verification
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
      // If we're in verification mode and agent stops without re-calling complete_task,
      // it means they found issues and are continuing to work
      if (this.state.isInVerificationMode()) {
        this.state.verificationContinuing();
        this.callbacks.onDebug(
          'verification',
          'Agent continuing work after verification check'
        );
        return 'pending'; // Let process exit, agent will continue
      }

      // Try to schedule a continuation
      if (this.state.scheduleContinuation()) {
        this.callbacks.onDebug(
          'continuation',
          `Scheduled continuation prompt (attempt ${this.state.getContinuationAttempts()})`
        );
        return 'pending'; // Let handleProcessExit start continuation
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
    // Check if we need to verify a completion claim
    if (this.state.isPendingVerification() && exitCode === 0) {
      const args = this.state.getCompleteTaskArgs();
      const prompt = getVerificationPrompt(
        args?.summary || 'No summary provided',
        args?.original_request_summary || 'Unknown request'
      );

      this.state.startVerification();

      this.callbacks.onDebug(
        'verification',
        'Starting verification task',
        { claimedSummary: args?.summary, originalRequest: args?.original_request_summary }
      );

      await this.callbacks.onStartVerification(prompt);
      return;
    }

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

      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    // No pending actions - complete the task
    // This handles:
    // - DONE: verification completed successfully
    // - COMPLETE_TASK_CALLED: complete_task called with blocked status
    // - IDLE: process exited cleanly without triggering completion flow
    // - MAX_RETRIES_REACHED: exhausted all continuation attempts
    this.callbacks.onComplete();
  }

  /**
   * Check if state indicates task should be marked complete.
   */
  shouldComplete(): boolean {
    return this.state.isDone() ||
           this.state.getState() === CompletionFlowState.COMPLETE_TASK_CALLED ||
           this.state.getState() === CompletionFlowState.MAX_RETRIES_REACHED;
  }

  /**
   * Reset for new task.
   */
  reset(): void {
    this.state.reset();
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
