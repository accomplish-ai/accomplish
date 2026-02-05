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
  type ThoughtStreamEvent as ThoughtEvent,
  type ThoughtStreamCheckpointEvent as CheckpointEvent,
} from '@accomplish/agent-core';

export { THOUGHT_STREAM_PORT };
export type { ThoughtEvent, CheckpointEvent };

let mainWindow: BrowserWindow | null = null;

const thoughtStreamHandler: ThoughtStreamAPI = createThoughtStreamHandler();

export function initThoughtStreamApi(window: BrowserWindow): void {
  mainWindow = window;
}

export function registerActiveTask(taskId: string): void {
  thoughtStreamHandler.registerTask(taskId);
}

export function unregisterActiveTask(taskId: string): void {
  thoughtStreamHandler.unregisterTask(taskId);
}

export function startThoughtStreamServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

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

    const taskId = data.taskId as string;
    if (!taskId || !thoughtStreamHandler.isTaskActive(taskId)) {
      // Fire-and-forget: return 200 even for unknown tasks
      res.writeHead(200);
      res.end();
      return;
    }

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:thought', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}

function handleCheckpoint(event: CheckpointEvent, res: http.ServerResponse): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:checkpoint', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}
