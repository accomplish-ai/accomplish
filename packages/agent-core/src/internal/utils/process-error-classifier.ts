/**
 * Classifies a process error based on the recent stdout/stderr output buffered
 * from the OpenCode CLI.
 *
 * Returns a human-readable error message that can be shown directly in the UI
 * instead of the generic "Task failed" text.
 */

import type { ErrorCategory } from '../../common/types/task.js';

/** Structured error classification with recovery action metadata. */
export interface ClassifiedError {
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  /** Label for the primary action button (e.g., "Retry", "Open Settings"). */
  actionLabel?: string;
  /** Type of recovery action for the UI to dispatch. */
  actionType?: 'retry' | 'settings' | 'new_task';
}

/**
 * Classify a process error into a structured result with category and recovery action.
 */
export function classifyProcessErrorStructured(
  exitCode: number | undefined,
  outputBuffer: string,
): ClassifiedError {
  const output = outputBuffer.toLowerCase();

  // Quota / billing errors
  if (
    output.includes('insufficient_quota') ||
    output.includes('exceeded your current quota') ||
    output.includes('billing_hard_limit_reached') ||
    output.includes('insufficient credits') ||
    output.includes('resource_exhausted')
  ) {
    return {
      message: 'API quota exceeded. Check your billing and usage limits, then try again.',
      category: 'quota',
      retryable: false,
      actionLabel: 'Open Settings',
      actionType: 'settings',
    };
  }

  // Rate limit errors
  if (
    output.includes('rate limit') ||
    output.includes('ratelimit') ||
    output.includes('too many requests') ||
    /\b(?:http|status|statuscode)\s*429\b/i.test(outputBuffer)
  ) {
    return {
      message: 'Rate limit reached. Please wait a moment before retrying.',
      category: 'rate_limit',
      retryable: true,
      actionLabel: 'Retry',
      actionType: 'retry',
    };
  }

  // Authentication / API key errors
  if (
    output.includes('invalid_api_key') ||
    output.includes('incorrect api key') ||
    output.includes('invalid api key') ||
    output.includes('unauthenticated') ||
    output.includes('unauthorized') ||
    output.includes('authentication failed')
  ) {
    return {
      message: 'Invalid or missing API key. Check your credentials in Settings.',
      category: 'auth',
      retryable: false,
      actionLabel: 'Open Settings',
      actionType: 'settings',
    };
  }

  // Model not found errors
  if (
    output.includes('model_not_found') ||
    output.includes('model does not exist') ||
    output.includes('the model does not exist') ||
    output.includes('model not found') ||
    output.includes('no such model')
  ) {
    return {
      message: 'Model not found or not available. Try selecting a different model in Settings.',
      category: 'model_not_found',
      retryable: false,
      actionLabel: 'Open Settings',
      actionType: 'settings',
    };
  }

  // Context length errors
  if (
    output.includes('context_length_exceeded') ||
    output.includes('maximum context length') ||
    output.includes('context window') ||
    output.includes('too many tokens')
  ) {
    return {
      message: 'The conversation is too long for this model. Start a new task to continue.',
      category: 'context_length',
      retryable: false,
      actionLabel: 'Start New Task',
      actionType: 'new_task',
    };
  }

  // Network errors
  if (
    output.includes('econnrefused') ||
    output.includes('enotfound') ||
    output.includes('network error') ||
    output.includes('connection refused')
  ) {
    return {
      message: 'Network error. Check your internet connection and try again.',
      category: 'network',
      retryable: true,
      actionLabel: 'Retry',
      actionType: 'retry',
    };
  }

  const fallbackMessage =
    typeof exitCode === 'number'
      ? `Task failed (exit code ${exitCode}). Check the debug panel for details.`
      : 'Task failed. Check the debug panel for details.';

  return {
    message: fallbackMessage,
    category: 'unknown',
    retryable: true,
    actionLabel: 'Retry',
    actionType: 'retry',
  };
}

/**
 * Backwards-compatible wrapper that returns just the message string.
 */
export function classifyProcessError(exitCode: number | undefined, outputBuffer: string): string {
  return classifyProcessErrorStructured(exitCode, outputBuffer).message;
}
