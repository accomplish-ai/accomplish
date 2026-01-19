/**
 * Integration tests for Home page
 * Tests initial render, task input integration, and loading state
 * @module __tests__/integration/renderer/pages/Home.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Task, TaskStatus } from '@accomplish/shared';

// Mock analytics to prevent tracking calls
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackSubmitTask: vi.fn(),
  },
}));

// Create mock functions
const mockStartTask = vi.fn();
const mockAddTaskUpdate = vi.fn();
const mockSetPermissionRequest = vi.fn();
const mockHasAnyApiKey = vi.fn();
const mockOnTaskUpdate = vi.fn();
const mockOnPermissionRequest = vi.fn();
const mockLogEvent = vi.fn();

// Helper to create a mock task
function createMockTask(
  id: string,
  prompt: string = 'Test task',
  status: TaskStatus = 'running'
): Task {
  return {
    id,
    prompt,
    status,
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

// Mock accomplish API
const mockAccomplish = {
  hasAnyApiKey: mockHasAnyApiKey,
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  onTaskUpdate: mockOnTaskUpdate.mockReturnValue(() => {}),
  onPermissionRequest: mockOnPermissionRequest.mockReturnValue(() => {}),
  logEvent: mockLogEvent.mockResolvedValue(undefined),
};

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock store state holder
let mockStoreState = {
  startTask: mockStartTask,
  isLoading: false,
  addTaskUpdate: mockAddTaskUpdate,
  setPermissionRequest: mockSetPermissionRequest,
};

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mockStoreState,
}));

// Mock framer-motion for simpler testing
vi.mock('framer-motion', () => ({
  motion: {
    h1: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <h1 {...props}>{children}</h1>
    ),
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
      <button onClick={onClick} {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SettingsDialog
vi.mock('@/components/layout/SettingsDialog', () => ({
  default: ({ open, onOpenChange, onApiKeySaved }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApiKeySaved?: () => void;
  }) => (
    open ? (
      <div data-testid="settings-dialog" role="dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
        {onApiKeySaved && (
          <button onClick={onApiKeySaved}>Save API Key</button>
        )}
      </div>
    ) : null
  ),
}));

// Import after mocks
import HomePage from '@/pages/Home';

// Mock images
vi.mock('/assets/usecases/calendar-prep-notes.png', () => ({ default: 'calendar.png' }));
vi.mock('/assets/usecases/inbox-promo-cleanup.png', () => ({ default: 'inbox.png' }));
vi.mock('/assets/usecases/competitor-pricing-deck.png', () => ({ default: 'competitor.png' }));
vi.mock('/assets/usecases/notion-api-audit.png', () => ({ default: 'notion.png' }));
vi.mock('/assets/usecases/staging-vs-prod-visual.png', () => ({ default: 'staging.png' }));
vi.mock('/assets/usecases/prod-broken-links.png', () => ({ default: 'broken-links.png' }));
vi.mock('/assets/usecases/stock-portfolio-alerts.png', () => ({ default: 'stock.png' }));
vi.mock('/assets/usecases/job-application-automation.png', () => ({ default: 'job.png' }));
vi.mock('/assets/usecases/event-calendar-builder.png', () => ({ default: 'event.png' }));

describe('Home Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    mockStoreState = {
      startTask: mockStartTask,
      isLoading: false,
      addTaskUpdate: mockAddTaskUpdate,
      setPermissionRequest: mockSetPermissionRequest,
    };
    // Default to having API key
    mockHasAnyApiKey.mockResolvedValue(true);
  });

  describe('initial render', () => {
    it('should render the main heading', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByRole('heading', { name: /what will you accomplish today/i })).toBeInTheDocument();
    });

    it('should render the task input bar', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      const textarea = screen.getByPlaceholderText(/describe a task and let ai handle the rest/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should render submit button', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      const submitButton = screen.getByTitle('Submit');
      expect(submitButton).toBeInTheDocument();
    });

    it('should render example prompts section', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      expect(screen.getByText(/example prompts/i)).toBeInTheDocument();
    });

    it('should render use case example cards', async () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert - Check for some example use cases (expanded by default)
      await waitFor(() => {
        expect(screen.getByText('Calendar Prep Notes')).toBeInTheDocument();
        expect(screen.getByText('Inbox Promo Cleanup')).toBeInTheDocument();
      });
    });

    it('should subscribe to task events on mount', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      expect(mockOnTaskUpdate).toHaveBeenCalled();
      expect(mockOnPermissionRequest).toHaveBeenCalled();
    });
  });

  describe('task input integration', () => {
    it('should update input value when user types', () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'Check my calendar' } });

      // Assert
      expect(textarea).toHaveValue('Check my calendar');
    });

    it('should check for API key before submitting task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'Submit this task' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockHasAnyApiKey).toHaveBeenCalled();
      });
    });

    it('should open settings dialog when no API key exists', async () => {
      // Arrange
      mockHasAnyApiKey.mockResolvedValue(false);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'Submit without key' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });
    });

    it('should start task when API key exists', async () => {
      // Arrange
      const mockTask = createMockTask('task-123', 'My task', 'running');
      mockStartTask.mockResolvedValue(mockTask);
      mockHasAnyApiKey.mockResolvedValue(true);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockStartTask).toHaveBeenCalled();
      });
    });

    it('should not submit empty task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockHasAnyApiKey).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });

    it('should not submit whitespace-only task', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: '   ' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockHasAnyApiKey).not.toHaveBeenCalled();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });

    it('should execute task after saving API key in settings', async () => {
      // Arrange
      mockHasAnyApiKey.mockResolvedValue(false);
      const mockTask = createMockTask('task-123', 'My task', 'running');
      mockStartTask.mockResolvedValue(mockTask);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act - Submit to open settings
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Wait for dialog
      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });

      // Simulate saving API key
      const saveButton = screen.getByRole('button', { name: /save api key/i });
      fireEvent.click(saveButton);

      // Assert - Task should be started after key is saved
      await waitFor(() => {
        expect(mockStartTask).toHaveBeenCalled();
      });
    });
  });

  describe('loading state', () => {
    it('should disable input when loading', () => {
      // Arrange
      mockStoreState.isLoading = true;

      // Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      expect(textarea).toBeDisabled();
    });

    it('should disable submit button when loading', () => {
      // Arrange
      mockStoreState.isLoading = true;

      // Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert
      const submitButton = screen.getByTitle('Submit');
      expect(submitButton).toBeDisabled();
    });

    it('should not submit when already loading', async () => {
      // Arrange
      mockStoreState.isLoading = true;

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // The textarea is disabled, so we can't really type, but test submit
      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });
  });

  describe('example prompts', () => {
    it('should populate input when example is clicked', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act - Click on Calendar Prep Notes example (expanded by default)
      await waitFor(() => {
        expect(screen.getByText('Calendar Prep Notes')).toBeInTheDocument();
      });
      const exampleButton = screen.getByText('Calendar Prep Notes').closest('button');
      expect(exampleButton).toBeInTheDocument();
      fireEvent.click(exampleButton!);

      // Assert - The textarea should now contain text related to the example
      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/describe a task/i) as HTMLTextAreaElement;
        expect(textarea.value.length).toBeGreaterThan(0);
        expect(textarea.value.toLowerCase()).toContain('calendar');
      });
    });

    it('should be able to toggle example prompts visibility', async () => {
      // Arrange
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert - Examples should be visible initially (expanded by default)
      await waitFor(() => {
        expect(screen.getByText('Calendar Prep Notes')).toBeInTheDocument();
      });

      // Act - Toggle examples off
      const toggleButton = screen.getByText(/example prompts/i).closest('button');
      fireEvent.click(toggleButton!);

      // Assert - Examples should be hidden now
      await waitFor(() => {
        expect(screen.queryByText('Calendar Prep Notes')).not.toBeInTheDocument();
      });

      // Act - Toggle examples on again
      fireEvent.click(toggleButton!);

      // Assert - Examples should be visible again
      await waitFor(() => {
        expect(screen.getByText('Calendar Prep Notes')).toBeInTheDocument();
      });
    });

    it('should render all nine example use cases', async () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Assert - examples are expanded by default
      const expectedExamples = [
        'Calendar Prep Notes',
        'Inbox Promo Cleanup',
        'Competitor Pricing Deck',
        'Notion API Audit',
        'Staging vs Prod Visual Check',
        'Production Broken Links',
        'Portfolio Monitoring',
        'Job Application Automation',
        'Event Calendar Builder',
      ];

      await waitFor(() => {
        expectedExamples.forEach(example => {
          expect(screen.getByText(example)).toBeInTheDocument();
        });
      });
    });
  });

  describe('settings dialog interaction', () => {
    it('should close settings dialog without executing when cancelled', async () => {
      // Arrange
      mockHasAnyApiKey.mockResolvedValue(false);

      render(
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      );

      // Act - Open settings via submit
      const textarea = screen.getByPlaceholderText(/describe a task/i);
      fireEvent.change(textarea, { target: { value: 'My task' } });

      const submitButton = screen.getByTitle('Submit');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
      });

      // Close without saving
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Assert
      await waitFor(() => {
        expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
        expect(mockStartTask).not.toHaveBeenCalled();
      });
    });
  });
});
