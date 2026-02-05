import type { NimConfig } from '../common/types/provider.js';
import type { ToolSupportStatus } from '../common/types/providerSettings.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import {
  type ChatCompletionResponse,
  fetchWithAbortTimeout,
  buildToolTestPayload,
  indicatesToolsUnsupported,
  determineToolSupportFromResponse,
  TOOL_TEST_TIMEOUT_MS,
} from './tool-support-testing.js';
import {
  type ConnectionResult,
  validateAndSanitizeUrl,
  extractApiErrorMessage,
  handleConnectionError,
  toConnectionError,
  createFailureResult,
  createSuccessResult,
} from './provider-utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for NIM API requests in milliseconds */
export const NIM_REQUEST_TIMEOUT_MS = 15000;

/** Timeout for context length probe request */
const CONTEXT_PROBE_TIMEOUT_MS = 10000;

/** Intentionally high token count to trigger context limit error */
const CONTEXT_PROBE_MAX_TOKENS = 1_000_000;

/** Assumed context length for models that accept very high token requests */
const LARGE_CONTEXT_FALLBACK = 131072;

// ============================================================================
// Types
// ============================================================================

/** Raw model data from NIM /v1/models endpoint (OpenAI-compatible) */
interface NimRawModel {
  id: string;
  object: string;
  owned_by?: string;
  max_model_len?: number;
}

/** Response type from NIM /v1/models endpoint */
interface NimModelsResponse {
  data?: NimRawModel[];
}

/** NIM model information */
export interface NimModel {
  id: string;
  name: string;
  /** Maximum context length from max_model_len in NIM API response */
  maxModelLen?: number;
}

/** Result of testing connection to NIM */
export type NimConnectionResult = ConnectionResult<NimModel>;

