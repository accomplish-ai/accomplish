/**
 * Thought Stream API Server
 *
 * HTTP server that MCP tools (report-thought, report-checkpoint) call to stream
 * subagent thoughts/checkpoints to the UI in real-time. This bridges the MCP tools
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';
import { getLogCollector } from './logging';
import {
  THOUGHT_STREAM_PORT,
  createThoughtStreamHandler,
  type ThoughtStreamAPI,
  type ThoughtStreamEvent as ThoughtEvent,
  type ThoughtStreamCheckpointEvent as CheckpointEvent,
} from '@accomplish_ai/agent-core';
import { readJsonBody, HttpError } from './http/readJsonBody';

// Re-export types and constant for backwards compatibility
export { THOUGHT_STREAM_PORT };
export type { ThoughtEvent, CheckpointEvent };

// Store reference to main window
let mainWindow: BrowserWindow | null = null;

// Singleton handler instance for task tracking and event validation
const thoughtStreamHandler: ThoughtStreamAPI = createThoughtStreamHandler();

/**
 * Initialize the thought stream API with dependencies
 */
export function initThoughtStreamApi(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * Register a task ID as active (called when task starts)
 */
export function registerActiveTask(taskId: string): void {
  thoughtStreamHandler.registerTask(taskId);
}

/**
 * Unregister a task ID (called when task completes)
 */
export function unregisterActiveTask(taskId: string): void {
  thoughtStreamHandler.unregisterTask(taskId);
}

/**
 * Create and start the HTTP server for thought streaming
 */
export function startThoughtStreamServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body with a 1 MB size cap to prevent memory exhaustion.
    let data: Record<string, unknown>;
    try {
      data = await readJsonBody<Record<string, unknown>>(req, { maxBytes: 1 * 1024 * 1024 });
    } catch (err) {
      const status = err instanceof HttpError ? err.statusCode : 400;
      const message = err instanceof HttpError ? err.message : 'Invalid request';
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }

    // Validate taskId exists and is active
    const taskId = data.taskId as string;
    if (!taskId || !thoughtStreamHandler.isTaskActive(taskId)) {
      // Fire-and-forget: return 200 even for unknown tasks
      res.writeHead(200);
      res.end();
      return;
    }

    // Route based on endpoint
    if (req.url === '/thought') {
      handleThought(data as unknown as ThoughtEvent, res);
    } else if (req.url === '/checkpoint') {
      handleCheckpoint(data as unknown as CheckpointEvent, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(THOUGHT_STREAM_PORT, '127.0.0.1', () => {
    try {
      const l = getLogCollector();
      if (l?.log) {
        l.log(
          'INFO',
          'main',
          `[Thought Stream API] Server listening on port ${THOUGHT_STREAM_PORT}`,
        );
      }
    } catch (_e) {
      /* best-effort logging */
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      try {
        const l = getLogCollector();
        if (l?.log) {
          l.log(
            'WARN',
            'main',
            `[Thought Stream API] Port ${THOUGHT_STREAM_PORT} already in use, skipping server start`,
          );
        }
      } catch (_e) {
        /* best-effort logging */
      }
    } else {
      try {
        const l = getLogCollector();
        if (l?.log) {
          l.log('ERROR', 'main', '[Thought Stream API] Server error', { error: String(error) });
        }
      } catch (_e) {
        /* best-effort logging */
      }
    }
  });

  return server;
}

function handleThought(event: ThoughtEvent, res: http.ServerResponse): void {
  // Forward to renderer via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:thought', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}

function handleCheckpoint(event: CheckpointEvent, res: http.ServerResponse): void {
  // Forward to renderer via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:checkpoint', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}
