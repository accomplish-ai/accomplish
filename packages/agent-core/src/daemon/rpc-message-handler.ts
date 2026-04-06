/**
 * JSON-RPC 2.0 message parsing and dispatch helpers for DaemonRpcServer.
 * ESM module — use .js extensions on imports.
 */

import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from '../common/types/daemon.js';
import { JSON_RPC_ERRORS } from '../common/types/daemon.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMethodHandler = (params: any) => Promise<unknown> | unknown;

export interface RpcClient {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: { destroyed: boolean; write: (data: string) => any };
  buffer: string;
}

/**
 * Send a successful result response to a client.
 */
export function sendResult(client: RpcClient, id: string | number, result: unknown): void {
  const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  if (!client.socket.destroyed) {
    client.socket.write(JSON.stringify(response) + '\n');
  }
}

/**
 * Send an error response to a client.
 */
export function sendError(
  client: RpcClient,
  id: string | number,
  error: { code: number; message: string },
): void {
  const response: JsonRpcResponse = { jsonrpc: '2.0', id, error };
  if (!client.socket.destroyed) {
    client.socket.write(JSON.stringify(response) + '\n');
  }
}

/**
 * Parse and dispatch a single JSON-RPC line from a client.
 */
export async function handleRpcLine(
  client: RpcClient,
  line: string,
  handlers: Map<string, AnyMethodHandler>,
): Promise<void> {
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(line) as JsonRpcMessage;
  } catch {
    console.warn('[DaemonRpcServer] Failed to parse message from client', client.id);
    return;
  }

  // Only handle requests (messages with id + method)
  if (!('id' in message) || !('method' in message)) {
    return;
  }

  const request = message as JsonRpcRequest;
  const handler = handlers.get(request.method);

  if (!handler) {
    sendError(client, request.id as string | number, {
      code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
      message: `Method not found: ${request.method}`,
    });
    return;
  }

  try {
    const result = await handler(request.params);
    sendResult(client, request.id as string | number, result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[DaemonRpcServer] Handler error for ${request.method}:`, errorMessage);
    sendError(client, request.id as string | number, {
      code: JSON_RPC_ERRORS.INTERNAL_ERROR,
      message: errorMessage,
    });
  }
}
