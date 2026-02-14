/**
 * Integration tests for TaskInputBar component
 * Tests component rendering and user interactions with mocked window.accomplish API
 * @module __tests__/integration/renderer/components/TaskInputBar.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import TaskInputBar from '@/components/landing/TaskInputBar';

// Helper to render with Router context (required for PlusMenu -> CreateSkillModal -> useNavigate)
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// Mock accomplish API
const mockAccomplish = {
  logEvent: vi.fn().mockResolvedValue(undefined),
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
  speechIsConfigured: vi.fn().mockResolvedValue(true),
};

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock Radix Tooltip to render content directly (portals don't work in jsdom)
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, ...props }: { children: React.ReactNode; asChild?: boolean;[key: string]: unknown }) => (
    <span data-slot="tooltip-trigger" {...props}>{children}</span>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span role="tooltip" data-slot="tooltip-content">{children}</span>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('TaskInputBar Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with empty state', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('');
    });

    it('should render with default placeholder', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Assign a task or ask anything');
      expect(textarea).toBeInTheDocument();
    });

    it('should render with custom placeholder', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const customPlaceholder = 'Enter your task here';

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={customPlaceholder}
        />
      );

      const textarea = screen.getByPlaceholderText(customPlaceholder);
      expect(textarea).toBeInTheDocument();
    });

    it('should render with provided value', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const taskValue = 'Review my inbox for urgent messages';

      renderWithRouter(
        <TaskInputBar
          value={taskValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue(taskValue);
    });

    it('should render submit button', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('user input handling', () => {
    it('should call onChange when user types', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New task input' } });

      expect(onChange).toHaveBeenCalledWith('New task input');
    });

    it('should call onChange with each input change', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { rerender } = render(
        <MemoryRouter>
          <TaskInputBar
            value=""
            onChange={onChange}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'First' } });

      // Rerender with updated value
      rerender(
        <MemoryRouter>
          <TaskInputBar
            value="First"
            onChange={onChange}
            onSubmit={onSubmit}
          />
        </MemoryRouter>
      );

      fireEvent.change(textarea, { target: { value: 'First input' } });

      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenNthCalledWith(1, 'First');
      expect(onChange).toHaveBeenNthCalledWith(2, 'First input');
    });
  });

  describe('submit button behavior', () => {
    it('should disable submit button when value is empty', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when value is only whitespace', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="   "
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when value has content', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Check my calendar"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should call onSubmit when submit button is clicked', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Submit this task"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('should call onSubmit when Enter is pressed without Shift', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Submit via Enter"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('should not call onSubmit when Shift+Enter is pressed', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Multiline text"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not submit when clicking disabled button', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should disable textarea when loading', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Task in progress"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={true}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should disable submit button when loading', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Task in progress"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();
    });

    it('should show loading spinner in submit button when loading', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Task in progress"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      const spinner = submitButton.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should have disabled textarea that prevents user input when loading', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Loading task"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={true}
        />
      );

      // Note: In jsdom, keydown events still fire on disabled elements,
      // but in a real browser, disabled elements don't receive keyboard input
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });
  });

  describe('disabled state', () => {
    it('should disable textarea when disabled prop is true', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Disabled input"
          onChange={onChange}
          onSubmit={onSubmit}
          disabled={true}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should disable submit button when disabled prop is true', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Disabled input"
          onChange={onChange}
          onSubmit={onSubmit}
          disabled={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('message length limit', () => {
    it('should disable submit button when message exceeds max length', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const oversizedValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH + 1);

      renderWithRouter(
        <TaskInputBar
          value={oversizedValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByTestId('task-input-submit');
      expect(submitButton).toBeDisabled();
    });

    it('should not disable submit button when message is at max length', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const exactLimitValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH);

      renderWithRouter(
        <TaskInputBar
          value={exactLimitValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByTestId('task-input-submit');
      expect(submitButton).not.toBeDisabled();
    });

    it('should not call onSubmit when clicking submit with oversized message', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const oversizedValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH + 1);

      renderWithRouter(
        <TaskInputBar
          value={oversizedValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const submitButton = screen.getByTestId('task-input-submit');
      fireEvent.click(submitButton);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should show "Enter a message" tooltip when input is empty', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const tooltips = screen.getAllByRole('tooltip');
      const submitTooltip = tooltips.find(t => t.textContent === 'Enter a message');
      expect(submitTooltip).toBeDefined();
    });

    it('should show "Message is too long" tooltip when message exceeds limit', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const oversizedValue = 'a'.repeat(PROMPT_DEFAULT_MAX_LENGTH + 1);

      renderWithRouter(
        <TaskInputBar
          value={oversizedValue}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const tooltips = screen.getAllByRole('tooltip');
      const submitTooltip = tooltips.find(t => t.textContent === 'Message is too long');
      expect(submitTooltip).toBeDefined();
    });

    it('should show "Submit" tooltip when message is valid', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value="Normal message"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const tooltips = screen.getAllByRole('tooltip');
      const submitTooltip = tooltips.find(t => t.textContent === 'Submit');
      expect(submitTooltip).toBeDefined();
    });
  });

  describe('large variant', () => {
    it('should apply consistent text style when large prop is true', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          large={true}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea.className).toContain('text-[15px]');
    });

    it('should apply consistent text size when large prop is false', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          large={false}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea.className).toContain('text-[15px]');
    });
  });

  describe('drag and drop attachments', () => {
    const createMockFile = (name: string, size: number, type = 'application/octet-stream') => {
      const file = new File(['x'.repeat(Math.min(size, 100))], name, { type });
      Object.defineProperty(file, 'size', { value: size });
      Object.defineProperty(file, 'path', { value: `/mock/path/${name}` });
      return file;
    };

    const createMockDataTransfer = (files: File[]) => {
      return {
        files,
        types: ['Files'],
        items: files.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f })),
      };
    };

    it('should show drop zone overlay on drag over', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      fireEvent.dragOver(inputContainer, {
        dataTransfer: { types: ['Files'] },
      });

      expect(screen.getByTestId('drop-zone-overlay')).toBeTruthy();
      expect(screen.getByText('Drop files here')).toBeTruthy();
    });

    it('should hide drop zone overlay on drag leave', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      fireEvent.dragOver(inputContainer, {
        dataTransfer: { types: ['Files'] },
      });
      expect(screen.getByTestId('drop-zone-overlay')).toBeTruthy();

      fireEvent.dragLeave(inputContainer);
      expect(screen.queryByTestId('drop-zone-overlay')).toBeNull();
    });

    it('should call onAttachmentsChange when files are dropped', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      const mockFile = createMockFile('test.txt', 1024);

      fireEvent.drop(inputContainer, {
        dataTransfer: createMockDataTransfer([mockFile]),
      });

      expect(onAttachmentsChange).toHaveBeenCalledTimes(1);
      const newAttachments = onAttachmentsChange.mock.calls[0][0];
      expect(newAttachments).toHaveLength(1);
      expect(newAttachments[0].name).toBe('test.txt');
      expect(newAttachments[0].path).toBe('/mock/path/test.txt');
      expect(newAttachments[0].type).toBe('text');
      expect(newAttachments[0].size).toBe(1024);
    });

    it('should render file attachment chips when attachments are provided', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();
      const attachments = [
        { id: 'file_1', name: 'readme.md', path: '/path/readme.md', type: 'text' as const, size: 2048 },
        { id: 'file_2', name: 'logo.png', path: '/path/logo.png', type: 'image' as const, size: 5120 },
      ];

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      expect(screen.getByTestId('attachment-chips')).toBeTruthy();
      expect(screen.getByTestId('file-chip-file_1')).toBeTruthy();
      expect(screen.getByTestId('file-chip-file_2')).toBeTruthy();
      expect(screen.getByText('readme.md')).toBeTruthy();
      expect(screen.getByText('logo.png')).toBeTruthy();
    });

    it('should call onAttachmentsChange when removing a file chip', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();
      const attachments = [
        { id: 'file_1', name: 'readme.md', path: '/path/readme.md', type: 'text' as const, size: 2048 },
        { id: 'file_2', name: 'logo.png', path: '/path/logo.png', type: 'image' as const, size: 5120 },
      ];

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const removeButton = screen.getByTestId('file-chip-remove-file_1');
      fireEvent.click(removeButton);

      expect(onAttachmentsChange).toHaveBeenCalledTimes(1);
      const updatedAttachments = onAttachmentsChange.mock.calls[0][0];
      expect(updatedAttachments).toHaveLength(1);
      expect(updatedAttachments[0].id).toBe('file_2');
    });

    it('should show error when dropping more than 5 files', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      const files = Array.from({ length: 6 }, (_, i) => createMockFile(`file${i}.txt`, 1024));

      fireEvent.drop(inputContainer, {
        dataTransfer: createMockDataTransfer(files),
      });

      expect(onAttachmentsChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('attachment-error')).toBeTruthy();
      expect(screen.getByTestId('attachment-error').textContent).toContain('Maximum 5 files');
    });

    it('should show error when dropping a file over 10MB', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      const largeFile = createMockFile('huge.zip', 11 * 1024 * 1024);

      fireEvent.drop(inputContainer, {
        dataTransfer: createMockDataTransfer([largeFile]),
      });

      expect(onAttachmentsChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('attachment-error')).toBeTruthy();
      expect(screen.getByTestId('attachment-error').textContent).toContain('under 10MB');
    });

    it('should enable submit with attachments even when text is empty', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();
      const attachments = [
        { id: 'file_1', name: 'data.csv', path: '/path/data.csv', type: 'text' as const, size: 512 },
      ];

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should update placeholder when attachments exist', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();
      const attachments = [
        { id: 'file_1', name: 'test.txt', path: '/path/test.txt', type: 'text' as const, size: 100 },
      ];

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Original placeholder"
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea.getAttribute('placeholder')).toBe('Add a message or submit with files...');
    });

    it('should not add files when disabled', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      renderWithRouter(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          disabled={true}
          attachments={[]}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const inputContainer = screen.getByTestId('task-input-textarea').closest('.rounded-xl')!;
      const mockFile = createMockFile('test.txt', 1024);

      fireEvent.drop(inputContainer, {
        dataTransfer: createMockDataTransfer([mockFile]),
      });

      expect(onAttachmentsChange).not.toHaveBeenCalled();
    });
  });
});
