import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionState, CompletionFlowState, CompleteTaskArgs } from '../../../../src/opencode/completion/completion-state.js';

describe('CompletionState', () => {
  let state: CompletionState;

  beforeEach(() => {
    state = new CompletionState();
  });

  describe('initial state', () => {
    it('should start in IDLE state', () => {
      expect(state.getState()).toBe(CompletionFlowState.IDLE);
    });

    it('should have zero continuation attempts', () => {
      expect(state.getContinuationAttempts()).toBe(0);
    });

    it('should have no complete_task args', () => {
      expect(state.getCompleteTaskArgs()).toBeNull();
    });

    it('should report complete_task not called', () => {
      expect(state.isCompleteTaskCalled()).toBe(false);
    });

    it('should not be pending continuation', () => {
      expect(state.isPendingContinuation()).toBe(false);
    });

    it('should not be pending partial continuation', () => {
      expect(state.isPendingPartialContinuation()).toBe(false);
    });

    it('should not be done', () => {
      expect(state.isDone()).toBe(false);
    });

    it('should use default max continuation attempts of 50', () => {
      expect(state.getMaxContinuationAttempts()).toBe(50);
    });
  });

  describe('custom max continuation attempts', () => {
    it('should accept custom max attempts', () => {
      const customState = new CompletionState(10);
      expect(customState.getMaxContinuationAttempts()).toBe(10);
    });
  });

  describe('recordCompleteTaskCall', () => {
    it('should transition to DONE state on success status', () => {
      const args: CompleteTaskArgs = {
        status: 'success',
        summary: 'Task completed',
        original_request_summary: 'Do something',
      };

      state.recordCompleteTaskCall(args);

      expect(state.getState()).toBe(CompletionFlowState.DONE);
      expect(state.isCompleteTaskCalled()).toBe(true);
      expect(state.isDone()).toBe(true);
      expect(state.getCompleteTaskArgs()).toEqual(args);
    });

    it('should transition to PARTIAL_CONTINUATION_PENDING state on partial status', () => {
      const args: CompleteTaskArgs = {
        status: 'partial',
        summary: 'Some work done',
        original_request_summary: 'Do something',
        remaining_work: 'More items to do',
      };

      state.recordCompleteTaskCall(args);

      expect(state.getState()).toBe(CompletionFlowState.PARTIAL_CONTINUATION_PENDING);
      expect(state.isPendingPartialContinuation()).toBe(true);
      expect(state.isCompleteTaskCalled()).toBe(false); // Partial doesn't count as "called" for completion logic
    });

    it('should transition to BLOCKED state on blocked status', () => {
      const args: CompleteTaskArgs = {
        status: 'blocked',
        summary: 'Hit a wall',
        original_request_summary: 'Do something',
      };

      state.recordCompleteTaskCall(args);

      expect(state.getState()).toBe(CompletionFlowState.BLOCKED);
      expect(state.isCompleteTaskCalled()).toBe(true);
    });

    it('should transition to BLOCKED state on unknown status', () => {
      const args: CompleteTaskArgs = {
        status: 'unknown',
        summary: 'Unknown',
        original_request_summary: 'Do something',
      };

      state.recordCompleteTaskCall(args);

      expect(state.getState()).toBe(CompletionFlowState.BLOCKED);
    });
  });

  describe('scheduleContinuation', () => {
    it('should transition to CONTINUATION_PENDING from IDLE', () => {
      const result = state.scheduleContinuation();

      expect(result).toBe(true);
      expect(state.getState()).toBe(CompletionFlowState.CONTINUATION_PENDING);
      expect(state.getContinuationAttempts()).toBe(1);
    });

    it('should allow scheduling from CONTINUATION_PENDING state (re-scheduling)', () => {
      state.scheduleContinuation();
      const result = state.scheduleContinuation();

      expect(result).toBe(true);
      expect(state.getContinuationAttempts()).toBe(2);
    });

    it('should return false when max retries reached', () => {
      const limitedState = new CompletionState(2);

      limitedState.scheduleContinuation(); // attempt 1
      limitedState.scheduleContinuation(); // attempt 2
      const result = limitedState.scheduleContinuation(); // attempt 3 - exceeds max

      expect(result).toBe(false);
      expect(limitedState.getState()).toBe(CompletionFlowState.MAX_RETRIES_REACHED);
    });

    it('should not allow scheduling from DONE state', () => {
      state.recordCompleteTaskCall({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Do something',
      });

      const result = state.scheduleContinuation();

      expect(result).toBe(false);
      expect(state.getState()).toBe(CompletionFlowState.DONE);
    });

    it('should not allow scheduling from BLOCKED state', () => {
      state.recordCompleteTaskCall({
        status: 'blocked',
        summary: 'Blocked',
        original_request_summary: 'Do something',
      });

      const result = state.scheduleContinuation();

      expect(result).toBe(false);
    });
  });

  describe('startContinuation', () => {
    it('should transition back to IDLE from CONTINUATION_PENDING', () => {
      state.scheduleContinuation();
      state.startContinuation();

      expect(state.getState()).toBe(CompletionFlowState.IDLE);
    });

    it('should throw error when not in CONTINUATION_PENDING state', () => {
      expect(() => state.startContinuation()).toThrow(
        'Cannot start continuation from state IDLE'
      );
    });

    it('should throw error when in DONE state', () => {
      state.recordCompleteTaskCall({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(() => state.startContinuation()).toThrow(
        'Cannot start continuation from state DONE'
      );
    });
  });

  describe('startPartialContinuation', () => {
    it('should transition back to IDLE from PARTIAL_CONTINUATION_PENDING', () => {
      state.recordCompleteTaskCall({
        status: 'partial',
        summary: 'Partial',
        original_request_summary: 'Test',
        remaining_work: 'More to do',
      });

      const result = state.startPartialContinuation();

      expect(result).toBe(true);
      expect(state.getState()).toBe(CompletionFlowState.IDLE);
      expect(state.getContinuationAttempts()).toBe(1);
    });

    it('should throw error when not in PARTIAL_CONTINUATION_PENDING state', () => {
      expect(() => state.startPartialContinuation()).toThrow(
        'Cannot start partial continuation from state IDLE'
      );
    });

    it('should return false when max retries reached', () => {
      const limitedState = new CompletionState(1);

      limitedState.recordCompleteTaskCall({
        status: 'partial',
        summary: 'Partial',
        original_request_summary: 'Test',
      });

      limitedState.startPartialContinuation(); // attempt 1, goes to IDLE

      // Need to re-record partial status
      limitedState.recordCompleteTaskCall({
        status: 'partial',
        summary: 'Partial again',
        original_request_summary: 'Test',
      });

      const result = limitedState.startPartialContinuation(); // attempt 2 - exceeds max

      expect(result).toBe(false);
      expect(limitedState.getState()).toBe(CompletionFlowState.MAX_RETRIES_REACHED);
    });
  });

  describe('markDone', () => {
    it('should transition to DONE from any state', () => {
      state.markDone();
      expect(state.getState()).toBe(CompletionFlowState.DONE);
      expect(state.isDone()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Set up some state
      state.scheduleContinuation();
      state.startContinuation();
      state.recordCompleteTaskCall({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      state.reset();

      expect(state.getState()).toBe(CompletionFlowState.IDLE);
      expect(state.getContinuationAttempts()).toBe(0);
      expect(state.getCompleteTaskArgs()).toBeNull();
    });
  });

  describe('isDone', () => {
    it('should return true for DONE state', () => {
      state.recordCompleteTaskCall({
        status: 'success',
        summary: 'Done',
        original_request_summary: 'Test',
      });

      expect(state.isDone()).toBe(true);
    });

    it('should return true for MAX_RETRIES_REACHED state', () => {
      const limitedState = new CompletionState(0);
      limitedState.scheduleContinuation(); // Immediately exceeds max (0)

      expect(limitedState.isDone()).toBe(true);
    });

    it('should return false for other states', () => {
      expect(state.isDone()).toBe(false);

      state.scheduleContinuation();
      expect(state.isDone()).toBe(false);
    });
  });
});
