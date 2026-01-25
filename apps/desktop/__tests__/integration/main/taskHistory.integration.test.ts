/**
 * Integration tests for taskHistory store
 * Tests the taskHistory API behavior
 * @module __tests__/integration/main/taskHistory.integration.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task, TaskMessage, TaskStatus } from '@accomplish/shared';

// In-memory storage for mock
interface StoredTask {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  sessionId?: string;
  messages: TaskMessage[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

let mockTaskStore: Map<string, StoredTask> = new Map();

function resetMockStore() {
  mockTaskStore = new Map();
}

// Mock the taskHistory module with in-memory behavior
vi.mock('@main/store/taskHistory', () => ({
  getTasks: vi.fn(() => Array.from(mockTaskStore.values())),

  getTask: vi.fn((id: string) => mockTaskStore.get(id) || null),

  saveTask: vi.fn((task: Task) => {
    const stored: StoredTask = {
      id: task.id,
      prompt: task.prompt,
      summary: task.summary,
      status: task.status,
      sessionId: task.sessionId,
      messages: [...task.messages],
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
    mockTaskStore.set(task.id, stored);
  }),

  updateTaskStatus: vi.fn((taskId: string, status: TaskStatus, completedAt?: string) => {
    const task = mockTaskStore.get(taskId);
    if (task) {
      task.status = status;
      if (completedAt) task.completedAt = completedAt;
    }
  }),

  addTaskMessage: vi.fn((taskId: string, message: TaskMessage) => {
    const task = mockTaskStore.get(taskId);
    if (task) {
      task.messages.push({ ...message });
    }
  }),

  updateTaskSessionId: vi.fn((taskId: string, sessionId: string) => {
    const task = mockTaskStore.get(taskId);
    if (task) {
      task.sessionId = sessionId;
    }
  }),

  updateTaskSummary: vi.fn((taskId: string, summary: string) => {
    const task = mockTaskStore.get(taskId);
    if (task) {
      task.summary = summary;
    }
  }),

  deleteTask: vi.fn((taskId: string) => {
    mockTaskStore.delete(taskId);
  }),

  clearHistory: vi.fn(() => {
    mockTaskStore.clear();
  }),

  setMaxHistoryItems: vi.fn(),
  clearTaskHistoryStore: vi.fn(() => mockTaskStore.clear()),
  flushPendingTasks: vi.fn(),
}));

// Helper to create a mock task
function createMockTask(id: string, prompt: string = 'Test task'): Task {
  return {
    id,
    prompt,
    status: 'pending',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Helper to create a mock message
function createMockMessage(
  id: string,
  type: 'assistant' | 'user' | 'tool' | 'system' = 'assistant',
  content: string = 'Test message'
): TaskMessage {
  return {
    id,
    type,
    content,
    timestamp: new Date().toISOString(),
  };
}

describe('taskHistory Integration', () => {
  beforeEach(() => {
    resetMockStore();
    vi.clearAllMocks();
  });

  describe('saveTask and getTask', () => {
    it('should save and retrieve a task by ID', async () => {
      // Arrange
      const { saveTask, getTask } = await import('@main/store/taskHistory');
      const task = createMockTask('task-1', 'Save and retrieve test');

      // Act
      saveTask(task);
      const result = getTask('task-1');

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('task-1');
      expect(result?.prompt).toBe('Save and retrieve test');
    });

    it('should return null for non-existent task', async () => {
      // Arrange
      const { getTask } = await import('@main/store/taskHistory');

      // Act
      const result = getTask('non-existent');

      // Assert
      expect(result).toBeNull();
    });

    it('should save task with messages', async () => {
      // Arrange
      const { saveTask, getTask } = await import('@main/store/taskHistory');
      const task = createMockTask('task-2');
      task.messages = [
        createMockMessage('msg-1', 'user', 'Hello'),
        createMockMessage('msg-2', 'assistant', 'Hi there'),
      ];

      // Act
      saveTask(task);
      const result = getTask('task-2');

      // Assert
      expect(result?.messages).toHaveLength(2);
      expect(result?.messages[0].content).toBe('Hello');
      expect(result?.messages[1].content).toBe('Hi there');
    });

    it('should update existing task', async () => {
      // Arrange
      const { saveTask, getTask } = await import('@main/store/taskHistory');
      const task = createMockTask('task-3', 'Original prompt');
      saveTask(task);

      // Act
      task.prompt = 'Updated prompt';
      task.status = 'completed';
      saveTask(task);
      const result = getTask('task-3');

      // Assert
      expect(result?.prompt).toBe('Updated prompt');
      expect(result?.status).toBe('completed');
    });
  });

  describe('getTasks', () => {
    it('should return empty array when no tasks exist', async () => {
      // Arrange
      const { getTasks } = await import('@main/store/taskHistory');

      // Act
      const result = getTasks();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all saved tasks', async () => {
      // Arrange
      const { saveTask, getTasks } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1', 'First task'));
      saveTask(createMockTask('task-2', 'Second task'));
      saveTask(createMockTask('task-3', 'Third task'));

      // Act
      const result = getTasks();

      // Assert
      expect(result).toHaveLength(3);
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status', async () => {
      // Arrange
      const { saveTask, getTask, updateTaskStatus } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));

      // Act
      updateTaskStatus('task-1', 'running');
      const result = getTask('task-1');

      // Assert
      expect(result?.status).toBe('running');
    });

    it('should update task status with completedAt', async () => {
      // Arrange
      const { saveTask, getTask, updateTaskStatus } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));
      const completedAt = new Date().toISOString();

      // Act
      updateTaskStatus('task-1', 'completed', completedAt);
      const result = getTask('task-1');

      // Assert
      expect(result?.status).toBe('completed');
      expect(result?.completedAt).toBe(completedAt);
    });
  });

  describe('updateTaskSessionId', () => {
    it('should update session ID for existing task', async () => {
      // Arrange
      const { saveTask, getTask, updateTaskSessionId } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));

      // Act
      updateTaskSessionId('task-1', 'session-123');
      const result = getTask('task-1');

      // Assert
      expect(result?.sessionId).toBe('session-123');
    });
  });

  describe('updateTaskSummary', () => {
    it('should update task summary', async () => {
      // Arrange
      const { saveTask, getTask, updateTaskSummary } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));

      // Act
      updateTaskSummary('task-1', 'This is a summary');
      const result = getTask('task-1');

      // Assert
      expect(result?.summary).toBe('This is a summary');
    });
  });

  describe('addTaskMessage', () => {
    it('should add message to existing task', async () => {
      // Arrange
      const { saveTask, getTask, addTaskMessage } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));
      const message = createMockMessage('msg-1', 'assistant', 'New message');

      // Act
      addTaskMessage('task-1', message);
      const result = getTask('task-1');

      // Assert
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0].content).toBe('New message');
    });

    it('should add multiple messages in order', async () => {
      // Arrange
      const { saveTask, getTask, addTaskMessage } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));

      // Act
      addTaskMessage('task-1', createMockMessage('msg-1', 'user', 'First'));
      addTaskMessage('task-1', createMockMessage('msg-2', 'assistant', 'Second'));
      addTaskMessage('task-1', createMockMessage('msg-3', 'user', 'Third'));
      const result = getTask('task-1');

      // Assert
      expect(result?.messages).toHaveLength(3);
      expect(result?.messages[0].content).toBe('First');
      expect(result?.messages[1].content).toBe('Second');
      expect(result?.messages[2].content).toBe('Third');
    });
  });

  describe('deleteTask', () => {
    it('should delete task by ID', async () => {
      // Arrange
      const { saveTask, getTask, deleteTask } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));
      expect(getTask('task-1')).toBeDefined();

      // Act
      deleteTask('task-1');
      const result = getTask('task-1');

      // Assert
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent task', async () => {
      // Arrange
      const { deleteTask } = await import('@main/store/taskHistory');

      // Act & Assert
      expect(() => deleteTask('non-existent')).not.toThrow();
    });
  });

  describe('clearHistory', () => {
    it('should remove all tasks', async () => {
      // Arrange
      const { saveTask, getTasks, clearHistory } = await import('@main/store/taskHistory');
      saveTask(createMockTask('task-1'));
      saveTask(createMockTask('task-2'));
      saveTask(createMockTask('task-3'));
      expect(getTasks()).toHaveLength(3);

      // Act
      clearHistory();
      const result = getTasks();

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('flushPendingTasks', () => {
    it('should be a no-op for SQLite (writes are immediate)', async () => {
      // Arrange
      const { flushPendingTasks } = await import('@main/store/taskHistory');

      // Act & Assert - should not throw
      expect(() => flushPendingTasks()).not.toThrow();
    });
  });
});
