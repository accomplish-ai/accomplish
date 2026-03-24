/**
 * Ollama server lifecycle driver for E2E tests.
 *
 * Handles:
 * - Auto-starting Ollama if installed but not running
 * - Checking if Ollama is running
 * - Pulling models if needed
 * - Auto-stopping Ollama on teardown (only if we started it)
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import type { OllamaSecrets } from '../types';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_TEST_MODEL = 'llama3.2:1b';
const SERVER_STARTUP_TIMEOUT = 30_000; // 30s
const SERVER_POLL_INTERVAL = 500; // 500ms
const SIGTERM_GRACE_PERIOD = 5_000; // 5s
const MODEL_PULL_TIMEOUT = 600_000; // 10 minutes

// ── Private helpers ──────────────────────────────────────────────────

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

async function pullModel(serverUrl: string, modelId: string): Promise<void> {
  console.log(`[Ollama] Pulling model '${modelId}'...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_PULL_TIMEOUT);

  try {
    const response = await fetch(`${serverUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId, stream: true }),
      signal: controller.signal,
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
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete last line for next chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line) as { status?: string; error?: string };
        if (data.status && data.status !== lastStatus) {
          console.log(`[Ollama] Pull: ${data.status}`);
          lastStatus = data.status;
        }
        if (data.error) {
          throw new Error(`Pull error: ${data.error}`);
        }
      }
    }

    console.log(`[Ollama] Model '${modelId}' pulled successfully`);
  } finally {
    clearTimeout(timer);
  }
}

export function isOllamaInstalled(): boolean {
  try {
    execSync('which ollama', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function startOllamaServer(): ChildProcess {
  console.log('[Ollama] Starting server via `ollama serve`...');
  const proc = spawn('ollama', ['serve'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  proc.stdout?.on('data', (data: Buffer) => {
    console.log(`[Ollama Server] ${data.toString().trim()}`);
  });
  proc.stderr?.on('data', (data: Buffer) => {
    console.log(`[Ollama Server] ${data.toString().trim()}`);
  });

  return proc;
}

async function waitForServerReady(serverUrl: string, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isOllamaRunning(serverUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_INTERVAL));
  }
  throw new Error(`Ollama server did not become ready within ${timeout}ms`);
}

// ── Public driver ────────────────────────────────────────────────────

/**
 * Encapsulates Ollama server lifecycle for E2E tests.
 *
 * Usage in specs:
 * ```ts
 * const ollama = new OllamaTestDriver(secrets);
 * test.beforeAll(ollama.beforeAll);
 * test.afterAll(ollama.afterAll);
 * // later: ollama.serverUrl, ollama.modelId
 * ```
 */
export class OllamaTestDriver {
  private ollamaProcess: ChildProcess | null = null;
  private serverStartedByUs = false;
  private _serverUrl: string;
  private _modelId: string;

  constructor(secrets?: OllamaSecrets) {
    this._serverUrl = secrets?.serverUrl || DEFAULT_OLLAMA_URL;
    this._modelId = secrets?.modelId || DEFAULT_TEST_MODEL;
  }

  get serverUrl(): string {
    return this._serverUrl;
  }

  get modelId(): string {
    return this._modelId;
  }

  /** Wire into test.beforeAll — starts server + pulls model */
  beforeAll = async (): Promise<void> => {
    console.log(`[Ollama] Checking server at ${this._serverUrl}...`);

    const running = await isOllamaRunning(this._serverUrl);
    if (running) {
      this.serverStartedByUs = false;
      console.log('[Ollama] Server is already running');
    } else {
      if (!isOllamaInstalled()) {
        throw new Error(
          'Ollama CLI is not installed. Install it from https://ollama.ai ' +
            'or set E2E_OLLAMA_SERVER_URL to a running instance.',
        );
      }

      this.ollamaProcess = startOllamaServer();
      this.serverStartedByUs = true;

      try {
        await waitForServerReady(this._serverUrl, SERVER_STARTUP_TIMEOUT);
      } catch {
        this.ollamaProcess.kill('SIGKILL');
        this.ollamaProcess = null;
        this.serverStartedByUs = false;
        throw new Error(
          `Ollama server failed to start within ${SERVER_STARTUP_TIMEOUT}ms. ` +
            `Check that port 11434 is available.`,
        );
      }

      console.log('[Ollama] Server started successfully');
    }

    try {
      console.log(`[Ollama] Checking model '${this._modelId}'...`);

      const available = await isModelAvailable(this._serverUrl, this._modelId);
      if (!available) {
        await pullModel(this._serverUrl, this._modelId);
      } else {
        console.log(`[Ollama] Model '${this._modelId}' is already available`);
      }
    } catch (error) {
      if (this.serverStartedByUs && this.ollamaProcess) {
        console.log('[Ollama] Model pull failed, stopping server we started...');
        this.ollamaProcess.kill('SIGKILL');
        this.ollamaProcess = null;
        this.serverStartedByUs = false;
      }
      throw error;
    }
  };

  /** Wire into test.afterAll — stops server if we started it */
  afterAll = async (): Promise<void> => {
    if (!this.serverStartedByUs || !this.ollamaProcess) return;

    console.log('[Ollama] Stopping server we started...');

    this.ollamaProcess.kill('SIGTERM');

    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), SIGTERM_GRACE_PERIOD);
      this.ollamaProcess!.on('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    if (!exited) {
      console.log('[Ollama] Server did not exit gracefully, sending SIGKILL');
      this.ollamaProcess.kill('SIGKILL');
    }

    this.ollamaProcess = null;
    this.serverStartedByUs = false;
    console.log('[Ollama] Server stopped');
  };
}
