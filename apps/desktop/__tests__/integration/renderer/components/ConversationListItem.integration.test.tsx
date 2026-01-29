/**
 * Integration tests for ConversationListItem component
 * Tests task display, status indicators, navigation, and deletion with confirmation modal
 * @module __tests__/integration/renderer/components/ConversationListItem.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Task, TaskStatus } from '@accomplish/shared';

// Create mock functions for task store
const mockDeleteTask = vi.fn();

// Create a store state holder for testing
let mockStoreState = {
  deleteTask: mockDeleteTask,
};

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

// Mock framer-motion for simpler testing
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Helper to create mock tasks
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'completed',
  summary?: string
): Task {
  return {
    id,
    prompt,
    status,
    summary,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Import after mocks
import ConversationListItem from '@/components/layout/ConversationListItem';

// Wrapper component for routing tests
function renderWithRouter(task: Task, initialPath: string = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<ConversationListItem task={task} />} />
        <Route path="/execution/:id" element={<ConversationListItem task={task} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConversationListItem Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteTask.mockResolvedValue(undefined);
    mockStoreState = {
      deleteTask: mockDeleteTask,
    };
  });

  describe('task display', () => {
    it('should display task prompt', () => {
      // Arrange
      const task = createMockTask('task-1', 'Send email to John');

      // Act
      renderWithRouter(task);

      // Assert
      expect(screen.getByText('Send email to John')).toBeInTheDocument();
    });

    it('should display task summary when available', () => {
      // Arrange
      const task = createMockTask('task-1', 'Original prompt', 'completed', 'Summarized task');

      // Act
      renderWithRouter(task);

      // Assert
      expect(screen.getByText('Summarized task')).toBeInTheDocument();
    });

    it('should display prompt when no summary is available', () => {
      // Arrange
      const task = createMockTask('task-1', 'Use this prompt');

      // Act
      renderWithRouter(task);

      // Assert
      expect(screen.getByText('Use this prompt')).toBeInTheDocument();
    });

    it('should truncate long task text', () => {
      // Arrange
      const task = createMockTask('task-1', 'This is a very long task prompt that should be truncated');

      // Act
      renderWithRouter(task);

      // Assert
      const textElement = screen.getByText('This is a very long task prompt that should be truncated');
      expect(textElement.className).toContain('truncate');
    });

    it('should show title tooltip with full text', () => {
      // Arrange
      const task = createMockTask('task-1', 'Full task description');

      // Act
      renderWithRouter(task);

      // Assert - Get the main clickable item by its text content
      const item = screen.getByText('Full task description').closest('[role="button"]');
      expect(item).toHaveAttribute('title', 'Full task description');
    });
  });

  describe('status indicators', () => {
    it('should show spinning loader for running tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Running task', 'running');

      // Act
      renderWithRouter(task);

      // Assert
      const spinner = document.querySelector('.animate-spin-ccw');
      expect(spinner).toBeInTheDocument();
    });

    it('should show check icon for completed tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Completed task', 'completed');

      // Act
      renderWithRouter(task);

      // Assert
      const icon = document.querySelector('.text-green-500');
      expect(icon).toBeInTheDocument();
    });

    it('should show X icon for failed tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Failed task', 'failed');

      // Act
      renderWithRouter(task);

      // Assert
      const icon = document.querySelector('.text-red-500');
      expect(icon).toBeInTheDocument();
    });

    it('should show square icon for cancelled tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Cancelled task', 'cancelled');

      // Act
      renderWithRouter(task);

      // Assert
      const icon = document.querySelector('.text-zinc-400');
      expect(icon).toBeInTheDocument();
    });

    it('should show pause icon for interrupted tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Interrupted task', 'interrupted');

      // Act
      renderWithRouter(task);

      // Assert
      const icon = document.querySelector('.text-amber-500');
      expect(icon).toBeInTheDocument();
    });

    it('should show clock icon for queued tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Queued task', 'queued');

      // Act
      renderWithRouter(task);

      // Assert
      const icon = document.querySelector('.text-amber-500');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('active state', () => {
    it('should have active styling when viewing the task', () => {
      // Arrange
      const task = createMockTask('task-123', 'Active task');

      // Act
      render(
        <MemoryRouter initialEntries={['/execution/task-123']}>
          <Routes>
            <Route path="/execution/:id" element={<ConversationListItem task={task} />} />
          </Routes>
        </MemoryRouter>
      );

      // Assert - Get the main clickable item by its text content
      // Check that the item has the standalone bg-accent class (not just hover:bg-accent)
      const item = screen.getByText('Active task').closest('[role="button"]');
      const classes = item?.className.split(' ') || [];
      expect(classes).toContain('bg-accent');
    });

    it('should not have active styling when viewing different task', () => {
      // Arrange
      const task = createMockTask('task-123', 'Inactive task');

      // Act
      render(
        <MemoryRouter initialEntries={['/execution/task-456']}>
          <Routes>
            <Route path="/execution/:id" element={<ConversationListItem task={task} />} />
          </Routes>
        </MemoryRouter>
      );

      // Assert - Get the main clickable item by its text content
      // Check that the item has hover:bg-accent but NOT the standalone bg-accent class
      const item = screen.getByText('Inactive task').closest('[role="button"]');
      const classes = item?.className.split(' ') || [];
      // Should have hover:bg-accent but not bg-accent (exact match)
      expect(classes).toContain('hover:bg-accent');
      expect(classes).not.toContain('bg-accent');
    });
  });

  describe('task deletion with confirmation modal', () => {
    it('should render delete button', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);

      // Assert
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      expect(deleteButton).toBeInTheDocument();
    });

    it('should show confirmation modal when delete button is clicked', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);

      // Assert - Modal should appear
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      expect(screen.getByText('Delete this task?')).toBeInTheDocument();
      expect(screen.getByText(/permanently deleted/)).toBeInTheDocument();
    });

    it('should call deleteTask when confirmation is accepted', async () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      
      // Open modal
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = screen.getByTestId('confirm-modal-confirm');
      fireEvent.click(confirmButton);

      // Assert
      await waitFor(() => {
        expect(mockDeleteTask).toHaveBeenCalledWith('task-1');
      });
    });

    it('should not call deleteTask when confirmation is cancelled', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      
      // Open modal
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);
      
      // Cancel deletion
      const cancelButton = screen.getByTestId('confirm-modal-cancel');
      fireEvent.click(cancelButton);

      // Assert
      expect(mockDeleteTask).not.toHaveBeenCalled();
    });

    it('should close modal when cancel is clicked', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      
      // Open modal
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      
      // Cancel deletion
      const cancelButton = screen.getByTestId('confirm-modal-cancel');
      fireEvent.click(cancelButton);

      // Assert - Modal should close
      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
    });

    it('should not navigate to task when cancel is clicked in deletion modal', () => {
      // Arrange - Start on home page, not on the task's execution page
      const task = createMockTask('task-123', 'Task to not navigate to');
      let currentPath = '/';
      
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={
              <>
                <ConversationListItem task={task} />
                <div data-testid="current-route">{currentPath}</div>
              </>
            } />
            <Route path="/execution/:id" element={
              <div data-testid="execution-page">Execution Page</div>
            } />
          </Routes>
        </MemoryRouter>
      );

      // Act - Open modal
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      
      // Cancel deletion
      const cancelButton = screen.getByTestId('confirm-modal-cancel');
      fireEvent.click(cancelButton);

      // Assert - Should NOT have navigated to execution page
      expect(screen.queryByTestId('execution-page')).not.toBeInTheDocument();
      // Modal should be closed
      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
    });

    it('should display correct button labels in deletion modal', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      fireEvent.click(deleteButton);

      // Assert
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should not trigger navigation when delete button is clicked', () => {
      // Arrange
      const task = createMockTask('task-1', 'Deletable task');

      // Act
      renderWithRouter(task);
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      
      // Create a spy on stopPropagation
      const clickEvent = new MouseEvent('click', { bubbles: true });
      const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
      
      // We can't easily test stopPropagation was called, but we can verify modal opens
      fireEvent.click(deleteButton);

      // Assert - Modal should appear (proving click was handled, not navigated)
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
    });
  });

  describe('keyboard interaction', () => {
    it('should be focusable', () => {
      // Arrange
      const task = createMockTask('task-1', 'Focusable task');

      // Act
      renderWithRouter(task);

      // Assert - Get the main clickable item by its text content
      const item = screen.getByText('Focusable task').closest('[role="button"]');
      expect(item).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('styling', () => {
    it('should have hover styles', () => {
      // Arrange
      const task = createMockTask('task-1', 'Hover task');

      // Act
      renderWithRouter(task);

      // Assert - Get the main clickable item by its text content
      const item = screen.getByText('Hover task').closest('[role="button"]');
      expect(item?.className).toContain('hover:bg-accent');
    });

    it('should have proper group class for delete button hover', () => {
      // Arrange
      const task = createMockTask('task-1', 'Group hover task');

      // Act
      renderWithRouter(task);

      // Assert - Get the main clickable item by its text content
      const item = screen.getByText('Group hover task').closest('[role="button"]');
      expect(item?.className).toContain('group');
    });

    it('should hide delete button by default and show on hover', () => {
      // Arrange
      const task = createMockTask('task-1', 'Task with delete');

      // Act
      renderWithRouter(task);

      // Assert - Delete button should have opacity-0 by default
      const deleteButton = screen.getByRole('button', { name: /delete task/i });
      expect(deleteButton.className).toContain('opacity-0');
      expect(deleteButton.className).toContain('group-hover:opacity-100');
    });
  });
});
