import type { ToolSupportStatus } from '../common/types/providerSettings.js';

// ============================================================================
// Shared Constants
// ============================================================================

/** Default timeout for tool support test requests */
export const TOOL_TEST_TIMEOUT_MS = 10000;

/** Max tokens for tool support test request */
export const TOOL_TEST_MAX_TOKENS = 100;

/** Tool definition used for testing tool support */
export const TEST_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: 'Gets the current time. Must be called to know what time it is.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., UTC, America/New_York)',
        },
      },
      required: [],
    },
  },
} as const;

/** Test message that prompts the model to use the tool */
export const TEST_TOOL_MESSAGE = {
  role: 'user',
  content: 'What is the current time? You must use the get_current_time tool.',
} as const;

// ============================================================================
// Shared Types
// ============================================================================

/** Response type from OpenAI-compatible chat completions endpoint */
export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{ function?: { name: string } }>;
    };
    finish_reason?: string;
  }>;
}

/**
 * Options for testing tool support on a local LLM model
 */
export interface ToolSupportTestOptions {
  /** Base URL of the LLM server (e.g., 'http://localhost:11434') */
  baseUrl: string;
  /** Model ID to test */
  modelId: string;
  /** Provider name for logging (e.g., 'Ollama', 'LM Studio') */
  providerName: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Checks if an error message indicates tool support is unsupported.
 */
export function indicatesToolsUnsupported(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes('tool') ||
    lowerText.includes('function') ||
    lowerText.includes('does not support')
  );
}

/**
 * Determines tool support status from a successful chat completion response.
 */
export function determineToolSupportFromResponse(
  data: ChatCompletionResponse
): ToolSupportStatus {
  const choice = data.choices?.[0];

  const hasToolCalls =
    choice?.message?.tool_calls && choice.message.tool_calls.length > 0;
  if (hasToolCalls) {
    return 'supported';
  }

  if (choice?.finish_reason === 'tool_calls') {
    return 'supported';
  }

  return 'unknown';
}

/**
 * Makes a fetch request with timeout using AbortController.
 */
export async function fetchWithAbortTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Builds the standard tool test payload for chat completions.
 */
export function buildToolTestPayload(modelId: string) {
  return {
    model: modelId,
    messages: [TEST_TOOL_MESSAGE],
    tools: [TEST_TOOL_DEFINITION],
    tool_choice: 'required',
    max_tokens: TOOL_TEST_MAX_TOKENS,
  };
}

// ============================================================================
// Main Tool Support Testing Function
// ============================================================================

/**
 * Tests whether a local LLM model supports tool calling.
 *
 * Makes a test API request to the OpenAI-compatible /v1/chat/completions endpoint
 * with a simple tool definition and tool_choice: 'required' to determine if the
 * model can make tool calls.
 *
 * @param options - Test configuration options
 * @returns The tool support status: 'supported', 'unsupported', or 'unknown'
 */
export async function testModelToolSupport(
  options: ToolSupportTestOptions
): Promise<ToolSupportStatus> {
  const { baseUrl, modelId, providerName, timeoutMs = TOOL_TEST_TIMEOUT_MS } = options;

  const payload = buildToolTestPayload(modelId);
  const endpoint = `${baseUrl}/v1/chat/completions`;

  try {
    const response = await fetchWithAbortTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (indicatesToolsUnsupported(errorText)) {
        console.log(`[${providerName}] Model ${modelId} does not support tools (error response)`);
        return 'unsupported';
      }
      console.warn(`[${providerName}] Tool test failed for ${modelId}: ${response.status}`);
      return 'unknown';
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const status = determineToolSupportFromResponse(data);

    if (status === 'supported') {
      console.log(`[${providerName}] Model ${modelId} supports tools`);
    }

    return status;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn(`[${providerName}] Tool test timed out for ${modelId}`);
        return 'unknown';
      }
      if (indicatesToolsUnsupported(error.message)) {
        console.log(`[${providerName}] Model ${modelId} does not support tools (exception)`);
        return 'unsupported';
      }
    }
    console.warn(`[${providerName}] Tool test error for ${modelId}:`, error);
    return 'unknown';
  }
}

/**
 * Tests whether an Ollama model supports tool calling.
 *
 * @param baseUrl - Ollama server base URL
 * @param modelId - Model ID to test
 * @returns The tool support status
 */
export async function testOllamaModelToolSupport(
  baseUrl: string,
  modelId: string
): Promise<ToolSupportStatus> {
  return testModelToolSupport({
    baseUrl,
    modelId,
    providerName: 'Ollama',
  });
}

/**
 * Tests whether an LM Studio model supports tool calling.
 *
 * @param baseUrl - LM Studio server base URL
 * @param modelId - Model ID to test
 * @returns The tool support status
 */
export async function testLMStudioModelToolSupport(
  baseUrl: string,
  modelId: string
): Promise<ToolSupportStatus> {
  return testModelToolSupport({
    baseUrl,
    modelId,
    providerName: 'LM Studio',
  });
}
