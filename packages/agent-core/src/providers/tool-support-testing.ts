import type { ToolSupportStatus } from '../common/types/providerSettings.js';

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

/** Response type from OpenAI-compatible chat completions endpoint */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{ function?: { name: string } }>;
    };
    finish_reason?: string;
  }>;
}

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
export async function testModelToolSupport(options: ToolSupportTestOptions): Promise<ToolSupportStatus> {
  const { baseUrl, modelId, providerName, timeoutMs = 10000 } = options;

  const testPayload = {
    model: modelId,
    messages: [
      { role: 'user', content: 'What is the current time? You must use the get_current_time tool.' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_current_time',
          description: 'Gets the current time. Must be called to know what time it is.',
          parameters: {
            type: 'object',
            properties: {
              timezone: {
                type: 'string',
                description: 'Timezone (e.g., UTC, America/New_York)'
              }
            },
            required: []
          }
        }
      }
    ],
    tool_choice: 'required',
    max_tokens: 100,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes('tool') || errorText.includes('function') || errorText.includes('does not support')) {
        console.log(`[${providerName}] Model ${modelId} does not support tools (error response)`);
        return 'unsupported';
      }
      console.warn(`[${providerName}] Tool test failed for ${modelId}: ${response.status}`);
      return 'unknown';
    }

    const data = await response.json() as ChatCompletionResponse;

    const choice = data.choices?.[0];
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      console.log(`[${providerName}] Model ${modelId} supports tools (made tool call)`);
      return 'supported';
    }

    if (choice?.finish_reason === 'tool_calls') {
      console.log(`[${providerName}] Model ${modelId} supports tools (finish_reason)`);
      return 'supported';
    }

    return 'unknown';
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn(`[${providerName}] Tool test timed out for ${modelId}`);
        return 'unknown';
      }
      if (error.message.includes('tool') || error.message.includes('function')) {
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
