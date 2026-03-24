/**
 * Classifies a process error based on the recent stdout/stderr output buffered
 * from the OpenCode CLI.
 *
 * Returns a human-readable error message that can be shown directly in the UI
 * instead of the generic "Task failed" text.
 */
export function classifyProcessError(exitCode: number | undefined, outputBuffer: string): string {
  const output = outputBuffer.toLowerCase();

  // Quota / billing errors
  if (
    output.includes('insufficient_quota') ||
    output.includes('exceeded your current quota') ||
    output.includes('billing_hard_limit_reached') ||
    output.includes('insufficient credits') ||
    output.includes('resource_exhausted')
  ) {
    return 'API quota exceeded. Check your billing and usage limits, then try again.';
  }

  // Rate limit errors
  if (
    output.includes('rate limit') ||
    output.includes('ratelimit') ||
    output.includes('too many requests') ||
    /\b(?:http|status|statuscode)\s*429\b/i.test(outputBuffer)
  ) {
    return 'Rate limit reached. Please wait a moment before retrying.';
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
    return 'Invalid or missing API key. Check your credentials in Settings.';
  }

  // Model not found errors
  if (
    output.includes('model_not_found') ||
    output.includes('model does not exist') ||
    output.includes('the model does not exist') ||
    output.includes('model not found') ||
    output.includes('no such model')
  ) {
    return 'Model not found or not available. Try selecting a different model in Settings.';
  }

  // Context length errors
  if (
    output.includes('context_length_exceeded') ||
    output.includes('maximum context length') ||
    output.includes('context window') ||
    output.includes('too many tokens')
  ) {
    return 'The conversation is too long for this model. Start a new task to continue.';
  }

  // Network errors
  if (
    output.includes('econnrefused') ||
    output.includes('enotfound') ||
    output.includes('network error') ||
    output.includes('connection refused')
  ) {
    return 'Network error. Check your internet connection and try again.';
  }

  if (typeof exitCode === 'number') {
    return `Task failed (exit code ${exitCode}). Check the debug panel for details.`;
  }
  return 'Task failed. Check the debug panel for details.';
}
