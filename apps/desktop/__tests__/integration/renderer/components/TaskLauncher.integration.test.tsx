/**
 * Integration tests for TaskLauncher and TaskLauncherItem components
 * Tests rendering, filtering, and task display
 * @module __tests__/integration/renderer/components/TaskLauncher.integration.test
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Task, TaskStatus } from '@accomplish/shared';

// Mock analytics to prevent tracking calls
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackNewTask: vi.fn(),
  },
}));

// Create mock functions outside of mock factory
const mockStartTask = vi.fn();
const mockCloseLauncher = vi.fn();
const mockHasAnyApiKey = vi.fn();

// Helper to create mock tasks
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'completed',
  createdAt?: string
): Task {
  return {
    id,
    prompt,
    status,
    messages: [],
    createdAt: createdAt || new Date().toISOString(),
  };
}

// Mock accomplish API
const mockAccomplish = {
  hasAnyApiKey: mockHasAnyApiKey,
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  isE2EMode: vi.fn().mockResolvedValue(false),
  getProviderSettings: vi.fn().mockResolvedValue({
    activeProviderId: 'anthropic',
    connectedProviders: {
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'connected',
        selectedModelId: 'claude-3-5-sonnet-20241022',
        credentials: { type: 'api-key', apiKey: 'test-key' },
      },
    },
    debugMode: false,
  }),
  // Provider settings methods
  setActiveProvider: vi.fn().mockResolvedValue(undefined),
  setConnectedProvider: vi.fn().mockResolvedValue(undefined),
  removeConnectedProvider: vi.fn().mockResolvedValue(undefined),
  setProviderDebugMode: vi.fn().mockResolvedValue(undefined),
  validateApiKeyForProvider: vi.fn().mockResolvedValue({ valid: true }),
  validateBedrockCredentials: vi.fn().mockResolvedValue({ valid: true }),
  saveBedrockCredentials: vi.fn().mockResolvedValue(undefined),
};

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Create a store state holder for testing
let mockStoreState = {
  isLauncherOpen: false,
  closeLauncher: mockCloseLauncher,
  tasks: [] as Task[],
  startTask: mockStartTask,
};

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mockStoreState,
}));

// Mock framer-motion to simplify testing animations
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Need to import after mocks are set up
import TaskLauncher from '@/components/TaskLauncher/TaskLauncher';
import TaskLauncherItem from '@/components/TaskLauncher/TaskLauncherItem';

describe('TaskLauncherItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render task prompt', () => {
      // Arrange
      const task = createMockTask('task-1', 'Check my email inbox');

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert
      expect(screen.getByText('Check my email inbox')).toBeInTheDocument();
    });

    it('should render task with truncated long prompt', () => {
      // Arrange
      const longPrompt = 'This is a very long task prompt that should be truncated when displayed in the UI to prevent overflow';
      const task = createMockTask('task-1', longPrompt);

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert
      const promptElement = screen.getByText(longPrompt);
      expect(promptElement.className).toContain('truncate');
    });
  });

  describe('status icons', () => {
    it('should show spinning loader for running tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Running task', 'running');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - Check for spinning loader icon
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(spinner?.getAttribute('class')).toContain('text-primary');
    });

    it('should show checkmark for completed tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Completed task', 'completed');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - CheckCircle2 icon should have green color
      const icon = container.querySelector('.text-green-500');
      expect(icon).toBeInTheDocument();
    });

    it('should show X icon for failed tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Failed task', 'failed');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - XCircle icon should have destructive color
      const icon = container.querySelector('.text-destructive');
      expect(icon).toBeInTheDocument();
    });

    it('should show alert icon for cancelled tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Cancelled task', 'cancelled');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - AlertCircle icon should have yellow color
      const icon = container.querySelector('.text-yellow-500');
      expect(icon).toBeInTheDocument();
    });

    it('should show alert icon for interrupted tasks', () => {
      // Arrange
      const task = createMockTask('task-1', 'Interrupted task', 'interrupted');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - AlertCircle icon should have yellow color
      const icon = container.querySelector('.text-yellow-500');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('relative date formatting', () => {
    it('should show "Today" for tasks created today', () => {
      // Arrange
      const today = new Date();
      const task = createMockTask('task-1', 'Today task', 'completed', today.toISOString());

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('should show "Yesterday" for tasks created yesterday', () => {
      // Arrange
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const task = createMockTask('task-1', 'Yesterday task', 'completed', yesterday.toISOString());

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    it('should show weekday name for tasks within last 7 days', () => {
      // Arrange
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const task = createMockTask('task-1', 'Recent task', 'completed', twoDaysAgo.toISOString());

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert - Should show weekday name (e.g., "Monday", "Tuesday")
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const expectedWeekday = weekdays[twoDaysAgo.getDay()];
      expect(screen.getByText(expectedWeekday)).toBeInTheDocument();
    });

    it('should show month and day for tasks older than 7 days', () => {
      // Arrange
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const task = createMockTask('task-1', 'Old task', 'completed', tenDaysAgo.toISOString());

      // Act
      render(<TaskLauncherItem task={task} />);

      // Assert - Should show format like "Jan 5"
      const expectedDate = tenDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      expect(screen.getByText(expectedDate)).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply muted date text color', () => {
      // Arrange
      const task = createMockTask('task-1', 'Task');

      // Act
      const { container } = render(<TaskLauncherItem task={task} />);

      // Assert - Date text should use muted foreground
      const dateElement = container.querySelector('.text-muted-foreground');
      expect(dateElement).toBeInTheDocument();
    });
  });
});

describe('TaskLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    mockStoreState = {
      isLauncherOpen: false,
      closeLauncher: mockCloseLauncher,
      tasks: [],
      startTask: mockStartTask,
    };
    // Set up default provider settings with a ready provider
    mockAccomplish.getProviderSettings.mockResolvedValue({
      activeProviderId: 'anthropic',
      connectedProviders: {
        anthropic: {
          providerId: 'anthropic',
          connectionStatus: 'connected',
          selectedModelId: 'claude-3-5-sonnet-20241022',
          credentials: { type: 'api-key', apiKey: 'test-key' },
        },
      },
      debugMode: false,
    });
  });

  describe('opening and closing', () => {
    it('should not render when isLauncherOpen is false', () => {
      // Arrange
      mockStoreState.isLauncherOpen = false;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.queryByPlaceholderText('Search tasks...')).not.toBeInTheDocument();
    });

    it('should render when isLauncherOpen is true', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByPlaceholderText('Search tasks...')).toBeInTheDocument();
    });

    it('should show search input when open', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      const searchInput = screen.getByPlaceholderText('Search tasks...');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput.tagName).toBe('INPUT');
    });
  });

  describe('new task option', () => {
    it('should show "New task" option', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByText('New task')).toBeInTheDocument();
    });

    it('should show search query in new task option when search has text', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'my new task' } });

      // Assert
      expect(screen.getByText(/"my new task"/)).toBeInTheDocument();
    });

    it('should not show search query preview when search is empty', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    });
  });

  describe('task filtering', () => {
    it('should show "Last 7 days" section when no search query', () => {
      // Arrange
      const today = new Date();
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [
        createMockTask('task-1', 'Recent task', 'completed', today.toISOString()),
      ];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });

    it('should show "Results" section when searching', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [createMockTask('task-1', 'Check email')];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'email' } });

      // Assert
      expect(screen.getByText('Results')).toBeInTheDocument();
    });

    it('should filter tasks by search query', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [
        createMockTask('task-1', 'Check my email inbox'),
        createMockTask('task-2', 'Review calendar'),
        createMockTask('task-3', 'Send email to team'),
      ];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'email' } });

      // Assert
      expect(screen.getByText('Check my email inbox')).toBeInTheDocument();
      expect(screen.getByText('Send email to team')).toBeInTheDocument();
      expect(screen.queryByText('Review calendar')).not.toBeInTheDocument();
    });

    it('should be case-insensitive when filtering', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [createMockTask('task-1', 'Check my EMAIL inbox')];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'email' } });

      // Assert
      expect(screen.getByText('Check my EMAIL inbox')).toBeInTheDocument();
    });

    it('should only show tasks from last 7 days when no search', () => {
      // Arrange
      const today = new Date();
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(today.getDate() - 5);
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(today.getDate() - 10);

      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [
        createMockTask('task-1', 'Recent task', 'completed', fiveDaysAgo.toISOString()),
        createMockTask('task-2', 'Old task', 'completed', tenDaysAgo.toISOString()),
      ];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByText('Recent task')).toBeInTheDocument();
      expect(screen.queryByText('Old task')).not.toBeInTheDocument();
    });

    it('should show all matching tasks regardless of age when searching', () => {
      // Arrange
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [
        createMockTask('task-1', 'Old email task', 'completed', tenDaysAgo.toISOString()),
      ];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'email' } });

      // Assert
      expect(screen.getByText('Old email task')).toBeInTheDocument();
    });

    it('should limit results to 10 tasks', () => {
      // Arrange
      const today = new Date();
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = Array.from({ length: 15 }, (_, i) =>
        createMockTask(`task-${i}`, `Task ${i}`, 'completed', today.toISOString())
      );

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert - Should show 10 tasks maximum
      // Check for task prompts (Task 0 through Task 9)
      expect(screen.getByText('Task 0')).toBeInTheDocument();
      expect(screen.getByText('Task 9')).toBeInTheDocument();
      expect(screen.queryByText('Task 10')).not.toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('should start with first item selected', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      const newTaskItem = screen.getByText('New task').closest('[data-slot="command-item"]');
      expect(newTaskItem).toHaveAttribute('data-highlighted');
    });

    it('should move selection down with ArrowDown', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [createMockTask('task-1', 'First task')];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

      // Assert
      const taskItem = screen.getByText('First task').closest('[data-slot="command-item"]');
      expect(taskItem).toHaveAttribute('data-highlighted');
    });

    it('should move selection up with ArrowUp', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [createMockTask('task-1', 'First task')];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowUp' });

      // Assert
      const newTaskItem = screen.getByText('New task').closest('[data-slot="command-item"]');
      expect(newTaskItem).toHaveAttribute('data-highlighted');
    });
  });

  describe('task selection', () => {
    it('should start new task when New task is selected with search text', async () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      const mockTask = createMockTask('new-task', 'Test prompt');
      mockStartTask.mockResolvedValue(mockTask);

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'Test prompt' } });

      const newTaskItem = screen.getByText('New task').closest('[data-slot="command-item"]');
      if (newTaskItem) {
        fireEvent.click(newTaskItem);
      }

      // Assert
      await waitFor(() => {
        expect(mockCloseLauncher).toHaveBeenCalled();
        expect(mockStartTask).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: 'Test prompt',
          })
        );
      });
    });

    it('should close launcher when task item is clicked', async () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [createMockTask('task-123', 'Existing task')];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const taskItem = screen.getByText('Existing task').closest('[data-slot="command-item"]');
      if (taskItem) {
        fireEvent.click(taskItem);
      }

      // Assert
      await waitFor(() => {
        expect(mockCloseLauncher).toHaveBeenCalled();
      });
    });
  });

  describe('UI elements', () => {
    it('should show keyboard hints in footer', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByText('Navigate')).toBeInTheDocument();
      expect(screen.getByText('Select')).toBeInTheDocument();
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty tasks array', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      mockStoreState.tasks = [];

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert - Should show New task and no error
      expect(screen.getByText('New task')).toBeInTheDocument();
      expect(screen.queryByText('Last 7 days')).not.toBeInTheDocument();
    });

    it('should trim whitespace from search query', async () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;
      const mockTask = createMockTask('new-task', 'Trimmed prompt');
      mockStartTask.mockResolvedValue(mockTask);

      // Act
      render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: '  Trimmed prompt  ' } });

      const newTaskItem = screen.getByText('New task').closest('[data-slot="command-item"]');
      if (newTaskItem) {
        fireEvent.click(newTaskItem);
      }

      // Assert
      await waitFor(() => {
        expect(mockStartTask).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: 'Trimmed prompt',
          })
        );
      });
    });

    it('should clear search when reopened', () => {
      // Arrange
      mockStoreState.isLauncherOpen = true;

      // Act
      const { rerender } = render(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText('Search tasks...');
      fireEvent.change(searchInput, { target: { value: 'some search' } });

      // Close and reopen
      mockStoreState.isLauncherOpen = false;
      rerender(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      mockStoreState.isLauncherOpen = true;
      rerender(
        <MemoryRouter>
          <TaskLauncher />
        </MemoryRouter>
      );

      // Assert
      const newSearchInput = screen.getByPlaceholderText('Search tasks...');
      expect(newSearchInput).toHaveValue('');
    });
  });
});
