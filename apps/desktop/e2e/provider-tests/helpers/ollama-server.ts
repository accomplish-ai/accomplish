/**
 * Ollama server lifecycle management for E2E tests.
 * Handles starting/stopping the Ollama server and pulling test models.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Default Ollama server URL */
const DEFAULT_SERVER_URL = 'http://localhost:11434';

/** Default test model - small and fast to pull (~400MB) */
const DEFAULT_TEST_MODEL = 'qwen2:0.5b';

/** Timeout for model pull operation (5 minutes) */
const MODEL_PULL_TIMEOUT = 300000;

/** Timeout for server startup (30 seconds) */
const SERVER_STARTUP_TIMEOUT = 30000;

/** Interval for checking server readiness */
const SERVER_POLL_INTERVAL = 500;

/** Result from Ollama setup */
export interface OllamaSetupResult {
  readonly success: boolean;
  readonly error?: string;
  readonly serverUrl: string;
  readonly modelId: string;
  /** Whether we started the server (vs it was already running) */
  readonly serverStartedByUs: boolean;
}

/** Module-level state to track if we started the server */
let serverStartedByUs = false;
let ollamaProcess: ReturnType<typeof spawn> | null = null;

/**
 * Check if Ollama CLI is installed.
 */
async function isOllamaInstalled(): Promise<boolean> {
  try {
    await execAsync('which ollama');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Ollama server is running by pinging its API.
 */
async function isServerRunning(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for the server to become ready.
 */
async function waitForServer(serverUrl: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await isServerRunning(serverUrl)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, SERVER_POLL_INTERVAL));
  }
  return false;
}

/**
 * Start the Ollama server.
 */
async function startServer(serverUrl: string): Promise<boolean> {
  return new Promise(resolve => {
    ollamaProcess = spawn('ollama', ['serve'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    ollamaProcess.on('error', () => {
      resolve(false);
    });

    // Give it a moment to start, then check if it's running
    setTimeout(async () => {
      const isRunning = await waitForServer(serverUrl, SERVER_STARTUP_TIMEOUT);
      if (isRunning) {
        serverStartedByUs = true;
      }
      resolve(isRunning);
    }, 1000);
  });
}

/**
 * Check if a model is available locally.
 */
async function isModelAvailable(serverUrl: string, modelName: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/tags`);
    if (!response.ok) return false;

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data.models || [];

    // Model names can have :latest suffix
    const baseModelName = modelName.split(':')[0];
    return models.some(m => {
      const name = m.name.split(':')[0];
      return name === baseModelName || m.name === modelName;
    });
  } catch {
    return false;
  }
}

/**
 * Pull a model from Ollama registry.
 */
async function pullModel(modelName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    const pull = spawn('ollama', ['pull', modelName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    const timeout = setTimeout(() => {
      pull.kill();
      resolve({ success: false, error: `Model pull timed out after ${MODEL_PULL_TIMEOUT / 1000}s` });
    }, MODEL_PULL_TIMEOUT);

    pull.stderr.on('data', data => {
      stderr += data.toString();
    });

    pull.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Pull failed with code ${code}` });
      }
    });

    pull.on('error', err => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Set up Ollama for E2E tests.
 * This will:
 * 1. Check if Ollama CLI is installed
 * 2. Start the server if not running
 * 3. Pull the test model if not available
 */
export async function setupOllamaForTests(config?: {
  serverUrl?: string;
  modelId?: string;
}): Promise<OllamaSetupResult> {
  const serverUrl = config?.serverUrl || DEFAULT_SERVER_URL;
  const modelId = config?.modelId || DEFAULT_TEST_MODEL;

  // Check if Ollama is installed
  const installed = await isOllamaInstalled();
  if (!installed) {
    return {
      success: false,
      error: 'Ollama CLI not installed. Install from https://ollama.ai',
      serverUrl,
      modelId,
      serverStartedByUs: false,
    };
  }

  // Check if server is already running
  let running = await isServerRunning(serverUrl);

  if (!running) {
    console.log('[ollama-server] Starting Ollama server...');
    const started = await startServer(serverUrl);
    if (!started) {
      return {
        success: false,
        error: 'Failed to start Ollama server',
        serverUrl,
        modelId,
        serverStartedByUs: false,
      };
    }
    console.log('[ollama-server] Server started successfully');
    running = true;
  } else {
    console.log('[ollama-server] Server already running');
  }

  // Check if model is available
  const modelAvailable = await isModelAvailable(serverUrl, modelId);
  if (!modelAvailable) {
    console.log(`[ollama-server] Pulling model ${modelId}...`);
    const pullResult = await pullModel(modelId);
    if (!pullResult.success) {
      return {
        success: false,
        error: `Failed to pull model ${modelId}: ${pullResult.error}`,
        serverUrl,
        modelId,
        serverStartedByUs,
      };
    }
    console.log(`[ollama-server] Model ${modelId} pulled successfully`);
  } else {
    console.log(`[ollama-server] Model ${modelId} already available`);
  }

  return {
    success: true,
    serverUrl,
    modelId,
    serverStartedByUs,
  };
}

/**
 * Tear down Ollama after tests.
 * Only stops the server if we started it.
 */
export async function teardownOllama(): Promise<void> {
  if (serverStartedByUs && ollamaProcess) {
    console.log('[ollama-server] Stopping Ollama server...');
    try {
      // Kill the process group
      process.kill(-ollamaProcess.pid!, 'SIGTERM');
    } catch {
      // Process may already be gone
    }
    ollamaProcess = null;
    serverStartedByUs = false;
    console.log('[ollama-server] Server stopped');
  }
}
