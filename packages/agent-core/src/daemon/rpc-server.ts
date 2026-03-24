/**
 * DaemonRpcServer
 *
 * A Unix socket (or Windows named pipe) based JSON-RPC 2.0 server for the
 * standalone daemon process. Accepts multiple client connections and dispatches
 * registered method handlers.
 *
 * Unlike the in-process `DaemonServer`, this class is intentionally loosely
 * typed so that it can serve any JSON-RPC method without requiring every
 * method to be pre-declared in `DaemonMethodMap`.
 *
 * ESM module — use .js extensions on imports.
 */

import { createServer, type Server, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from '../common/types/daemon.js';
import { JSON_RPC_ERRORS } from '../common/types/daemon.js';
import { getSocketPath } from './socket-path.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMethodHandler = (params: any) => Promise<unknown> | unknown;

export interface DaemonRpcServerOptions {
  /** Override the default Unix socket / named pipe path. */
  socketPath?: string;
  onConnection?: (clientId: string) => void;
  onDisconnection?: (clientId: string) => void;
}

interface ConnectedClient {
  id: string;
  socket: Socket;
  buffer: string;
}

export class DaemonRpcServer {
  private readonly socketPath: string;
  private readonly onConnection?: (clientId: string) => void;
  private readonly onDisconnection?: (clientId: string) => void;

  private server: Server | null = null;
  private clients = new Map<string, ConnectedClient>();
  private handlers = new Map<string, AnyMethodHandler>();
  private startTime = Date.now();

  constructor(options: DaemonRpcServerOptions = {}) {
    this.socketPath = options.socketPath ?? getSocketPath();
    this.onConnection = options.onConnection;
    this.onDisconnection = options.onDisconnection;

    // Register built-in health check
    this.registerMethod('daemon.ping', () => ({
      status: 'ok' as const,
      uptime: Date.now() - this.startTime,
    }));
  }

  /**
   * Register a handler for a JSON-RPC method.
   */
  registerMethod(method: string, handler: AnyMethodHandler): void {
    this.handlers.set(method, handler);
  }

  /**
   * Push a notification to all connected clients.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notify(method: string, params: any): void {
    const notification = { jsonrpc: '2.0' as const, method, params };
    const data = JSON.stringify(notification) + '\n';
    for (const client of this.clients.values()) {
      if (!client.socket.destroyed) {
        client.socket.write(data);
      }
    }
  }

  /**
   * Start listening on the socket path.
   * Removes any stale socket file before binding.
   */
  async start(): Promise<void> {
    // Remove stale socket
    await this.removeStaleSocket();

    return new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => {
        const clientId = randomUUID();
        const client: ConnectedClient = { id: clientId, socket, buffer: '' };
        this.clients.set(clientId, client);
        this.onConnection?.(clientId);

        socket.setEncoding('utf8');

        socket.on('data', (chunk: string) => {
          client.buffer += chunk;
          const lines = client.buffer.split('\n');
          client.buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              void this.handleLine(client, trimmed);
            }
          }
        });

        socket.on('close', () => {
          this.clients.delete(clientId);
          this.onDisconnection?.(clientId);
        });

        socket.on('error', (err) => {
          console.error(`[DaemonRpcServer] Socket error for client ${clientId}:`, err.message);
          this.clients.delete(clientId);
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the server and disconnect all clients.
   */
  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      client.socket.destroy();
    }
    this.clients.clear();

    return new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async handleLine(client: ConnectedClient, line: string): Promise<void> {
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
    const handler = this.handlers.get(request.method);

    if (!handler) {
      this.sendError(client, request.id as string | number, {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`,
      });
      return;
    }

    try {
      const result = await handler(request.params);
      this.sendResult(client, request.id as string | number, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[DaemonRpcServer] Handler error for ${request.method}:`, errorMessage);
      this.sendError(client, request.id as string | number, {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: errorMessage,
      });
    }
  }

  private sendResult(client: ConnectedClient, id: string | number, result: unknown): void {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
    if (!client.socket.destroyed) {
      client.socket.write(JSON.stringify(response) + '\n');
    }
  }

  private sendError(
    client: ConnectedClient,
    id: string | number,
    error: { code: number; message: string },
  ): void {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, error };
    if (!client.socket.destroyed) {
      client.socket.write(JSON.stringify(response) + '\n');
    }
  }

  private async removeStaleSocket(): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(this.socketPath);
    } catch {
      // File doesn't exist — that's fine
    }
  }
}
