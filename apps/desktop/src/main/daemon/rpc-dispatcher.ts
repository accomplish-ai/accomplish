/**
 * Accomplish Daemon RPC Dispatcher
 *
 * Manages the method handler registry and dispatches incoming JSON-RPC 2.0
 * requests to the appropriate handler. Extracted from server.ts to keep
 * the socket-lifecycle module focused and under 200 lines.
 */

import { getLogCollector } from '../logging';

import type { DaemonMethod } from './server';

function safeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  try {
    const logger = getLogCollector();
    if (logger?.log) {
      logger.log(level, 'daemon', message, data);
      return;
    }
  } catch (_e) {
    /* ignore */
  }
  // Logger not yet initialized — silently skip (avoids console.* in production)
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type MethodHandler = (params: unknown) => Promise<unknown> | unknown;

const methodHandlers = new Map<string, MethodHandler>();

export function registerMethod(method: DaemonMethod | string, handler: MethodHandler): void {
  methodHandlers.set(method, handler);
}

/**
 * Validates that an unknown value conforms to the JSON-RPC 2.0 request shape.
 * Invalid shapes receive -32600 Invalid Request, not -32601 Method not found.
 */
export function isValidJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (v['jsonrpc'] !== '2.0') {
    return false;
  }
  if (typeof v['method'] !== 'string' || !v['method']) {
    return false;
  }
  if ('id' in v && v['id'] !== null && typeof v['id'] !== 'string' && typeof v['id'] !== 'number') {
    return false;
  }
  return true;
}

function isNotification(request: JsonRpcRequest): boolean {
  return typeof request.id === 'undefined';
}

/**
 * Dispatch a single JSON-RPC line to the appropriate method handler.
 * Writes a response JSON line to `writeFn` (may be no-op for notifications).
 */
function safeWrite(writeFn: (response: string) => void, response: string): void {
  try {
    writeFn(response);
  } catch (_e) {
    /* socket destroyed — drop response */
  }
}

export function handleLine(line: string, writeFn: (response: string) => void): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    const errResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    };
    safeWrite(writeFn, JSON.stringify(errResponse) + '\n');
    return;
  }

  if (!isValidJsonRpcRequest(parsed)) {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
    safeWrite(writeFn, JSON.stringify(response) + '\n');
    return;
  }

  const request = parsed;
  const { id, method, params } = request;
  const notification = isNotification(request);

  const handler = methodHandlers.get(method);
  if (!handler) {
    if (notification) {
      return;
    }
    const errResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
    safeWrite(writeFn, JSON.stringify(errResponse) + '\n');
    return;
  }

  Promise.resolve()
    .then(() => handler(params))
    .then((result) => {
      if (notification) {
        return;
      }
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: id ?? null,
        result,
      };
      safeWrite(writeFn, JSON.stringify(response) + '\n');
    })
    .catch((err: unknown) => {
      if (notification) {
        return;
      }
      safeLog('ERROR', `RPC handler error for method "${method}"`, {
        error: err instanceof Error ? err.message : String(err),
      });
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: { reason: 'internal' },
        },
      };
      safeWrite(writeFn, JSON.stringify(response) + '\n');
    });
}
