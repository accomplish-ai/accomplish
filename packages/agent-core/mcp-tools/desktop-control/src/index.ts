/**
 * Desktop Control MCP Tool — HTTP Server
 *
 * Express HTTP server that exposes desktop automation actions.
 * Every action goes through:
 *   1. Request validation
 *   2. Blocklist check (against active window / target window)
 *   3. User permission request (via the permission HTTP API)
 *   4. Execution via automation.ts
 *
 * Follows the same serve pattern as dev-browser.
 */

import express, { type Express, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import type { Socket } from 'net';
import {
  DESKTOP_ACTION_TYPES,
  type DesktopActionRequest,
  type DesktopActionResult,
  type DesktopPermissionRequestData,
  type ServeOptions,
  type DesktopControlServer,
  type BlocklistEntry,
} from './types.js';
import { checkBlocklist, mergeBlocklists } from './blocklist.js';
import { executeDesktopAction } from './automation.js';

export type {
  ServeOptions,
  DesktopControlServer,
  DesktopActionRequest,
  DesktopActionResult,
  BlocklistEntry,
};

const DEFAULT_PORT = 7400;
const DEFAULT_PERMISSION_API_PORT = 7822;

/**
 * Build a human-readable description of the action for the permission prompt.
 */
function describeAction(request: DesktopActionRequest): string {
  switch (request.action) {
    case 'click':
      return `Click at (${request.x}, ${request.y})`;
    case 'doubleClick':
      return `Double-click at (${request.x}, ${request.y})`;
    case 'rightClick':
      return `Right-click at (${request.x}, ${request.y})`;
    case 'moveMouse':
      return `Move mouse to (${request.x}, ${request.y})`;
    case 'scroll':
      return `Scroll ${request.direction ?? 'down'} by ${request.amount ?? 3}`;
    case 'type':
      return `Type text: "${(request.text ?? '').slice(0, 50)}${(request.text ?? '').length > 50 ? '...' : ''}"`;
    case 'hotkey':
      return `Press hotkey: ${(request.keys ?? []).join(' + ')}`;
    case 'pressKey':
      return `Press key(s): ${(request.keys ?? []).join(' + ')}`;
    case 'releaseKey':
      return `Release key(s): ${(request.keys ?? []).join(' + ')}`;
    case 'screenshot':
      return 'Take a screenshot of the desktop';
    case 'listWindows':
      return 'List all open windows';
    case 'findWindow':
      return `Find window: "${request.title ?? ''}"`;
    case 'focusWindow':
      return `Focus window: "${request.title ?? ''}"`;
    case 'resizeWindow':
      return `Resize window "${request.title ?? ''}" to ${request.width}×${request.height}`;
    case 'repositionWindow':
      return `Move window "${request.title ?? ''}" to (${request.x}, ${request.y})`;
    default:
      return `Desktop action: ${request.action}`;
  }
}

/**
 * Request user permission for a desktop action via the permission HTTP API.
 * Returns true if allowed, false if denied.
 */
async function requestPermission(
  request: DesktopActionRequest,
  permissionApiPort: number,
): Promise<boolean> {
  const permissionData: DesktopPermissionRequestData = {
    action: request.action,
    description: describeAction(request),
    ...(request.title && { targetWindow: request.title }),
    ...(request.x !== undefined &&
      request.y !== undefined && { coordinates: { x: request.x, y: request.y } }),
    ...(request.text && { text: request.text }),
    ...(request.keys && { keys: request.keys }),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`http://127.0.0.1:${permissionApiPort}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        operation: 'desktop_action',
        toolName: `desktop.${request.action}`,
        description: permissionData.description,
        details: permissionData,
      }),
    });

    if (!response.ok) {
      console.error(`[desktop-control] Permission API returned ${response.status}`);
      return false;
    }

    const result = (await response.json()) as { allowed: boolean };
    return result.allowed;
  } catch (error) {
    console.error(
      '[desktop-control] Failed to reach permission API:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate a DesktopActionRequest — returns an error string or null if valid.
 */
function validateRequest(
  body: unknown,
): { data: DesktopActionRequest; error: null } | { data: null; error: string } {
  if (!body || typeof body !== 'object') {
    return { data: null, error: 'Request body must be a JSON object' };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj['action'] !== 'string') {
    return { data: null, error: 'action field is required and must be a string' };
  }

  const action = obj['action'] as string;
  if (!DESKTOP_ACTION_TYPES.includes(action as (typeof DESKTOP_ACTION_TYPES)[number])) {
    return {
      data: null,
      error: `Unknown action: "${action}". Valid actions: ${DESKTOP_ACTION_TYPES.join(', ')}`,
    };
  }

  return { data: obj as unknown as DesktopActionRequest, error: null };
}

/**
 * Start the desktop-control HTTP server.
 */
export async function serve(options: ServeOptions = {}): Promise<DesktopControlServer> {
  const port = options.port ?? DEFAULT_PORT;
  const permissionApiPort = options.permissionApiPort ?? DEFAULT_PERMISSION_API_PORT;
  const screenshotDir = options.screenshotDir ?? path.join(process.cwd(), 'screenshots');

  // Merge default blocklist entries with custom entries loaded from storage by the caller
  const blocklist: BlocklistEntry[] = mergeBlocklists(options.customBlocklist ?? []);

  const app: Express = express();
  app.use(express.json());

  // ─── Health check ─────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'desktop-control' });
  });

  // ─── Server info ──────────────────────────────────────────────
  app.get('/info', (_req: Request, res: Response) => {
    res.json({
      service: 'desktop-control',
      version: '0.0.1',
      platform: process.platform,
      arch: process.arch,
      actions: [...DESKTOP_ACTION_TYPES],
      blocklistSize: blocklist.length,
    });
  });

  // ─── Execute a desktop action ─────────────────────────────────
  app.post('/action', async (req: Request, res: Response) => {
    const validation = validateRequest(req.body);
    if (validation.error) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const request = validation.data;
    if (!request) {
      res.status(400).json({ success: false, error: 'Invalid request' });
      return;
    }

    // Check blocklist for window-targeting actions
    if (request.title) {
      const blocked = checkBlocklist(request.title, blocklist);
      if (blocked) {
        const result: DesktopActionResult = {
          success: false,
          action: request.action,
          error: `Blocked: "${blocked.appName}" is on the sensitive app blocklist. Reason: ${blocked.reason}`,
          blockedByBlocklist: true,
        };
        res.status(403).json(result);
        return;
      }
    }

    // Request user permission
    const allowed = await requestPermission(request, permissionApiPort);
    if (!allowed) {
      const result: DesktopActionResult = {
        success: false,
        action: request.action,
        error: 'Action denied by user',
      };
      res.status(403).json(result);
      return;
    }

    // Execute the action
    try {
      const result = await executeDesktopAction(request, screenshotDir);
      res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[desktop-control] Unhandled action error:', errorMessage);
      const result: DesktopActionResult = {
        success: false,
        action: request.action,
        error: `Desktop action failed: ${errorMessage}`,
      };
      res.status(500).json(result);
    }
  });

  // ─── Blocklist endpoints ──────────────────────────────────────
  app.get('/blocklist', (_req: Request, res: Response) => {
    res.json({ blocklist });
  });

  app.post('/blocklist/check', (req: Request, res: Response) => {
    const { title } = req.body as { title?: string };
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const blocked = checkBlocklist(title, blocklist);
    res.json({ blocked: !!blocked, entry: blocked ?? null });
  });

  // ─── Start server ─────────────────────────────────────────────
  const connections = new Set<Socket>();

  const server = http.createServer(app);

  server.on('connection', (socket: Socket) => {
    connections.add(socket);
    socket.on('close', () => {
      connections.delete(socket);
    });
  });

  return new Promise<DesktopControlServer>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.error(`[desktop-control] Server listening on http://127.0.0.1:${port}`);
      console.error(`[desktop-control] Platform: ${process.platform} (${process.arch})`);
      console.error(`[desktop-control] Blocklist entries: ${blocklist.length}`);

      const stop = async (): Promise<void> => {
        return new Promise<void>((resolveStop) => {
          for (const socket of connections) {
            socket.destroy();
          }
          connections.clear();
          server.close(() => {
            console.error('[desktop-control] Server stopped');
            resolveStop();
          });
        });
      };

      resolve({ port, stop });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`[desktop-control] Port ${port} already in use`);
      }
      reject(error);
    });
  });
}
