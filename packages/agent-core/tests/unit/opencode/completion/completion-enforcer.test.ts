import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompletionEnforcer, CompletionEnforcerCallbacks, StepFinishAction } from '../../../../src/opencode/completion/completion-enforcer.js';
import { CompletionFlowState } from '../../../../src/opencode/completion/completion-state.js';
import type { TodoItem } from '../../../../src/shared';

describe('CompletionEnforcer', () => {
  let enforcer: CompletionEnforcer;
  let callbacks: CompletionEnforcerCallbacks;
  let onStartContinuationMock: ReturnType<typeof vi.fn>;
  let onCompleteMock: ReturnType<typeof vi.fn>;
  let onDebugMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onStartContinuationMock = vi.fn().mockResolvedValue(undefined);
    onCompleteMock = vi.fn();
    onDebugMock = vi.fn();

    callbacks = {
      onStartContinuation: onStartContinuationMock,
      onComplete: onCompleteMock,
      onDebug: onDebugMock,
    };

    enforcer = new CompletionEnforcer(callbacks);

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('initial state', () => {
    it('should start in IDLE state', () => {
      expect(enforcer.getState()).toBe(CompletionFlowState.IDLE);
    });

    it('should have zero continuation attempts', () => {
      expect(enforcer.getContinuationAttempts()).toBe(0);
    });
  });

  describe('updateTodos', () => {
    it('should store todos and emit debug event', () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'completed', priority: 'medium' },
      ];

      enforcer.updateTodos(todos);

      expect(onDebugMock).toHaveBeenCalledWith(
        'todo_update',
        'Todo list updated: 2 items',
        { todos }
      );
    });
  });

  describe('markToolsUsed', () => {
    it('should mark tools as used', () => {
      enforcer.markToolsUsed();
      // This affects handleStepFinish behavior - tested below
    });
  });

  describe('handleCompleteTaskDetection', () => {
    it('should return true on first detection', () => {
      const result = enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(result).toBe(true);
      expect(onDebugMock).toHaveBeenCalledWith(
        'complete_task',
        expect.stringContaining('complete_task detected with status: success'),
        expect.any(Object)
      );
    });

    it('should return false if already processed', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      const result = enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done again',
        original_request_summary: 'Test',
      });

      expect(result).toBe(false);
    });

    it('should downgrade success to partial if there are incomplete todos', () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
      ];
      enforcer.updateTodos(todos);

      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(onDebugMock).toHaveBeenCalledWith(
        'incomplete_todos',
        'Agent claimed success but has incomplete todos - downgrading to partial',
        expect.any(Object)
      );

      expect(enforcer.getState()).toBe(CompletionFlowState.PARTIAL_CONTINUATION_PENDING);
    });

    it('should not downgrade if all todos are completed', () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'cancelled', priority: 'medium' },
      ];
      enforcer.updateTodos(todos);

      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(enforcer.getState()).toBe(CompletionFlowState.DONE);
    });

    it('should handle missing input gracefully', () => {
      const result = enforcer.handleCompleteTaskDetection(null);

      expect(result).toBe(true);
      expect(enforcer.getState()).toBe(CompletionFlowState.BLOCKED); // unknown status
    });
  });

  describe('handleStepFinish', () => {
    it('should return "continue" for non-terminal reasons', () => {
      const result = enforcer.handleStepFinish('tool_use');

      expect(result).toBe('continue');
    });

    it('should return "pending" when partial continuation is needed', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'partial',
        summary: 'Partial done',
        original_request_summary: 'Test',
        remaining_work: 'More work',
      });

      const result = enforcer.handleStepFinish('stop');

      expect(result).toBe('pending');
      expect(onDebugMock).toHaveBeenCalledWith(
        'partial_continuation',
        'Scheduling continuation for partial completion',
        expect.any(Object)
      );
    });

    it('should return "complete" when no tools used and no complete_task called', () => {
      // Don't mark tools as used
      const result = enforcer.handleStepFinish('stop');

      expect(result).toBe('complete');
      expect(onDebugMock).toHaveBeenCalledWith(
        'skip_continuation',
        'No tools used and no complete_task called — treating as conversational response'
      );
    });

    it('should return "pending" when tools used but no complete_task called', () => {
      enforcer.markToolsUsed();

      const result = enforcer.handleStepFinish('stop');

      expect(result).toBe('pending');
      expect(enforcer.getContinuationAttempts()).toBe(1);
      expect(onDebugMock).toHaveBeenCalledWith(
        'continuation',
        'Scheduled continuation prompt (attempt 1)'
      );
    });

    it('should return "complete" after complete_task with success', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      const result = enforcer.handleStepFinish('stop');

      expect(result).toBe('complete');
    });

    it('should handle "end_turn" reason same as "stop"', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      const result = enforcer.handleStepFinish('end_turn');

      expect(result).toBe('complete');
    });
  });

  describe('handleProcessExit', () => {
    it('should start partial continuation when pending', async () => {
      enforcer.handleCompleteTaskDetection({
        status: 'partial',
        summary: 'Partial',
        original_request_summary: 'Original request',
        remaining_work: 'Remaining items',
      });

      await enforcer.handleProcessExit(0);

      expect(onStartContinuationMock).toHaveBeenCalledWith(
        expect.stringContaining('You called complete_task with status="partial"')
      );
      expect(onDebugMock).toHaveBeenCalledWith(
        'partial_continuation',
        expect.stringContaining('Starting partial continuation'),
        expect.any(Object)
      );
    });

    it('should start continuation when pending', async () => {
      enforcer.markToolsUsed();
      enforcer.handleStepFinish('stop'); // Schedule continuation

      await enforcer.handleProcessExit(0);

      expect(onStartContinuationMock).toHaveBeenCalledWith(
        expect.stringContaining('REMINDER: You must call complete_task when finished')
      );
    });

    it('should call onComplete when no pending actions', async () => {
      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      await enforcer.handleProcessExit(0);

      expect(onCompleteMock).toHaveBeenCalled();
      expect(onStartContinuationMock).not.toHaveBeenCalled();
    });

    it('should call onComplete when exit code is non-zero', async () => {
      enforcer.markToolsUsed();
      enforcer.handleStepFinish('stop'); // Schedule continuation

      await enforcer.handleProcessExit(1);

      expect(onCompleteMock).toHaveBeenCalled();
      expect(onStartContinuationMock).not.toHaveBeenCalled();
    });

    it('should call onComplete when max partial continuation attempts reached', async () => {
      const limitedEnforcer = new CompletionEnforcer(callbacks, 0);

      limitedEnforcer.handleCompleteTaskDetection({
        status: 'partial',
        summary: 'Partial',
        original_request_summary: 'Test',
      });

      await limitedEnforcer.handleProcessExit(0);

      expect(onCompleteMock).toHaveBeenCalled();
      expect(onStartContinuationMock).not.toHaveBeenCalled();
    });
  });

  describe('shouldComplete', () => {
    it('should return true when DONE', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(enforcer.shouldComplete()).toBe(true);
    });

    it('should return true when BLOCKED', () => {
      enforcer.handleCompleteTaskDetection({
        status: 'blocked',
        summary: 'Blocked',
        original_request_summary: 'Test',
      });

      expect(enforcer.shouldComplete()).toBe(true);
    });

    it('should return true when MAX_RETRIES_REACHED', () => {
      const limitedEnforcer = new CompletionEnforcer(callbacks, 0);
      limitedEnforcer.markToolsUsed();
      limitedEnforcer.handleStepFinish('stop'); // Will reach max retries

      expect(limitedEnforcer.shouldComplete()).toBe(true);
    });

    it('should return false when IDLE', () => {
      expect(enforcer.shouldComplete()).toBe(false);
    });

    it('should return false when CONTINUATION_PENDING', () => {
      enforcer.markToolsUsed();
      enforcer.handleStepFinish('stop');

      expect(enforcer.shouldComplete()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      enforcer.markToolsUsed();
      enforcer.updateTodos([{ id: '1', content: 'Task', status: 'pending', priority: 'high' }]);
      enforcer.handleStepFinish('stop');

      enforcer.reset();

      expect(enforcer.getState()).toBe(CompletionFlowState.IDLE);
      expect(enforcer.getContinuationAttempts()).toBe(0);
    });
  });

  describe('continuation flow', () => {
    it('should allow multiple continuation attempts', async () => {
      const maxAttempts = 3;
      const limitedEnforcer = new CompletionEnforcer(callbacks, maxAttempts);

      // First attempt
      limitedEnforcer.markToolsUsed();
      limitedEnforcer.handleStepFinish('stop');
      await limitedEnforcer.handleProcessExit(0);

      expect(limitedEnforcer.getContinuationAttempts()).toBe(1);
      expect(onStartContinuationMock).toHaveBeenCalledTimes(1);

      // Second attempt
      limitedEnforcer.markToolsUsed();
      limitedEnforcer.handleStepFinish('stop');
      await limitedEnforcer.handleProcessExit(0);

      expect(limitedEnforcer.getContinuationAttempts()).toBe(2);
      expect(onStartContinuationMock).toHaveBeenCalledTimes(2);

      // Third attempt
      limitedEnforcer.markToolsUsed();
      limitedEnforcer.handleStepFinish('stop');
      await limitedEnforcer.handleProcessExit(0);

      expect(limitedEnforcer.getContinuationAttempts()).toBe(3);
      expect(onStartContinuationMock).toHaveBeenCalledTimes(3);

      // Fourth attempt - should hit max
      limitedEnforcer.markToolsUsed();
      const action = limitedEnforcer.handleStepFinish('stop');

      expect(action).toBe('complete'); // Max retries reached
    });
  });
});