/** Options for NIM API requests */
export interface NimRequestOptions {
  /** The NIM server base URL */
  baseUrl: string;
  /** API key for authentication (required for cloud NIM) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
}

/** @deprecated Use NimRequestOptions instead */
export type NimConnectionOptions = NimRequestOptions & { url: string };

/** @deprecated Use NimRequestOptions instead */
export type NimFetchModelsOptions = NimRequestOptions;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes a URL by removing trailing slashes.
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Builds authorization headers for NIM API requests.
 */
function buildAuthHeaders(apiKey?: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Converts a model ID to a human-readable display name.
 * Removes vendor prefixes (e.g., "nvidia/", "meta/") and formats the name.
 */
function formatModelDisplayName(modelId: string): string {
  const nameWithoutPrefix = modelId.includes('/')
    ? modelId.split('/').pop() || modelId
    : modelId;

  return nameWithoutPrefix
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Maps raw NIM model data to our NimModel interface.
 */
function mapRawModelsToNimModels(rawModels: NimRawModel[]): NimModel[] {
  return rawModels.map((model) => ({
    id: model.id,
    name: formatModelDisplayName(model.id),
    maxModelLen: model.max_model_len,
  }));
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Fetches models from a NIM server endpoint.
 * This is the core function used by both testNimConnection and fetchNimModels.
 */
async function fetchModelsFromEndpoint(
  baseUrl: string,
  apiKey?: string,
  timeoutMs = NIM_REQUEST_TIMEOUT_MS
): Promise<NimConnectionResult> {
  const headers = buildAuthHeaders(apiKey);
  const endpoint = `${normalizeUrl(baseUrl)}/models`;

  const response = await fetchWithTimeout(
    endpoint,
    { method: 'GET', headers },
    timeoutMs
  );

  if (!response.ok) {
    return handleModelsApiError(response);
  }

  const data = (await response.json()) as NimModelsResponse;
  const rawModels = data.data || [];

  return createSuccessResult(mapRawModelsToNimModels(rawModels));
}

/**
 * Handles error responses from the /models API endpoint.
 */
async function handleModelsApiError(response: Response): Promise<NimConnectionResult> {
  if (response.status === 401) {
    return createFailureResult('Invalid API key');
  }

  const errorData = await response.json().catch(() => ({}));
  const errorMessage = extractApiErrorMessage(errorData, response.status);
  return createFailureResult(errorMessage);
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Tests connection to a NVIDIA NIM server and fetches available models.
 *
 * Makes a GET request to /v1/models to verify connectivity and retrieve
 * the list of available models. Uses Bearer token authentication.
 */
export async function testNimConnection(
  options: NimRequestOptions & { url?: string }
): Promise<NimConnectionResult> {
  const { url, baseUrl, apiKey, timeoutMs = NIM_REQUEST_TIMEOUT_MS } = options;
  const targetUrl = url || baseUrl;

  const urlValidation = validateAndSanitizeUrl(targetUrl, 'NIM');
  if (!urlValidation.valid) {
    return createFailureResult(urlValidation.error);
  }

  try {
    const result = await fetchModelsFromEndpoint(urlValidation.url, apiKey, timeoutMs);

    if (result.success && result.models?.length === 0) {
      return createFailureResult('No models available on this NIM endpoint.');
    }

    return result;
  } catch (error) {
    console.warn('[NIM] Connection failed:', error);
    return handleConnectionError(
      error,
      'NIM',
      'Connection timed out. Make sure the NIM endpoint is accessible.'
    );
  }
}

/**
 * Fetches available models from a NIM server.
 *
 * Similar to testNimConnection but intended for refreshing the model list
 * when NIM is already configured.
 */
export async function fetchNimModels(
  options: NimRequestOptions
): Promise<NimConnectionResult> {
  const { baseUrl, apiKey, timeoutMs = NIM_REQUEST_TIMEOUT_MS } = options;

  try {
    return await fetchModelsFromEndpoint(baseUrl, apiKey, timeoutMs);
  } catch (error) {
    console.warn('[NIM] Fetch failed:', error);
    return toConnectionError(error, 'NIM', 'Request timed out. Check your NIM endpoint.');
  }
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validates that a model object has the required structure.
 */
function isValidModelFormat(model: unknown): boolean {
  if (typeof model !== 'object' || model === null) {
    return false;
  }
  const { id, name } = model as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string';
}

/**
 * Validates NIM configuration object structure.
 *
 * @throws Error if configuration is invalid
 */
export function validateNimConfig(config: NimConfig): void {
  const hasValidBaseFields =
    typeof config.baseUrl === 'string' && typeof config.enabled === 'boolean';

  if (!hasValidBaseFields) {
    throw new Error('Invalid NIM configuration');
  }

  validateHttpUrl(config.baseUrl, 'NIM base URL');

  const hasInvalidLastValidated =
    config.lastValidated !== undefined && typeof config.lastValidated !== 'number';

  if (hasInvalidLastValidated) {
    throw new Error('Invalid NIM configuration');
  }

  if (config.models === undefined) {
    return;
  }

  if (!Array.isArray(config.models)) {
    throw new Error('Invalid NIM configuration: models must be an array');
  }

  const hasInvalidModel = config.models.some(
    (model: unknown) => !isValidModelFormat(model)
  );
  if (hasInvalidModel) {
    throw new Error('Invalid NIM configuration: invalid model format');
  }
}

// ============================================================================
// Model Probing Types and Constants
// ============================================================================

/** Result of probing a NIM model */
export interface NimModelProbeResult {
  toolSupport: ToolSupportStatus;
  contextLength?: number;
}

/** Regex pattern to extract context length from error messages */
const CONTEXT_LENGTH_PATTERN = /maximum context length of (\d+) tokens/i;

// ============================================================================
// Model Probing Helper Functions
// ============================================================================

/**
 * Builds headers for chat completion requests.
 */
function buildChatHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(apiKey),
  };
}

/**
 * Parses context length from an error message.
 */
function parseContextLengthFromError(errorMessage: string): number | undefined {
  const match = errorMessage.match(CONTEXT_LENGTH_PATTERN);
  return match ? parseInt(match[1], 10) : undefined;
}

// ============================================================================
// Context Length Probing
// ============================================================================

interface ContextProbeResult {
  contextLength?: number;
  chatUnsupported: boolean;
}

/**
 * Probes for context length by requesting an intentionally high token count.
 */
async function probeContextLength(
  endpoint: string,
  modelId: string,
  headers: Record<string, string>
): Promise<ContextProbeResult> {
  const payload = {
    model: modelId,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: CONTEXT_PROBE_MAX_TOKENS,
  };

  try {
    const response = await fetchWithAbortTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      CONTEXT_PROBE_TIMEOUT_MS
    );

    if (!response.ok) {
      return handleContextProbeError(response, modelId);
    }

    // Request succeeded with high token count - model has very large context
    console.log(`[NIM] Model ${modelId} has large context (128k+ assumed)`);
    return { contextLength: LARGE_CONTEXT_FALLBACK, chatUnsupported: false };
  } catch (error) {
    logProbeError('Context probe', modelId, error);
    return { contextLength: undefined, chatUnsupported: false };
  }
}

/**
 * Handles error response from context probe request.
 */
async function handleContextProbeError(
  response: Response,
  modelId: string
): Promise<ContextProbeResult> {
  if (response.status === 404) {
    console.log(`[NIM] Model ${modelId} does not support chat completions (404)`);
    return { contextLength: undefined, chatUnsupported: true };
  }

  const errorData = (await response.json().catch(() => ({}))) as { message?: string };
  const contextLength = parseContextLengthFromError(errorData.message || '');

  if (contextLength) {
    console.log(`[NIM] Discovered context length for ${modelId}: ${contextLength}`);
  }

  return { contextLength, chatUnsupported: false };
}

// ============================================================================
// Tool Support Testing
// ============================================================================

/**
 * Tests whether a model supports tool calling.
 */
async function testToolSupport(
  endpoint: string,
  modelId: string,
  headers: Record<string, string>
): Promise<ToolSupportStatus> {
  const payload = buildToolTestPayload(modelId);

  try {
    const response = await fetchWithAbortTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      TOOL_TEST_TIMEOUT_MS
    );

    if (!response.ok) {
      return handleToolTestError(response, modelId);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const status = determineToolSupportFromResponse(data);

    logToolSupportResult(modelId, status);
    return status;
  } catch (error) {
    return handleToolTestException(error, modelId);
  }
}

/**
 * Handles error response from tool test request.
 */
async function handleToolTestError(
  response: Response,
  modelId: string
): Promise<ToolSupportStatus> {
  if (response.status === 404) {
    console.log(`[NIM] Model ${modelId} does not support chat completions (404)`);
    return 'unsupported';
  }

  const errorText = await response.text();
  if (indicatesToolsUnsupported(errorText)) {
    console.log(`[NIM] Model ${modelId} does not support tools (error response)`);
    return 'unsupported';
  }

  console.warn(`[NIM] Tool test failed for ${modelId}: ${response.status}`);
  return 'unknown';
}

/**
 * Handles exceptions thrown during tool test.
 */
function handleToolTestException(error: unknown, modelId: string): ToolSupportStatus {
  if (!(error instanceof Error)) {
    console.warn(`[NIM] Tool test error for ${modelId}:`, error);
    return 'unknown';
  }

  if (error.name === 'AbortError') {
    console.warn(`[NIM] Tool test timed out for ${modelId}`);
    return 'unknown';
  }

  if (indicatesToolsUnsupported(error.message)) {
    console.log(`[NIM] Model ${modelId} does not support tools (exception)`);
    return 'unsupported';
  }

  console.warn(`[NIM] Tool test error for ${modelId}:`, error);
  return 'unknown';
}

// ============================================================================
// Logging Helpers
// ============================================================================

/**
 * Logs probe error with consistent formatting.
 */
function logProbeError(probeType: string, modelId: string, error: unknown): void {
  const isTimeout = error instanceof Error && error.name === 'AbortError';
  if (isTimeout) {
    console.warn(`[NIM] ${probeType} timed out for ${modelId}`);
  } else {
    console.warn(`[NIM] ${probeType} error for ${modelId}:`, error);
  }
}

/**
 * Logs tool support test result.
 */
function logToolSupportResult(modelId: string, status: ToolSupportStatus): void {
  const messages: Record<ToolSupportStatus, string> = {
    supported: `Model ${modelId} supports tools`,
    unsupported: `Model ${modelId} does not support tools`,
    unknown: `Model ${modelId} responded but didn't use tools`,
  };
  console.log(`[NIM] ${messages[status]}`);
}

// ============================================================================
// Public Model Probing API
// ============================================================================

/**
 * Probes a NIM model to discover tool support and context length.
 *
 * First requests with a very high max_tokens to discover the context limit from
 * the error response, then tests tool support with a reasonable max_tokens.
 *
 * @param baseUrl - NIM server base URL (e.g., 'https://integrate.api.nvidia.com/v1')
 * @param modelId - Model ID to test (e.g., 'meta/llama-3.3-70b-instruct')
 * @param apiKey - Optional API key for authentication
 */
export async function testNimModelToolSupport(
  baseUrl: string,
  modelId: string,
  apiKey?: string
): Promise<NimModelProbeResult> {
  const headers = buildChatHeaders(apiKey);
  const endpoint = `${normalizeUrl(baseUrl)}/chat/completions`;

  // Step 1: Probe for context length
  const { contextLength, chatUnsupported } = await probeContextLength(
    endpoint,
    modelId,
    headers
  );

  if (chatUnsupported) {
    return { toolSupport: 'unsupported', contextLength };
  }

  // Step 2: Test tool support
  const toolSupport = await testToolSupport(endpoint, modelId, headers);

  return { toolSupport, contextLength };
}
