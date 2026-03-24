/**
 * Permission API Server
 *
 * HTTP server that the file-permission MCP server calls to request
 * user permission for file operations. This bridges the MCP server
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';
import {
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
  isFilePermissionRequest,
  isQuestionRequest,
  createPermissionHandler,
  type PermissionHandlerAPI,
  type PermissionFileRequestData as FilePermissionRequestData,
  type PermissionQuestionRequestData as QuestionRequestData,
  type PermissionQuestionResponseData as QuestionResponseData,
} from '@accomplish_ai/agent-core';
import { getLogCollector } from './logging';

export { PERMISSION_API_PORT, QUESTION_API_PORT, isFilePermissionRequest, isQuestionRequest };

// Singleton permission request handler
const permissionHandler: PermissionHandlerAPI = createPermissionHandler();

// Store getter functions instead of direct references to avoid stale window captures
let getMainWindow: (() => BrowserWindow | null) | null = null;
let getActiveTaskId: (() => string | null) | null = null;

/**
 * Initialize the permission API with dependencies.
 * Accepts a getter for the main window so that the current (non-destroyed)
 * window is always resolved at request time, even after reloads/recreations.
 */
export function initPermissionApi(
  getWindow: () => BrowserWindow | null,
  taskIdGetter: () => string | null,
): void {
  getMainWindow = getWindow;
  getActiveTaskId = taskIdGetter;
}

/**
 * Resolve the task ID from a request body, preferring an explicit taskId
 * from the request (set by MCP server via ACCOMPLISH_TASK_ID env) over
 * the active-task fallback for backwards compatibility.
 */
function resolveTaskIdFromRequest(
  requestTaskId: unknown,
  taskIdGetter: () => string | null,
): { taskId: string | null; error?: string } {
  if (requestTaskId === undefined) {
    return { taskId: taskIdGetter() };
  }

  if (typeof requestTaskId !== 'string') {
    return { taskId: null, error: 'Invalid task ID' };
  }

  const trimmed = requestTaskId.trim();
  if (trimmed.length === 0) {
    return { taskId: taskIdGetter() };
  }

  return { taskId: trimmed };
}

/**
 * Resolve a pending permission request from the MCP server
 * Called when user responds via the UI
 */
export function resolvePermission(requestId: string, allowed: boolean): boolean {
  return permissionHandler.resolvePermissionRequest(requestId, allowed);
}

/**
 * Resolve a pending question request from the MCP server
 * Called when user responds via the UI
 */
export function resolveQuestion(requestId: string, response: QuestionResponseData): boolean {
  return permissionHandler.resolveQuestionRequest(requestId, response);
}

/**
 * Create and start the HTTP server for permission requests
 */
