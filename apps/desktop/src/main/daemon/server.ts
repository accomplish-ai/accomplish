/**
 * Accomplish Daemon Socket Server
 *
 * Listens on a local Unix socket (macOS/Linux) or named pipe (Windows) and
 * accepts JSON-RPC 2.0 commands from external clients (CLI, scheduled tasks,
 * other apps).  This is Step 2 of the incremental daemon migration.
 *
 * Protocol: newline-delimited JSON-RPC 2.0 messages over the socket.
 *
 * Dispatch logic lives in rpc-dispatcher.ts; this module owns the socket
 * lifecycle only.
 */

import net from 'net';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getLogCollector } from '../logging';
import { handleLine, registerMethod as _registerMethod } from './rpc-dispatcher';

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
  // fallback
  // Logger not yet initialized — silently skip
}

export type { MethodHandler } from './rpc-dispatcher';

export interface DaemonRpcMethod {
  'daemon.ping': { params: Record<string, never>; result: { pong: boolean } };
  'daemon.status': {
    params: Record<string, never>;
    result: { running: boolean; version: string; activeTasks: number };
  };
  'daemon.health': {
    params: Record<string, never>;
    result: { version: string; uptime: number; activeTasks: number; memoryUsage: number };
  };
  'task.list': { params: Record<string, never>; result: { tasks: string[] } };
  'task.start': { params: { prompt: string; taskId?: string }; result: { taskId: string } };
  'task.stop': { params: { taskId: string }; result: { ok: boolean } };
  'task.get': { params: { taskId: string }; result: { task: unknown } };
  'task.schedule': {
    params: { cron: string; prompt: string };
    result: { id: string; cron: string; prompt: string; nextRunAt?: string };
  };
  'task.listScheduled': { params: Record<string, never>; result: { schedules: unknown[] } };
  'task.cancelScheduled': { params: { scheduleId: string }; result: { ok: boolean } };
}

export type DaemonMethod = keyof DaemonRpcMethod;

/** Maximum accepted payload per socket connection (1 MB). */
const MAX_SOCKET_BUFFER_BYTES = 1_048_576;

let server: net.Server | null = null;

export { _registerMethod as registerMethod };

export function getSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\accomplish-daemon';
  }
  return path.join(app.getPath('userData'), 'daemon.sock');
}

export function startDaemonServer(): void {
  if (server) {
    return;
  }

  const socketPath = getSocketPath();

  // Remove stale socket file on unix
  if (process.platform !== 'win32') {
    try {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    } catch (err) {
      safeLog('WARN', 'Failed to remove stale socket file', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Guard against runaway payloads
      if (Buffer.byteLength(buffer, 'utf8') > MAX_SOCKET_BUFFER_BYTES) {
        safeLog('WARN', 'Socket buffer overflow — destroying connection');
        socket.destroy(new Error('Buffer overflow — payload too large'));
        return;
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          handleLine(trimmed, (response) => socket.write(response));
        }
      }
    });

    socket.on('end', () => {
      const trimmed = buffer.trim();
      if (trimmed) {
        handleLine(trimmed, (response) => socket.write(response));
      }
      buffer = '';
    });

    socket.on('error', (err) => {
      safeLog('ERROR', 'Socket error', { error: err.message });
    });
  });

  server.on('error', (err) => {
    safeLog('ERROR', 'Server error', { error: err.message });
    if (server && !server.listening) {
      server = null;
    }
  });

  server.listen(socketPath, () => {
    safeLog('INFO', `Socket server listening at ${socketPath}`);
    // Ensure only the owner can connect on unix
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch (err) {
        safeLog('WARN', 'Failed to chmod socket', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

export function stopDaemonServer(): void {
  if (!server) {
    return;
  }
  server.close();
  server = null;

  const socketPath = getSocketPath();
  if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      safeLog('WARN', 'Failed to remove socket file', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  safeLog('INFO', 'Socket server stopped');
}
