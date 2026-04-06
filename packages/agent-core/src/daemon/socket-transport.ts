/**
 * Socket Transport
 *
 * A DaemonTransport implementation that communicates over a Unix socket
 * (macOS/Linux) or Windows named pipe. Connects to a DaemonRpcServer
 * using the same newline-delimited JSON protocol.
 *
 * ESM module — use .js extensions on imports.
 */

import { connect, type Socket } from 'node:net';
import type { DaemonTransport, JsonRpcMessage } from '../common/types/daemon.js';
import { getSocketPath } from './socket-path.js';

const MAX_BUFFER_BYTES = 1 * 1024 * 1024; // 1 MB — matches DaemonRpcServer

type MessageHandler = (message: JsonRpcMessage) => void;
type DisconnectHandler = () => void;

export interface SocketTransportOptions {
  /** Override the default socket path derived from dataDir / global default. */
  socketPath?: string;
  /** Data directory — used to derive socket path if socketPath not provided. */
  dataDir?: string;
  /** Connection timeout in ms (default: 5000). */
  connectTimeout?: number;
}

/**
 * Create a DaemonTransport backed by a socket connection.
 *
 * Resolves when the socket is connected and ready. Rejects on connection
 * error or timeout.
 *
 * The returned transport has an additional `onDisconnect` method for
 * reconnection logic.
 */
export async function createSocketTransport(
  options: SocketTransportOptions = {},
): Promise<DaemonTransport & { onDisconnect: (handler: DisconnectHandler) => void }> {
  const socketPath = options.socketPath ?? getSocketPath(options.dataDir);
  const connectTimeout = options.connectTimeout ?? 5000;

  const socket = await connectToSocket(socketPath, connectTimeout);
  return createTransportFromSocket(socket);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function connectToSocket(socketPath: string, timeoutMs: number): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Socket connection timeout after ${timeoutMs}ms: ${socketPath}`));
    }, timeoutMs);

    const socket = connect({ path: socketPath }, () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function createTransportFromSocket(
  socket: Socket,
): DaemonTransport & { onDisconnect: (handler: DisconnectHandler) => void } {
  const messageHandlers: MessageHandler[] = [];
  const disconnectHandlers: DisconnectHandler[] = [];
  let buffer = '';
  let closed = false;

  socket.setEncoding('utf8');

  socket.on('data', (chunk: string) => {
    if (closed) {
      return;
    }

    buffer += chunk;

    // Guard against runaway payloads
    if (buffer.length > MAX_BUFFER_BYTES) {
      console.error('[SocketTransport] Buffer overflow — closing connection');
      socket.destroy();
      return;
    }

    // Newline-delimited JSON: split on \n, keep incomplete last segment
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const message = JSON.parse(trimmed) as JsonRpcMessage;
        for (const handler of messageHandlers) {
          handler(message);
        }
      } catch {
        console.warn('[SocketTransport] Failed to parse message:', trimmed.slice(0, 100));
      }
    }
  });

  socket.on('close', () => {
    if (!closed) {
      closed = true;
      for (const handler of disconnectHandlers) {
        handler();
      }
    }
  });

  socket.on('error', (err) => {
    console.error('[SocketTransport] Socket error:', err.message);
    if (!closed) {
      closed = true;
      socket.destroy();
      for (const handler of disconnectHandlers) {
        handler();
      }
    }
  });

  return {
    send(message: JsonRpcMessage): void {
      if (closed || socket.destroyed) {
        return;
      }
      const data = JSON.stringify(message) + '\n';
      socket.write(data);
    },

    onMessage(handler: MessageHandler): void {
      messageHandlers.push(handler);
    },

    onDisconnect(handler: DisconnectHandler): void {
      disconnectHandlers.push(handler);
    },

    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      messageHandlers.length = 0;
      disconnectHandlers.length = 0;
      if (!socket.destroyed) {
        socket.destroy();
      }
    },
  };
}
