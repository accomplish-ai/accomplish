/**
 * Daemon Server
 *
 * Listens for JSON-RPC 2.0 requests on a DaemonTransport, dispatches them
 * to registered method handlers, and pushes notifications to connected clients.
 *
 * ESM module — use .js extensions on imports.
 */

import type {
  DaemonTransport,
  DaemonMethod,
  DaemonMethodMap,
  DaemonNotification,
  DaemonNotificationMap,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from '../common/types/daemon.js';
import { JSON_RPC_ERRORS } from '../common/types/daemon.js';

type MethodHandler<M extends DaemonMethod> = (
  params: DaemonMethodMap[M]['params'],
) => Promise<DaemonMethodMap[M]['result']> | DaemonMethodMap[M]['result'];

export interface DaemonServerOptions {
  transport: DaemonTransport;
}

export class DaemonServer {
  private transport: DaemonTransport;
  private handlers = new Map<string, MethodHandler<DaemonMethod>>();
  private startTime = Date.now();

  constructor(options: DaemonServerOptions) {
    this.transport = options.transport;

    // Register built-in health check
    this.registerMethod('daemon.ping', () => ({
      status: 'ok' as const,
      uptime: Date.now() - this.startTime,
    }));

    this.transport.onMessage((msg) => {
      void this.handleMessage(msg);
    });
  }

  /**
   * Register a handler for an RPC method.
   */
  registerMethod<M extends DaemonMethod>(method: M, handler: MethodHandler<M>): void {
    this.handlers.set(method, handler as unknown as MethodHandler<DaemonMethod>);
  }

  /**
   * Push a notification to the connected client.
   */
  notify<N extends DaemonNotification>(method: N, params: DaemonNotificationMap[N]): void {
    const notification: JsonRpcNotification<DaemonNotificationMap[N]> = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.transport.send(notification as JsonRpcMessage);
  }

  /**
   * Shut down the server and close the transport.
   */
  close(): void {
    this.transport.close();
    this.handlers.clear();
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    // Only handle requests (messages with an `id`)
    if (!('id' in message) || !('method' in message)) {
      return;
    }

    const request = message as JsonRpcRequest;
    const handler = this.handlers.get(request.method);

    if (!handler) {
      this.sendError(request.id as string | number, {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`,
      });
      return;
    }

    try {
      const result = await handler(request.params as DaemonMethodMap[DaemonMethod]['params']);
      this.sendResult(request.id as string | number, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[DaemonServer] Handler error for ${request.method}:`, errorMessage);
      this.sendError(request.id as string | number, {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: errorMessage,
      });
    }
  }

  private sendResult(id: string | number, result: unknown): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.transport.send(response);
  }

  private sendError(id: string | number, error: { code: number; message: string }): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error,
    };
    this.transport.send(response);
  }
}
