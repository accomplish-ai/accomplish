/**
 * Permission API Server
 *
 * HTTP server that the file-permission MCP server calls to request
 * user permission for file operations. This bridges the MCP server
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';
import type { PermissionRequest, FileOperation } from '@accomplish/shared';
import {
  getTaskLanguage,
  isEnglish,
  translateFromEnglish,
  translateToEnglish,
} from './services/translationService';

export const PERMISSION_API_PORT = 9226;
export const QUESTION_API_PORT = 9227;

interface PendingPermission {
  resolve: (allowed: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

interface PendingQuestion {
  resolveWithData: (data: { selectedOptions?: string[]; customText?: string; denied?: boolean }) => void;
  timeoutId: NodeJS.Timeout;
}

// Store pending permission requests waiting for user response
const pendingPermissions = new Map<string, PendingPermission>();

// Store pending question requests waiting for user response
const pendingQuestions = new Map<string, PendingQuestion>();

// Store reference to main window and task manager
let mainWindow: BrowserWindow | null = null;
let getActiveTaskId: (() => string | null) | null = null;

/**
 * Initialize the permission API with dependencies
 */
export function initPermissionApi(
  window: BrowserWindow,
  taskIdGetter: () => string | null
): void {
  mainWindow = window;
  getActiveTaskId = taskIdGetter;
}

/**
 * Resolve a pending permission request from the MCP server
 * Called when user responds via the UI
 */
export function resolvePermission(requestId: string, allowed: boolean): boolean {
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pending.resolve(allowed);
  pendingPermissions.delete(requestId);
  return true;
}

/**
 * Resolve a pending question request from the MCP server
 * Called when user responds via the UI
 */
