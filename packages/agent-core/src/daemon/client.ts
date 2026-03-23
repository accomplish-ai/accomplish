/**
 * Daemon Client
 *
 * Sends JSON-RPC 2.0 requests to a DaemonServer via a DaemonTransport
 * and receives notifications pushed by the server.
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
} from '../common/types/daemon.js';
import { JSON_RPC_ERRORS } from '../common/types/daemon.js';

type NotificationHandler<N extends DaemonNotification> = (params: DaemonNotificationMap[N]) => void;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface DaemonClientOptions {
  transport: DaemonTransport;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class DaemonClient {
  private transport: DaemonTransport;
  private timeout: number;
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();
  private notificationHandlers = new Map<string, NotificationHandler<DaemonNotification>[]>();

  constructor(options: DaemonClientOptions) {
    this.transport = options.transport;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    this.transport.onMessage((msg) => {
      this.handleMessage(msg);
    });
  }

  /**
   * Send a typed RPC request to the daemon and await the result.
   */
  async call<M extends DaemonMethod>(
    method: M,
    params?: DaemonMethodMap[M]['params'],
  ): Promise<DaemonMethodMap[M]['result']> {
    const id = this.nextId++;

    const request: JsonRpcRequest<DaemonMethodMap[M]['params']> = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<DaemonMethodMap[M]['result']>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method} (${this.timeout}ms)`));
      }, this.timeout);

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      this.transport.send(request as JsonRpcMessage);
    });
  }

  /**
   * Register a handler for server-pushed notifications.
   */
  onNotification<N extends DaemonNotification>(method: N, handler: NotificationHandler<N>): void {
    const handlers = this.notificationHandlers.get(method) ?? [];
    handlers.push(handler as NotificationHandler<DaemonNotification>);
    this.notificationHandlers.set(method, handlers);
  }

  /**
   * Health check — ping the daemon.
   */
  async ping(): Promise<{ status: 'ok'; uptime: number }> {
    return this.call('daemon.ping');
  }

  /**
   * Close the client and reject all pending requests.
   */
  close(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client closed'));
      this.pending.delete(id);
    }
    this.notificationHandlers.clear();
    this.transport.close();
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response to a pending request
    if ('id' in message && !('method' in message)) {
      const response = message as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      this.pending.delete(response.id);
      clearTimeout(pending.timer);

      if (response.error) {
        const err = new Error(response.error.message);
        (err as Error & { code: number }).code =
          response.error.code ?? JSON_RPC_ERRORS.INTERNAL_ERROR;
        pending.reject(err);
      } else {
        pending.resolve(response.result);
      }
      return;
    }

    // Server-pushed notification (no `id`)
    if ('method' in message && !('id' in message)) {
      const notification = message as { method: string; params?: unknown };
      const handlers = this.notificationHandlers.get(notification.method);
      if (handlers) {
        for (const handler of handlers) {
          handler(notification.params as DaemonNotificationMap[DaemonNotification]);
        }
      }
    }
  }
}
