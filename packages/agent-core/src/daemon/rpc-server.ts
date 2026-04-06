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
import { getSocketPath } from './socket-path.js';
import { handleRpcLine, type AnyMethodHandler } from './rpc-message-handler.js';

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
   * Whether any clients are currently connected.
   * Used to fast-fail permission requests when no UI can respond.
   */
  hasConnectedClients(): boolean {
    for (const client of this.clients.values()) {
      if (!client.socket.destroyed) {
        return true;
      }
    }
    return false;
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
              void handleRpcLine(client, trimmed, this.handlers);
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

  private async removeStaleSocket(): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(this.socketPath);
    } catch {
      // File doesn't exist — that's fine
    }
  }
}
