import http from 'http';
import {
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  THOUGHT_STREAM_PORT,
  createPermissionHandler,
  createThoughtStreamHandler,
} from '@accomplish_ai/agent-core';
import type { PermissionHandlerAPI, ThoughtStreamAPI } from '@accomplish_ai/agent-core';
import { broadcast, onClientMessage } from './websocket.js';
import type { ClientMessage } from './websocket.js';

const permissionHandler: PermissionHandlerAPI = createPermissionHandler();
const thoughtStreamHandler: ThoughtStreamAPI = createThoughtStreamHandler();

let getActiveTaskId: (() => string | null) | null = null;

export function initMcpBridges(taskIdGetter: () => string | null): void {
  getActiveTaskId = taskIdGetter;

  // Listen for permission/question responses from WebSocket clients
  onClientMessage((msg: ClientMessage) => {
    if (msg.type === 'permission:response') {
      permissionHandler.resolvePermissionRequest(msg.requestId, msg.allowed);
    } else if (msg.type === 'question:response') {
      permissionHandler.resolveQuestionRequest(msg.requestId, msg.data as Record<string, unknown>);
    }
  });
}

export function registerActiveTask(taskId: string): void {
  thoughtStreamHandler.registerTask(taskId);
}

export function unregisterActiveTask(taskId: string): void {
  thoughtStreamHandler.unregisterTask(taskId);
}

/**
 * Parse JSON body from an HTTP request.
 */
async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body) as T;
}

/**
 * Set common CORS headers on a response.
 */
function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function createMcpServer(
  port: number,
  label: string,
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): http.Server {
  const server = http.createServer((req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    handler(req, res);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[${label}] Listening on port ${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[${label}] Port ${port} in use, skipping`);
    } else {
      console.error(`[${label}] Error:`, err);
    }
  });

  return server;
}

export function startPermissionServer(): http.Server {
  return createMcpServer(PERMISSION_API_PORT, 'Permission API', async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/permission')
      return json(res, 404, { error: 'Not found' });

    const data = await parseBody(req);
    const validation = permissionHandler.validateFilePermissionRequest(
      data as Record<string, unknown>,
    );
    if (!validation.valid) return json(res, 400, { error: validation.error });

    const taskId = getActiveTaskId?.();
    if (!taskId) return json(res, 400, { error: 'No active task' });

    const { requestId, promise } = permissionHandler.createPermissionRequest();
    const permReq = permissionHandler.buildFilePermissionRequest(
      requestId,
      taskId,
      data as Record<string, unknown>,
    );

    // Forward to UI clients via WebSocket
    broadcast({ type: 'permission:request', data: permReq });

    const allowed = await promise;
    json(res, 200, { allowed });
  });
}

export function startQuestionServer(): http.Server {
  return createMcpServer(QUESTION_API_PORT, 'Question API', async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/question')
      return json(res, 404, { error: 'Not found' });

    const data = await parseBody(req);
    const validation = permissionHandler.validateQuestionRequest(data as Record<string, unknown>);
    if (!validation.valid) return json(res, 400, { error: validation.error });

    const taskId = getActiveTaskId?.();
    if (!taskId) return json(res, 400, { error: 'No active task' });

    const { requestId, promise } = permissionHandler.createQuestionRequest();
    const questionReq = permissionHandler.buildQuestionRequest(
      requestId,
      taskId,
      data as Record<string, unknown>,
    );

    broadcast({ type: 'permission:request', data: questionReq });

    const response = await promise;
    json(res, 200, response);
  });
}

export function startThoughtStreamServer(): http.Server {
  return createMcpServer(THOUGHT_STREAM_PORT, 'Thought Stream', async (req, res) => {
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });

    const data = await parseBody<Record<string, unknown>>(req);
    const taskId = data.taskId as string;

    if (!taskId || !thoughtStreamHandler.isTaskActive(taskId)) {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/thought') {
      broadcast({ type: 'task:thought', data });
    } else if (req.url === '/checkpoint') {
      broadcast({ type: 'task:checkpoint', data });
    }

    res.writeHead(200);
    res.end();
  });
}
