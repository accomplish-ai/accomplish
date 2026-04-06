/**
 * Azure Foundry Proxy request transformation helpers
 *
 * Handles URL normalization, request body transformation, and path validation
 * for the Azure Foundry local proxy server.
 */

import { createConsoleLogger } from '../../utils/logging.js';

const log = createConsoleLogger({ prefix: 'AzureFoundryProxy' });

/**
 * Normalize an Azure Foundry base URL, stripping trailing slashes.
 * Validates that the protocol is http or https.
 */
export function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}. Only http and https are supported.`);
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw error;
  }
}

/**
 * Transform a raw request body buffer, converting OpenAI parameter names
 * that Azure OpenAI handles differently:
 * - Strips unsupported `reasoning_effort`
 * - Converts `max_tokens` → `max_completion_tokens`
 */
export function transformRequestBody(body: Buffer): Buffer {
  const text = body.toString('utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    let modified = false;

    if ('reasoning_effort' in parsed) {
      log.info('[Azure Foundry Proxy] Stripping unsupported reasoning_effort parameter');
      delete parsed.reasoning_effort;
      modified = true;
    }

    if ('max_tokens' in parsed) {
      if (!('max_completion_tokens' in parsed)) {
        log.info('[Azure Foundry Proxy] Converting max_tokens to max_completion_tokens');
        parsed.max_completion_tokens = parsed.max_tokens;
      }
      delete parsed.max_tokens;
      modified = true;
    }

    if (modified) {
      return Buffer.from(JSON.stringify(parsed), 'utf8');
    }
  } catch {
    return body;
  }
  return body;
}

/**
 * Returns true if the request path is a valid Azure OpenAI API path
 * that the proxy should forward.
 */
export function isValidRequestPath(requestPath: string): boolean {
  if (requestPath === '/health') return true;
  if (requestPath.startsWith('/openai/')) return true;
  if (
    requestPath.startsWith('/chat/') ||
    requestPath.startsWith('/completions') ||
    requestPath.startsWith('/embeddings')
  ) {
    return true;
  }
  if (requestPath === '/models' || requestPath.startsWith('/models/')) return true;
  return false;
}

export function shouldTransformBody(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('application/json');
}
