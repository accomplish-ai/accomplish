/**
 * Integration tests for History page
 * Tests "Clear All" button visibility and interactions in the History page header
 * @module __tests__/integration/renderer/pages/History.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Task, TaskStatus } from '@accomplish_ai/agent-core';

// Create mock functions for task store
const mockLoadTasks = vi.fn();
const mockDeleteTask = vi.fn();
const mockClearHistory = vi.fn();

// Store state holder
let mockStoreState = {
  tasks: [] as Task[],
  loadTasks: mockLoadTasks,
  deleteTask: mockDeleteTask,
  clearHistory: mockClearHistory,
};

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mockStoreState,
}));

// Mock the Header component to keep tests focused on History page behavior
vi.mock('@/components/layout/Header', () => ({
  default: () => <header data-testid="mock-header" />,
}));

// Mock TaskHistory to avoid deep nesting in page-level tests
vi.mock('@/components/history/TaskHistory', () => ({
  default: ({ showTitle }: { showTitle?: boolean }) => (
    <div data-testid="task-history" data-show-title={String(showTitle ?? true)} />
  ),
}));

// Helper to create mock tasks
function createMockTask(id: string, prompt = 'Test task', status: TaskStatus = 'completed'): Task {
  return {
    id,
    prompt,
    status,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Import page component after mocks
import HistoryPage from '@/pages/History';

describe('HistoryPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      tasks: [],
      loadTasks: mockLoadTasks,
      deleteTask: mockDeleteTask,
      clearHistory: mockClearHistory,
    };
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  describe('page structure', () => {
    it('should render the page title', () => {
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('should render TaskHistory with showTitle=false', () => {
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );
      const taskHistory = screen.getByTestId('task-history');
      expect(taskHistory).toBeInTheDocument();
      expect(taskHistory.getAttribute('data-show-title')).toBe('false');
    });
  });

  describe('Clear All button visibility', () => {
    it('should NOT show "Clear all" button when there are no tasks', () => {
      mockStoreState.tasks = [];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('should show "Clear all" button when there are tasks', () => {
      mockStoreState.tasks = [createMockTask('task-1')];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
    });

    it('should show "Clear all" button with multiple tasks', () => {
      mockStoreState.tasks = [
        createMockTask('task-1'),
        createMockTask('task-2'),
        createMockTask('task-3'),
      ];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
    });
  });

  describe('Clear All button interaction', () => {
    it('should call clearHistory when user confirms the dialog', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockStoreState.tasks = [createMockTask('task-1')];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(clearButton);

      expect(window.confirm).toHaveBeenCalledOnce();
      expect(mockClearHistory).toHaveBeenCalledOnce();
    });

    it('should NOT call clearHistory when user cancels the dialog', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockStoreState.tasks = [createMockTask('task-1')];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(clearButton);

      expect(window.confirm).toHaveBeenCalledOnce();
      expect(mockClearHistory).not.toHaveBeenCalled();
    });

    it('should show confirm dialog before clearing', () => {
      mockStoreState.tasks = [createMockTask('task-1')];
      render(
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>,
      );

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(clearButton);

      expect(window.confirm).toHaveBeenCalledOnce();
    });
  });
});
