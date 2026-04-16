import { describe, expect, it, vi } from 'vitest';

// Agent-core transitively loads undici at module evaluation time. The global
// mock in setup.ts is applied too late for this import chain, so we hoist an
// explicit mock here to prevent the Node 20 / undici 8 crash.
vi.mock('undici', () => ({
  ProxyAgent: class ProxyAgent {},
  Agent: class Agent {},
  fetch: vi.fn(),
  setGlobalDispatcher: vi.fn(),
  getGlobalDispatcher: vi.fn(),
}));
import type { TaskMessage, Task, TaskUpdateEvent } from '@accomplish_ai/agent-core';
import { createTaskUpdateActions } from '@/stores/task-update-actions';
import type { TaskState } from '@/stores/taskStore';

/**
 * Phase 1c regression (Max review blocker #1): the renderer's task-update
 * handlers used to do `[...existing, incoming]` — raw append. With the
 * SDK adapter emitting stable-IDed messages (`running` then `completed` for
 * the same tool), raw append produced two tool-row bubbles per transition.
 *
 * This suite pins the correct behaviour:
 *   - A `running` message followed by a `completed` message with the SAME
 *     id must collapse into ONE row with status = 'completed'.
 *   - Different IDs still append as separate rows (no false coalescing).
 *   - Batch path (`addTaskUpdateBatch`) has the same semantics.
 *   - Timestamp on merged row preserves the original so UI sort order is
 *     stable.
 */

// Mock the accomplish logger so tests don't hit IPC/preload.
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({ logEvent: vi.fn() }),
}));

function buildTask(id: string, messages: TaskMessage[] = []): Task {
  return {
    id,
    prompt: 'test',
    status: 'running',
    messages,
    createdAt: new Date().toISOString(),
  };
}

function buildToolMessage(
  id: string,
  toolStatus: 'running' | 'completed' | 'error',
  timestamp: string,
): TaskMessage {
  return {
    id,
    type: 'tool',
    content: `Using tool: write`,
    toolName: 'write',
    toolStatus,
    timestamp,
  };
}

function setupStore(initialState: Partial<TaskState>) {
  let state: TaskState = {
    tasks: [],
    currentTask: null,
    isLoading: false,
    todos: [],
    todosTaskId: null,
    ...(initialState as TaskState),
  } as TaskState;
  const set: (partial: Partial<TaskState> | ((s: TaskState) => Partial<TaskState>)) => void = (
    partial,
  ) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next } as TaskState;
  };
  const get = (): TaskState => state;
  const actions = createTaskUpdateActions(set, get);
  return { actions, getState: get };
}

describe('task-update-actions merge-by-stable-id (Phase 1c)', () => {
  it('single-message path: running → completed on the same id collapses into one row', () => {
    const tool = buildToolMessage('tool-1', 'running', '2026-04-15T10:00:00.000Z');
    const task = buildTask('tsk-1', [tool]);
    const { actions, getState } = setupStore({ tasks: [task], currentTask: task });

    const completedEvent: TaskUpdateEvent = {
      type: 'message',
      taskId: 'tsk-1',
      message: buildToolMessage('tool-1', 'completed', '2026-04-15T10:00:03.000Z'),
    };
    actions.addTaskUpdate(completedEvent);

    const messages = getState().currentTask?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('tool-1');
    expect(messages[0]?.toolStatus).toBe('completed');
    // Preserve the original timestamp so the UI doesn't re-sort on each update.
    expect(messages[0]?.timestamp).toBe('2026-04-15T10:00:00.000Z');
  });

  it('single-message path: different ids append as separate rows', () => {
    const first = buildToolMessage('tool-1', 'completed', '2026-04-15T10:00:00.000Z');
    const task = buildTask('tsk-1', [first]);
    const { actions, getState } = setupStore({ tasks: [task], currentTask: task });

    const second: TaskUpdateEvent = {
      type: 'message',
      taskId: 'tsk-1',
      message: buildToolMessage('tool-2', 'running', '2026-04-15T10:00:05.000Z'),
    };
    actions.addTaskUpdate(second);

    const messages = getState().currentTask?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(['tool-1', 'tool-2']);
  });

  it('batch path: running → completed on the same id also collapses', () => {
    const task = buildTask('tsk-1', []);
    const { actions, getState } = setupStore({ tasks: [task], currentTask: task });

    actions.addTaskUpdateBatch({
      taskId: 'tsk-1',
      messages: [
        buildToolMessage('tool-1', 'running', '2026-04-15T10:00:00.000Z'),
        buildToolMessage('tool-1', 'completed', '2026-04-15T10:00:02.000Z'),
      ],
    });

    const messages = getState().currentTask?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('tool-1');
    expect(messages[0]?.toolStatus).toBe('completed');
  });

  it('batch path: mixed merge + append in one update', () => {
    const existing = buildToolMessage('tool-1', 'running', '2026-04-15T10:00:00.000Z');
    const task = buildTask('tsk-1', [existing]);
    const { actions, getState } = setupStore({ tasks: [task], currentTask: task });

    actions.addTaskUpdateBatch({
      taskId: 'tsk-1',
      messages: [
        buildToolMessage('tool-1', 'completed', '2026-04-15T10:00:02.000Z'), // merges
        buildToolMessage('tool-2', 'running', '2026-04-15T10:00:03.000Z'), // appends
      ],
    });

    const messages = getState().currentTask?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.toolStatus).toBe('completed'); // merged
    expect(messages[1]?.toolStatus).toBe('running'); // new
  });
});
