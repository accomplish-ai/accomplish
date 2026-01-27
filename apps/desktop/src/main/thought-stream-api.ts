/**
 * Thought Stream API Server
 *
 * HTTP server that MCP tools (report-thought, report-checkpoint) call to stream
 * subagent thoughts/checkpoints to the UI in real-time. This bridges the MCP tools
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';

export const THOUGHT_STREAM_PORT = 9228;

// Event types
export interface ThoughtEvent {
  taskId: string;
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: number;
}

export interface CheckpointEvent {
  taskId: string;
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}

// Store reference to main window
let mainWindow: BrowserWindow | null = null;

// Track active task IDs for validation
const activeTaskIds = new Set<string>();

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
  activeTaskIds.add(taskId);
}

/**
 * Unregister a task ID (called when task completes)
 */
export function unregisterActiveTask(taskId: string): void {
  activeTaskIds.delete(taskId);
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

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
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
    if (!taskId || !activeTaskIds.has(taskId)) {
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