export function startPermissionApiServer(): http.Server {
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

    // Handle both file permissions (/permission) and desktop permissions (/desktop-permission)
    const isFilePermission = req.method === 'POST' && req.url === '/permission';
    const isDesktopPermission = req.method === 'POST' && req.url === '/desktop-permission';
    if (!isFilePermission && !isDesktopPermission) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let parsed: Record<string, unknown>;

    try {
      const rawParsed: unknown = JSON.parse(body);
      if (typeof rawParsed !== 'object' || rawParsed === null || Array.isArray(rawParsed)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      parsed = rawParsed as Record<string, unknown>;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Extract taskId before type-narrowing the rest of the request
    const requestTaskId = parsed.taskId;

    // For file permissions, validate the payload strictly.
    // For desktop permissions, only require an `operation` field (no filePath needed).
    if (isFilePermission) {
      const data = parsed as FilePermissionRequestData;
      const validation = permissionHandler.validateFilePermissionRequest(data);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }
    } else {
      // desktop-permission: just require an operation string
      if (!parsed.operation || typeof parsed.operation !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'operation is required for desktop permissions' }));
        return;
      }
    }

    const data = parsed as FilePermissionRequestData;

    // Resolve the current window at request time to avoid stale references
    const currentWindow = getMainWindow ? getMainWindow() : null;

    // Check if we have the necessary dependencies
    if (!currentWindow || currentWindow.isDestroyed() || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission API not initialized' }));
      return;
    }

    const { taskId, error } = resolveTaskIdFromRequest(requestTaskId, getActiveTaskId);
    if (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return;
    }

    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    // Create request using core handler
    const { requestId, promise } = permissionHandler.createPermissionRequest();

    // Build permission request for the UI.
    // For desktop permissions, synthesise a file-permission-shaped request so the
    // existing UI component can display it without changes.
    const uiData: FilePermissionRequestData = isDesktopPermission
      ? ({
          operation: String(parsed.operation),
          // Exclude the `operation` key and show the remaining details as the
          // file path field so the permission UI has human-readable context.
          filePath: JSON.stringify(
            Object.fromEntries(Object.entries(parsed).filter(([k]) => k !== 'operation')),
          ),
        } as unknown as FilePermissionRequestData)
      : data;
    const permissionRequest = permissionHandler.buildFilePermissionRequest(
      requestId,
      taskId,
      uiData,
    );

    // Send to renderer (Electron-specific)
    currentWindow.webContents.send('permission:request', permissionRequest);

    // Wait for user response
    try {
      const allowed = await promise;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
    } catch (_error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(PERMISSION_API_PORT, '127.0.0.1', () => {
    getLogCollector().logEnv(
      'INFO',
      `[Permission API] Server listening on port ${PERMISSION_API_PORT}`,
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      getLogCollector().logEnv(
        'WARN',
        `[Permission API] Port ${PERMISSION_API_PORT} already in use, skipping server start`,
      );
    } else {
      getLogCollector().logEnv('ERROR', '[Permission API] Server error:', { error: String(error) });
    }
  });

  return server;
}

/**
 * Create and start the HTTP server for question requests
 */
export function startQuestionApiServer(): http.Server {
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

    // Only handle POST /question
    if (req.method !== 'POST' || req.url !== '/question') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let parsed: Record<string, unknown>;

    try {
      const rawParsed: unknown = JSON.parse(body);
      if (typeof rawParsed !== 'object' || rawParsed === null || Array.isArray(rawParsed)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      parsed = rawParsed as Record<string, unknown>;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Extract taskId before type-narrowing the rest of the request
    const requestTaskId = parsed.taskId;
    const data = parsed as QuestionRequestData;

    // Validate request using core handler
    const validation = permissionHandler.validateQuestionRequest(data);
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: validation.error }));
      return;
    }

    // Resolve the current window at request time to avoid stale references
    const currentWindow = getMainWindow ? getMainWindow() : null;

    // Check if we have the necessary dependencies
    if (!currentWindow || currentWindow.isDestroyed() || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Question API not initialized' }));
      return;
    }

    const { taskId, error } = resolveTaskIdFromRequest(requestTaskId, getActiveTaskId);
    if (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return;
    }

    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    // Create request using core handler
    const { requestId, promise } = permissionHandler.createQuestionRequest();

    // Build question request for the UI
    const questionRequest = permissionHandler.buildQuestionRequest(requestId, taskId, data);

    // Send to renderer (Electron-specific)
    currentWindow.webContents.send('permission:request', questionRequest);

    // Wait for user response
    try {
      const response = await promise;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (_error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', denied: true }));
    }
  });

  server.listen(QUESTION_API_PORT, '127.0.0.1', () => {
    getLogCollector().logEnv(
      'INFO',
      `[Question API] Server listening on port ${QUESTION_API_PORT}`,
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      getLogCollector().logEnv(
        'WARN',
        `[Question API] Port ${QUESTION_API_PORT} already in use, skipping server start`,
      );
    } else {
      getLogCollector().logEnv('ERROR', '[Question API] Server error:', { error: String(error) });
    }
  });

  return server;
}
