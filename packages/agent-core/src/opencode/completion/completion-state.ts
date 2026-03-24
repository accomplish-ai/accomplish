export enum CompletionFlowState {
  IDLE,
  BLOCKED,
  PARTIAL_CONTINUATION_PENDING,
  CONTINUATION_PENDING,
  MAX_RETRIES_REACHED,
  DONE,
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

  constructor(maxContinuationAttempts: number = 10) {
    this.maxContinuationAttempts = maxContinuationAttempts;
  }

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
    return (
      this.state !== CompletionFlowState.IDLE &&
      this.state !== CompletionFlowState.CONTINUATION_PENDING &&
      this.state !== CompletionFlowState.PARTIAL_CONTINUATION_PENDING
    );
  }

  isPendingContinuation(): boolean {
    return this.state === CompletionFlowState.CONTINUATION_PENDING;
  }

  isPendingPartialContinuation(): boolean {
    return this.state === CompletionFlowState.PARTIAL_CONTINUATION_PENDING;
  }

  isDone(): boolean {
    return (
      this.state === CompletionFlowState.DONE ||
      this.state === CompletionFlowState.MAX_RETRIES_REACHED
    );
  }

  recordCompleteTaskCall(args: CompleteTaskArgs): void {
    this.completeTaskArgs = args;
    if (args.status === 'success') {
      this.state = CompletionFlowState.DONE;
    } else if (args.status === 'partial') {
      this.state = CompletionFlowState.PARTIAL_CONTINUATION_PENDING;
    } else {
      this.state = CompletionFlowState.BLOCKED;
    }
  }

  scheduleContinuation(): boolean {
    if (
      this.state !== CompletionFlowState.IDLE &&
      this.state !== CompletionFlowState.CONTINUATION_PENDING
    ) {
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
    this.state = CompletionFlowState.IDLE;
  }

  startPartialContinuation(): boolean {
    if (this.state !== CompletionFlowState.PARTIAL_CONTINUATION_PENDING) {
      throw new Error(
        `Cannot start partial continuation from state ${CompletionFlowState[this.state]}`,
      );
    }

    this.continuationAttempts++;
    if (this.continuationAttempts > this.maxContinuationAttempts) {
      this.state = CompletionFlowState.MAX_RETRIES_REACHED;
      return false;
    }

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
