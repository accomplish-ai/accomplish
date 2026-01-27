/**
 * Explicit state machine for completion enforcement flow.
 *
 * WHY A STATE MACHINE:
 * - Replaces what would be multiple boolean flags
 * - Makes state transitions explicit and debuggable
 * - Prevents invalid state combinations
 *
 * STATE FLOW DIAGRAM:
 *
 *   IDLE ──────────────────────────────────────┬──────────────────────────┐
 *     │                                        │                          │
 *     │ complete_task(success,                 │ complete_task(partial)   │ complete_task(blocked)
 *     │ todos complete)                        │   OR                    │
 *     │                                        │ success→partial          │
 *     ▼                                        │ (incomplete todos)       ▼
 *   DONE ──► (task ends)                       ▼                     BLOCKED ──► (task ends)
 *                                      PARTIAL_CONTINUATION_PENDING
 *                                              │
 *                                              │ startPartialContinuation()
 *                                              ▼
 *                                            IDLE (continue work)
 *
 *   IDLE ──► agent stops without complete_task
 *     │
 *     ▼
 *   CONTINUATION_PENDING ──► startContinuation() ──► IDLE
 *     │
 *     │ max retries exceeded
 *     ▼
 *   MAX_RETRIES_REACHED ──► (task ends with warning)
 */

export enum CompletionFlowState {
  IDLE,                           // Initial state, no complete_task called
  BLOCKED,                        // Agent called complete_task with blocked status
  PARTIAL_CONTINUATION_PENDING,   // Agent called complete_task(partial), continuation pending
  CONTINUATION_PENDING,           // Agent stopped without complete_task, continuation pending
  MAX_RETRIES_REACHED,            // Exhausted continuation attempts
  DONE                            // Task complete
}

export interface CompleteTaskArgs {
  status: string;
  summary: string;
  original_request_summary: string;
  remaining_work?: string;
}

export class CompletionState {
  private state: CompletionFlowState = CompletionFlowState.IDLE;
  private continuationAttempts: number = 0;
  private completeTaskArgs: CompleteTaskArgs | null = null;
  private readonly maxContinuationAttempts: number;

  constructor(maxContinuationAttempts: number = 50) {
    this.maxContinuationAttempts = maxContinuationAttempts;
  }

  // State queries
  getState(): CompletionFlowState {
    return this.state;
  }

  getCompleteTaskArgs(): CompleteTaskArgs | null {
    return this.completeTaskArgs;
  }

  getContinuationAttempts(): number {
    return this.continuationAttempts;
  }

  getMaxContinuationAttempts(): number {
    return this.maxContinuationAttempts;
  }

  isCompleteTaskCalled(): boolean {
    return this.state !== CompletionFlowState.IDLE &&
           this.state !== CompletionFlowState.CONTINUATION_PENDING &&
           this.state !== CompletionFlowState.PARTIAL_CONTINUATION_PENDING;
  }

  isPendingContinuation(): boolean {
    return this.state === CompletionFlowState.CONTINUATION_PENDING;
  }

  isPendingPartialContinuation(): boolean {
    return this.state === CompletionFlowState.PARTIAL_CONTINUATION_PENDING;
  }

  isDone(): boolean {
    return this.state === CompletionFlowState.DONE ||
           this.state === CompletionFlowState.MAX_RETRIES_REACHED;
  }

  // State transitions
  recordCompleteTaskCall(args: CompleteTaskArgs): void {
    this.completeTaskArgs = args;
    if (args.status === 'success') {
      this.state = CompletionFlowState.DONE;
    } else if (args.status === 'partial') {
      this.state = CompletionFlowState.PARTIAL_CONTINUATION_PENDING;
    } else {
      // blocked or unknown - terminal
      this.state = CompletionFlowState.BLOCKED;
    }
  }

  scheduleContinuation(): boolean {
    // Can schedule continuation from:
    // - IDLE: agent never called complete_task
    // - CONTINUATION_PENDING: previous continuation was scheduled but process didn't exit
    //   (OpenCode CLI's auto-continue keeps process alive, so handleProcessExit/startContinuation
    //   is never called to reset state to IDLE)
    if (this.state !== CompletionFlowState.IDLE &&
        this.state !== CompletionFlowState.CONTINUATION_PENDING) {
      return false;
    }

    this.continuationAttempts++;
    if (this.continuationAttempts > this.maxContinuationAttempts) {
      this.state = CompletionFlowState.MAX_RETRIES_REACHED;
      return false;
    }

    this.state = CompletionFlowState.CONTINUATION_PENDING;
    return true;
  }

  startContinuation(): void {
    if (this.state !== CompletionFlowState.CONTINUATION_PENDING) {
      throw new Error(`Cannot start continuation from state ${CompletionFlowState[this.state]}`);
    }
    // Reset to IDLE so we can track next complete_task call
    this.state = CompletionFlowState.IDLE;
  }

  startPartialContinuation(): boolean {
    if (this.state !== CompletionFlowState.PARTIAL_CONTINUATION_PENDING) {
      throw new Error(`Cannot start partial continuation from state ${CompletionFlowState[this.state]}`);
    }

    this.continuationAttempts++;
    if (this.continuationAttempts > this.maxContinuationAttempts) {
      this.state = CompletionFlowState.MAX_RETRIES_REACHED;
      return false;
    }

    // Reset to IDLE so we can track next complete_task call
    this.state = CompletionFlowState.IDLE;
    return true;
  }

  markDone(): void {
    this.state = CompletionFlowState.DONE;
  }

  reset(): void {
    this.state = CompletionFlowState.IDLE;
    this.continuationAttempts = 0;
    this.completeTaskArgs = null;
  }
}
