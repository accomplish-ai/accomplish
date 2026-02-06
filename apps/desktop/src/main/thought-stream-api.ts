/**
 * Thought Stream API Server
 *
 * HTTP server that MCP tools (report-thought, report-checkpoint) call to stream
 * subagent thoughts/checkpoints to the UI in real-time. This bridges the MCP tools
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';
import {
  THOUGHT_STREAM_PORT,
  createThoughtStreamHandler,
  type ThoughtStreamAPI,
  type ThoughtEvent,
  type CheckpointEvent,
} from '@accomplish/agent-core';
import { SERVER_SECRET } from './utils/server-secret';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

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
    // CORS headers for local requests only
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Verify shared secret
    if (req.headers.authorization !== `Bearer ${SERVER_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body with size limit
    let body = '';
    let aborted = false;
    for await (const chunk of req) {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        aborted = true;
        req.destroy();
        break;
      }
    }
    if (aborted) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
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
      if (typeof data.content !== 'string' || typeof data.category !== 'string' ||
          typeof data.agentName !== 'string' || typeof data.timestamp !== 'number') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid thought event data' }));
        return;
      }
      handleThought(data as unknown as ThoughtEvent, res);
    } else if (req.url === '/checkpoint') {
      if (typeof data.status !== 'string' || typeof data.summary !== 'string' ||
          typeof data.agentName !== 'string' || typeof data.timestamp !== 'number') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid checkpoint event data' }));
        return;
      }
      handleCheckpoint(data as unknown as CheckpointEvent, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(THOUGHT_STREAM_PORT, '127.0.0.1', () => {
    console.log(`[Thought Stream API] Server listening on port ${THOUGHT_STREAM_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Thought Stream API] Port ${THOUGHT_STREAM_PORT} already in use, skipping server start`);
    } else {
      console.error('[Thought Stream API] Server error:', error);
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
