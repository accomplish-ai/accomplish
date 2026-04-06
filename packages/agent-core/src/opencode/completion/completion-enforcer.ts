import { CompletionState, CompletionFlowState, CompleteTaskArgs } from './completion-state.js';
import { getContinuationPrompt, getPartialContinuationPrompt } from './prompts.js';
import type { TodoItem } from '../../common/types/todo.js';
import { createConsoleLogger } from '../../utils/logging.js';
import {
  hasIncompleteTodos,
  getIncompleteTodosSummary,
  isConversationalTurn,
  type StepFinishAction,
} from './completion-enforcer-rules.js';

const log = createConsoleLogger({ prefix: 'CompletionEnforcer' });

export interface CompletionEnforcerCallbacks {
  onStartContinuation: (prompt: string) => Promise<void>;
  onComplete: () => void;
  onDebug: (type: string, message: string, data?: unknown) => void;
}

export type { StepFinishAction } from './completion-enforcer-rules.js';

export class CompletionEnforcer {
  private state: CompletionState;
  private callbacks: CompletionEnforcerCallbacks;
  private currentTodos: TodoItem[] = [];
  private taskToolsWereUsed: boolean = false;
  private taskToolsWereUsedEver: boolean = false;
  private taskRequiresCompletion: boolean = false;
  private inContinuation: boolean = false;

  constructor(callbacks: CompletionEnforcerCallbacks, maxContinuationAttempts?: number) {
    this.callbacks = callbacks;
    this.state = new CompletionState(maxContinuationAttempts);
  }

  updateTodos(todos: TodoItem[]): void {
    this.currentTodos = todos;
    if (todos.length > 0) {
      this.taskRequiresCompletion = true;
    }
    this.callbacks.onDebug('todo_update', `Todo list updated: ${todos.length} items`, { todos });
  }

  markToolsUsed(countsForContinuation: boolean = true): void {
    if (!countsForContinuation) {
      return;
    }
    this.taskToolsWereUsed = true;
    this.taskToolsWereUsedEver = true;
  }

  markTaskRequiresCompletion(): void {
    this.taskRequiresCompletion = true;
  }

  handleCompleteTaskDetection(toolInput: unknown): boolean {
    if (this.state.isCompleteTaskCalled()) {
      return false;
    }

    const raw = toolInput as {
      status?: string;
      summary?: string;
      original_request_summary?: string;
      remaining_work?: string;
    };
    const completeTaskArgs: CompleteTaskArgs = {
      status: raw?.status || 'unknown',
      summary: raw?.summary || '',
      original_request_summary: raw?.original_request_summary || '',
      remaining_work: raw?.remaining_work,
    };

    if (completeTaskArgs.status === 'success' && hasIncompleteTodos(this.currentTodos)) {
      const incompleteSummary = getIncompleteTodosSummary(this.currentTodos);
      this.callbacks.onDebug(
        'incomplete_todos',
        'Agent claimed success but has incomplete todos - downgrading to partial',
        { incompleteTodos: incompleteSummary },
      );
      completeTaskArgs.status = 'partial';
      completeTaskArgs.remaining_work = incompleteSummary;
    }

    this.state.recordCompleteTaskCall(completeTaskArgs);
    if (this.shouldComplete()) {
      this.inContinuation = false;
    }
    this.callbacks.onDebug(
      'complete_task',
      `complete_task detected with status: ${completeTaskArgs.status}`,
      { args: completeTaskArgs, state: CompletionFlowState[this.state.getState()] },
    );
    return true;
  }

  handleStepFinish(reason: string): StepFinishAction {
    if (reason !== 'stop' && reason !== 'end_turn') {
      return 'continue';
    }

    if (this.state.isPendingPartialContinuation()) {
      this.callbacks.onDebug(
        'partial_continuation',
        'Scheduling continuation for partial completion',
        { remainingWork: this.state.getCompleteTaskArgs()?.remaining_work },
      );
      return 'pending';
    }

    if (!this.state.isCompleteTaskCalled()) {
      if (
        isConversationalTurn(
          this.taskToolsWereUsed,
          this.taskToolsWereUsedEver,
          this.taskRequiresCompletion,
        )
      ) {
        this.callbacks.onDebug(
          'skip_continuation',
          'No tools used and no complete_task called — treating as conversational response',
        );
        return 'complete';
      }

      if (this.state.scheduleContinuation()) {
        this.callbacks.onDebug(
          'continuation',
          `Scheduled continuation prompt (attempt ${this.state.getContinuationAttempts()})`,
        );
        return 'pending';
      }

      log.warn(
        `[CompletionEnforcer] Agent stopped without complete_task. State: ${CompletionFlowState[this.state.getState()]}, attempts: ${this.state.getContinuationAttempts()}/${this.state.getMaxContinuationAttempts()}`,
      );
    }

    return 'complete';
  }

  async handleProcessExit(exitCode: number): Promise<void> {
    if (this.state.isPendingPartialContinuation() && exitCode === 0) {
      const args = this.state.getCompleteTaskArgs();
      const prompt = getPartialContinuationPrompt(
        args?.remaining_work || 'No remaining work specified',
        args?.original_request_summary || 'Unknown request',
        args?.summary || 'No summary provided',
        hasIncompleteTodos(this.currentTodos)
          ? getIncompleteTodosSummary(this.currentTodos)
          : undefined,
      );
      if (!this.state.startPartialContinuation()) {
        log.warn('[CompletionEnforcer] Max partial continuation attempts reached');
        this.callbacks.onComplete();
        return;
      }
      this.callbacks.onDebug(
        'partial_continuation',
        `Starting partial continuation (attempt ${this.state.getContinuationAttempts()})`,
        { remainingWork: args?.remaining_work, summary: args?.summary, continuationPrompt: prompt },
      );
      this.taskToolsWereUsed = false;
      this.inContinuation = true;
      await this.callbacks.onStartContinuation(prompt);
      return;
    }

    if (this.state.isPendingContinuation() && exitCode === 0) {
      this.state.startContinuation();
      this.callbacks.onDebug(
        'continuation',
        `Starting continuation task (attempt ${this.state.getContinuationAttempts()})`,
      );
      this.taskToolsWereUsed = false;
      await this.callbacks.onStartContinuation(getContinuationPrompt());
      return;
    }

    this.callbacks.onComplete();
  }

  shouldComplete(): boolean {
    return (
      this.state.isDone() ||
      this.state.getState() === CompletionFlowState.BLOCKED ||
      this.state.getState() === CompletionFlowState.MAX_RETRIES_REACHED
    );
  }

  reset(): void {
    this.state.reset();
    this.currentTodos = [];
    this.taskToolsWereUsed = false;
    this.taskToolsWereUsedEver = false;
    this.taskRequiresCompletion = false;
    this.inContinuation = false;
  }

  isInContinuation(): boolean {
    return this.inContinuation;
  }

  getState(): CompletionFlowState {
    return this.state.getState();
  }

  getContinuationAttempts(): number {
    return this.state.getContinuationAttempts();
  }
}
