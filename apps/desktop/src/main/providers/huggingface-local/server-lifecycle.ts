/**
 * Server lifecycle management for the HuggingFace Local inference server.
 * Handles start, stop, status, and connection testing.
 */

import http from 'http';
import { getStorage } from '../../store/storage';
import { getLogCollector } from '../../logging';
import {
  state,
  startServerPromise,
  setStartServerPromise,
  loadModelPromise,
  activeGenerations,
} from './server-state';
import { loadModel } from './model-loader';
import { createRequestHandler } from './http-handler';

/**
 * Start the local inference HTTP server.
 */
export async function startServer(
  modelId: string,
): Promise<{ success: boolean; port?: number; error?: string }> {
  if (startServerPromise) {
    await startServerPromise;
    if (state.loadedModelId === modelId && state.port !== null) {
      return { success: true, port: state.port };
    }
    return startServer(modelId);
  }
  const promise = _startServerImpl(modelId).finally(() => {
    setStartServerPromise(null);
  });
  setStartServerPromise(promise);
  return promise;
}

async function _startServerImpl(
  modelId: string,
): Promise<{ success: boolean; port?: number; error?: string }> {
  if (state.server) {
    // Server already running - just load the new model
    try {
      await loadModel(modelId);
      return { success: true, port: state.port! };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, error: 'Server stopped during model load' };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load model',
      };
    }
  }

  try {
    await loadModel(modelId);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: 'Server stopped during model load' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load model',
    };
  }

  return new Promise((resolve) => {
    const server = http.createServer(createRequestHandler());

    // Listen on a random available port on localhost only
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        state.server = server;
        state.port = address.port;
        getLogCollector().logEnv(
          'INFO',
          `[HF Server] Listening on http://127.0.0.1:${address.port}`,
        );
        // Persist the chosen port so clients can reconnect after restart
        try {
          const storage = getStorage();
          const existingConfig = storage.getHuggingFaceLocalConfig();
          if (existingConfig) {
            storage.setHuggingFaceLocalConfig({ ...existingConfig, serverPort: address.port });
          }
        } catch (err) {
          getLogCollector().logEnv('WARN', '[HF Server] Failed to persist port to config:', {
            error: String(err),
          });
        }
        resolve({ success: true, port: address.port });
      } else {
        resolve({ success: false, error: 'Failed to get server address' });
      }
    });

    server.on('error', (error) => {
      getLogCollector().logEnv('ERROR', '[HF Server] Server error:', { error: String(error) });
      resolve({ success: false, error: error.message });
    });
  });
}

/**
 * Stop the local inference server and unload the model.
 */
export async function stopServer(): Promise<void> {
  // Signal any in-flight loadModel IIFE to abort state mutation
  state.isStopping = true;
  // Capture any in-flight loadModel promise so we can wait for it to observe
  // the isStopping flag before we reset it at the end of this function.
  const pendingLoad = loadModelPromise;

  if (state.server) {
    await new Promise<void>((resolve) => {
      // Close all keep-alive connections first so server.close() resolves promptly
      const srv = state.server!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ('closeAllConnections' in srv && typeof (srv as any).closeAllConnections === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (srv as any).closeAllConnections();
      }
      srv.close(() => {
        getLogCollector().logEnv('INFO', '[HF Server] Server stopped');
        resolve();
      });
    });
  }

  // Wait for active generations to complete (max 10s)
  const drainStart = Date.now();
  while (activeGenerations > 0 && Date.now() - drainStart < 10000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Dispose model only after HTTP server is fully closed and generations drained
  if (state.model) {
    try {
      await state.model.dispose?.();
    } catch {
      // Ignore dispose errors
    }
  }

  state.server = null;
  state.port = null;
  state.loadedModelId = null;
  state.pipeline = null;
  state.tokenizer = null;
  state.model = null;
  state.isLoading = false;
  // Wait for any in-flight loadModel to finish observing isStopping before
  // we clear the flag, so a concurrent startup can't assign state after shutdown.
  if (pendingLoad) {
    await pendingLoad.catch(() => {
      // Ignore errors from the aborted load
    });
  }
  state.isStopping = false;
}

/**
 * Get the current server status.
 */
export function getServerStatus(): {
  running: boolean;
  port: number | null;
  loadedModel: string | null;
  isLoading: boolean;
} {
  return {
    running: state.server !== null,
    port: state.port,
    loadedModel: state.loadedModelId,
    isLoading: state.isLoading,
  };
}

/**
 * Test that the server is running and responsive.
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  if (!state.server || !state.port) {
    return { success: false, error: 'Server is not running' };
  }

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`);
    if (response.ok) {
      return { success: true };
    }
    return { success: false, error: `Health check failed with status ${response.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}
