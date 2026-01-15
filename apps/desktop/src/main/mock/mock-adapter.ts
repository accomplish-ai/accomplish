/**
 * Mock OpenCode Adapter
 *
 * Provides a mock implementation of the OpenCode CLI for development
 * and testing purposes. This allows contributors to develop UI features
 * without requiring actual API keys.
 *
 * Enable by setting environment variable: MOCK_MODE=1
 *
 * @module main/mock/mock-adapter
 */

import { EventEmitter } from 'events';
import type {
  TaskConfig,
  Task,
  TaskResult,
  OpenCodeMessage,
  PermissionRequest,
} from '@accomplish/shared';

/**
 * Check if mock mode is enabled
 */
export function isMockModeEnabled(): boolean {
  return process.env.MOCK_MODE === '1' || process.env.MOCK_MODE === 'true';
}

/**
 * Simulated delays for realistic mock behavior
 */
const MOCK_DELAYS = {
  START: 500,
  MESSAGE: 1000,
  TOOL_START: 300,
  TOOL_COMPLETE: 800,
  COMPLETE: 500,
};

/**
 * Sample mock messages for different scenarios
 */
const MOCK_RESPONSES = {
  greeting: [
    "Hello! I'm your AI assistant. How can I help you today?",
    "Hi there! I'm ready to help with your tasks. What would you like me to do?",
    "Greetings! I'm here to assist you. Please let me know what you need.",
  ],
  thinking: [
    "Let me think about that...",
    "I'm analyzing your request...",
    "Processing your request...",
  ],
  tool_use: [
    "I'll use a tool to help with this.",
    "Let me check that for you.",
    "Running a quick analysis...",
  ],
  completion: [
    "I've completed the task. Is there anything else you'd like me to help with?",
    "All done! Let me know if you need anything else.",
    "Task completed successfully. What's next?",
  ],
};

/**
 * Get a random item from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a unique ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * MockOpenCodeAdapter simulates the OpenCode CLI behavior
 */
export class MockOpenCodeAdapter extends EventEmitter {
  private currentTaskId: string | null = null;
  private currentSessionId: string | null = null;
  private isDisposed = false;

  constructor(taskId?: string) {
    super();
    this.currentTaskId = taskId || null;
  }

  /**
   * Start a mock task
   */
  async startTask(config: TaskConfig): Promise<Task> {
    if (this.isDisposed) {
      throw new Error('Adapter has been disposed');
    }

    this.currentTaskId = config.taskId || generateId('task');
    this.currentSessionId = generateId('session');

    const task: Task = {
      id: this.currentTaskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    // Simulate async task execution
    this.simulateTaskExecution(config.prompt);

    return task;
  }

  /**
   * Simulate task execution with realistic delays
   */
  private async simulateTaskExecution(prompt: string): Promise<void> {
    // Emit progress
    await this.delay(MOCK_DELAYS.START);
    this.emit('progress', { stage: 'init', message: 'Starting task...' });

    // Emit step_start
    this.emitMessage({
      type: 'step_start',
      part: {
        id: generateId('step'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'step-start',
      },
    });

    // Emit thinking message
    await this.delay(MOCK_DELAYS.MESSAGE);
    this.emitMessage({
      type: 'text',
      part: {
        id: generateId('text'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'text',
        text: randomChoice(MOCK_RESPONSES.thinking),
      },
    });

    // Simulate tool use if prompt mentions specific keywords
    if (this.shouldSimulateTool(prompt)) {
      await this.simulateToolUse();
    }

    // Emit response message
    await this.delay(MOCK_DELAYS.MESSAGE);
    const response = this.generateMockResponse(prompt);
    this.emitMessage({
      type: 'text',
      part: {
        id: generateId('text'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'text',
        text: response,
      },
    });

    // Emit completion
    await this.delay(MOCK_DELAYS.COMPLETE);
    this.emitMessage({
      type: 'step_finish',
      part: {
        id: generateId('step'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'step-finish',
        reason: 'stop',
      },
    });

    this.emit('complete', {
      status: 'success',
      sessionId: this.currentSessionId,
    } as TaskResult);
  }

  /**
   * Check if we should simulate a tool call
   */
  private shouldSimulateTool(prompt: string): boolean {
    const toolKeywords = ['file', 'read', 'write', 'search', 'check', 'run', 'execute', 'browser'];
    return toolKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
  }

  /**
   * Simulate a tool use
   */
  private async simulateToolUse(): Promise<void> {
    const toolNames = ['Read', 'Write', 'Bash', 'Grep', 'WebFetch'];
    const toolName = randomChoice(toolNames);

    // Emit tool call start
    await this.delay(MOCK_DELAYS.TOOL_START);
    this.emit('progress', { stage: 'tool-use', message: `Using ${toolName}` });

    this.emitMessage({
      type: 'tool_call',
      part: {
        id: generateId('tool'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'tool-call',
        tool: toolName,
        input: { description: `Mock ${toolName} tool call` },
      },
    });

    // Emit tool result
    await this.delay(MOCK_DELAYS.TOOL_COMPLETE);
    this.emitMessage({
      type: 'tool_result',
      part: {
        id: generateId('result'),
        sessionID: this.currentSessionId!,
        messageID: generateId('msg'),
        type: 'tool-result',
        toolCallID: generateId('tool'),
        output: `Mock ${toolName} result: Operation completed successfully.`,
      },
    });
  }

  /**
   * Generate a mock response based on the prompt
   */
  private generateMockResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi')) {
      return randomChoice(MOCK_RESPONSES.greeting);
    }

    if (lowerPrompt.includes('help')) {
      return "I can help you with various tasks like reading files, running commands, browsing the web, and more. Just describe what you'd like me to do!";
    }

    // Default response
    return `I've processed your request: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"\n\n${randomChoice(MOCK_RESPONSES.completion)}`;
  }

  /**
   * Emit a mock message
   */
  private emitMessage(message: OpenCodeMessage): void {
    this.emit('message', message);
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resume a session (returns to normal execution)
   */
  async resumeSession(sessionId: string, prompt: string): Promise<Task> {
    return this.startTask({ prompt, sessionId });
  }

  /**
   * Send a response (mock implementation)
   */
  async sendResponse(response: string): Promise<void> {
    console.log('[MockAdapter] Response received:', response);
    // Simulate processing the response
    await this.delay(500);
    this.emit('progress', { stage: 'processing', message: 'Processing response...' });
  }

  /**
   * Cancel the current task
   */
  async cancelTask(): Promise<void> {
    this.emit('complete', {
      status: 'error',
      error: 'Task cancelled by user',
    } as TaskResult);
  }

  /**
   * Interrupt the current task
   */
  async interruptTask(): Promise<void> {
    this.emit('complete', {
      status: 'interrupted',
      sessionId: this.currentSessionId,
    } as TaskResult);
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get task ID
   */
  getTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Check if disposed
   */
  isAdapterDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose the adapter
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.currentSessionId = null;
    this.currentTaskId = null;
    this.removeAllListeners();
    console.log('[MockAdapter] Disposed');
  }
}

/**
 * Factory function to create a mock adapter
 */
export function createMockAdapter(taskId?: string): MockOpenCodeAdapter {
  return new MockOpenCodeAdapter(taskId);
}
