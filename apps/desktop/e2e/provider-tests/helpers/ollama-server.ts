/**
 * Ollama server lifecycle helpers for E2E tests.
 *
 * Handles:
 * - Checking if Ollama is running
 * - Pulling models if needed
 * - Server URL configuration
 */

import type { OllamaSecrets } from '../types';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_TEST_MODEL = 'llama3.2:1b';

interface OllamaSetupResult {
  serverUrl: string;
  modelId: string;
  modelPulled: boolean;
}

/**
 * Check if an Ollama server is reachable.
 */
async function isOllamaRunning(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/version`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if a model is already available on the Ollama server.
 */
async function isModelAvailable(serverUrl: string, modelId: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Pull a model from the Ollama registry.
 * Streams progress and waits for completion.
 */
async function pullModel(serverUrl: string, modelId: string): Promise<void> {
  console.log(`[Ollama] Pulling model '${modelId}'...`);

  const response = await fetch(`${serverUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelId, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body for pull request');
  }

  const decoder = new TextDecoder();
  let lastStatus = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.status && data.status !== lastStatus) {
          console.log(`[Ollama] Pull: ${data.status}`);
          lastStatus = data.status;
        }
        if (data.error) {
          throw new Error(`Pull error: ${data.error}`);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  console.log(`[Ollama] Model '${modelId}' pulled successfully`);
}

/**
 * Set up Ollama for E2E tests.
 *
 * 1. Checks if the server is running
 * 2. Determines which model to use
 * 3. Pulls the model if needed
 *
 * @returns Setup result with server URL and model ID
 * @throws If the server is not running
 */
export async function setupOllamaForTests(secrets?: OllamaSecrets): Promise<OllamaSetupResult> {
  const serverUrl = secrets?.serverUrl || DEFAULT_OLLAMA_URL;
  const modelId = secrets?.modelId || DEFAULT_TEST_MODEL;

  console.log(`[Ollama] Checking server at ${serverUrl}...`);

  const running = await isOllamaRunning(serverUrl);
  if (!running) {
    throw new Error(
      `Ollama server not running at ${serverUrl}. ` +
      `Start it with 'ollama serve' or set E2E_OLLAMA_SERVER_URL to a running instance.`
    );
  }

  console.log(`[Ollama] Server is running. Checking model '${modelId}'...`);

  const available = await isModelAvailable(serverUrl, modelId);
  if (!available) {
    await pullModel(serverUrl, modelId);
    return { serverUrl, modelId, modelPulled: true };
  }

  console.log(`[Ollama] Model '${modelId}' is already available`);
  return { serverUrl, modelId, modelPulled: false };
}

/**
 * Teardown Ollama test resources.
 * Currently a no-op, but could clean up pulled models in the future.
 */
export async function teardownOllama(): Promise<void> {
  // No-op for now
}