export function resolveQuestion(
  requestId: string,
  response: { selectedOptions?: string[]; customText?: string; denied?: boolean }
): boolean {
  const pending = pendingQuestions.get(requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pending.resolveWithData(response);
  pendingQuestions.delete(requestId);
  return true;
}

/**
 * Generate a unique request ID for file permissions
 */
function generateRequestId(): string {
  return `filereq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a unique request ID for questions
 */
function generateQuestionRequestId(): string {
  return `questionreq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Translate question content to target language for display
 */
async function translateQuestionForDisplay(
  question: string,
  header: string | undefined,
  options: Array<{ label: string; description?: string }> | undefined,
  targetLang: string
): Promise<{
  question: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
}> {
  try {
    // Translate question
    const translatedQuestion = await translateFromEnglish(question, targetLang);

    // Translate header if present
    const translatedHeader = header
      ? await translateFromEnglish(header, targetLang)
      : undefined;

    // Translate options if present
    let translatedOptions: Array<{ label: string; description?: string }> | undefined;
    if (options && options.length > 0) {
      translatedOptions = await Promise.all(
        options.map(async (opt) => ({
          label: await translateFromEnglish(opt.label, targetLang),
          description: opt.description
            ? await translateFromEnglish(opt.description, targetLang)
            : undefined,
        }))
      );
    }

    return {
      question: translatedQuestion,
      header: translatedHeader,
      options: translatedOptions,
    };
  } catch (err) {
    console.warn('[Question API] Failed to translate question content:', err);
    // Return original content on error
    return { question, header, options };
  }
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

    // Only handle POST /permission
    if (req.method !== 'POST' || req.url !== '/permission') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: {
      operation?: string;
      filePath?: string;
      filePaths?: string[];
      targetPath?: string;
      contentPreview?: string;
    };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.operation || (!data.filePath && (!data.filePaths || data.filePaths.length === 0))) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'operation and either filePath or filePaths are required' }));
      return;
    }

    // Validate operation type
    const validOperations = ['create', 'delete', 'rename', 'move', 'modify', 'overwrite'];
    if (!validOperations.includes(data.operation)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid operation. Must be one of: ${validOperations.join(', ')}` }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    const requestId = generateRequestId();

    // Create permission request for the UI
    const permissionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'file',
      fileOperation: data.operation as FileOperation,
      filePath: data.filePath,
      filePaths: data.filePaths,
      targetPath: data.targetPath,
      contentPreview: data.contentPreview?.substring(0, 500),
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    mainWindow.webContents.send('permission:request', permissionRequest);

    // Wait for user response (with 5 minute timeout)
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

    try {
      const allowed = await new Promise<boolean>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }, PERMISSION_TIMEOUT_MS);

        pendingPermissions.set(requestId, { resolve, timeoutId });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
    } catch (error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(PERMISSION_API_PORT, '127.0.0.1', () => {
    console.log(`[Permission API] Server listening on port ${PERMISSION_API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Permission API] Port ${PERMISSION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Permission API] Server error:', error);
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

    let data: {
      question?: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.question) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'question is required' }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Question API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    const requestId = generateQuestionRequestId();

    // Check if task has a non-English language for translation
    const taskLang = getTaskLanguage(taskId);
    const needsTranslation = taskLang && !isEnglish(taskLang);

    // Store original option labels for mapping translated responses back
    const originalOptionLabels = data.options?.map((opt) => opt.label) || [];

    // Translate question content if needed
    let displayQuestion = data.question;
    let displayHeader = data.header;
    let displayOptions = data.options;
    let translatedToOriginalMap: Map<string, string> | undefined;

    if (needsTranslation) {
      const translated = await translateQuestionForDisplay(
        data.question,
        data.header,
        data.options,
        taskLang
      );
      displayQuestion = translated.question;
      displayHeader = translated.header;
      displayOptions = translated.options;

      // Build map from translated labels to original labels
      if (displayOptions && originalOptionLabels.length > 0) {
        translatedToOriginalMap = new Map();
        for (let i = 0; i < displayOptions.length; i++) {
          translatedToOriginalMap.set(displayOptions[i].label, originalOptionLabels[i]);
        }
      }
    }

    // Create question request for the UI (with translated content)
    const questionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'question',
      question: displayQuestion,
      header: displayHeader,
      options: displayOptions,
      multiSelect: data.multiSelect,
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    mainWindow.webContents.send('permission:request', questionRequest);

    // Wait for user response (with 5 minute timeout)
    const QUESTION_TIMEOUT_MS = 5 * 60 * 1000;

    try {
      const response = await new Promise<{ selectedOptions?: string[]; customText?: string; denied?: boolean }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingQuestions.delete(requestId);
          reject(new Error('Question request timed out'));
        }, QUESTION_TIMEOUT_MS);

        pendingQuestions.set(requestId, { resolveWithData: resolve, timeoutId });
      });

      // Translate response back to English if needed
      let finalResponse = response;
      if (needsTranslation && !response.denied) {
        // Map translated option labels back to original English labels
        if (response.selectedOptions && translatedToOriginalMap) {
          finalResponse = {
            ...response,
            selectedOptions: response.selectedOptions.map(
              (opt) => translatedToOriginalMap!.get(opt) || opt
            ),
          };
        }

        // Translate custom text back to English
        if (response.customText) {
          try {
            const translatedCustomText = await translateToEnglish(response.customText, taskLang);
            finalResponse = {
              ...finalResponse,
              customText: translatedCustomText,
            };
          } catch (err) {
            console.warn('[Question API] Failed to translate custom text response:', err);
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(finalResponse));
    } catch (error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', denied: true }));
    }
  });

  server.listen(QUESTION_API_PORT, '127.0.0.1', () => {
    console.log(`[Question API] Server listening on port ${QUESTION_API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Question API] Port ${QUESTION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Question API] Server error:', error);
    }
  });

  return server;
}

/**
 * Check if a request ID is a file permission request from the MCP server
 */
export function isFilePermissionRequest(requestId: string): boolean {
  return requestId.startsWith('filereq_');
}

/**
 * Check if a request ID is a question request from the MCP server
 */
export function isQuestionRequest(requestId: string): boolean {
  return requestId.startsWith('questionreq_');
}
