/**
 * IPC Channel Transport
 *
 * DaemonTransport implementations that use Node.js child_process IPC channels
 * (process.send / child.send) for parent ↔ child communication.
 *
 * This is cross-platform (macOS, Windows, Linux) without sockets or named pipes.
 *
 * ESM module — use .js extensions on imports.
 */

import type { ChildProcess } from 'child_process';
import type { DaemonTransport, JsonRpcMessage } from '../common/types/daemon.js';

/**
 * Envelope for messages sent over the IPC channel.
 * Discriminates daemon RPC messages from other IPC traffic.
 */
interface DaemonIpcEnvelope {
  __daemon: true;
  payload: JsonRpcMessage;
}

function isDaemonEnvelope(msg: unknown): msg is DaemonIpcEnvelope {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    '__daemon' in msg &&
    (msg as DaemonIpcEnvelope).__daemon === true &&
    'payload' in msg
  );
}

/**
 * Transport for the PARENT process (Electron main).
 * Wraps a ChildProcess's IPC channel.
 */
export function createChildProcessTransport(child: ChildProcess): DaemonTransport {
  const handlers: Array<(message: JsonRpcMessage) => void> = [];

  const onMessage = (msg: unknown): void => {
    if (isDaemonEnvelope(msg)) {
      for (const handler of handlers) {
        handler(msg.payload);
      }
    }
  };

  child.on('message', onMessage);

  return {
    send(message: JsonRpcMessage): void {
      if (child.connected) {
        const envelope: DaemonIpcEnvelope = { __daemon: true, payload: message };
        child.send(envelope);
      }
    },
    onMessage(handler: (message: JsonRpcMessage) => void): void {
      handlers.push(handler);
    },
    close(): void {
      child.removeListener('message', onMessage);
      handlers.length = 0;
    },
  };
}

/**
 * Transport for the CHILD process (daemon).
 * Wraps process.send / process.on('message').
 */
export function createParentProcessTransport(): DaemonTransport {
  const handlers: Array<(message: JsonRpcMessage) => void> = [];

  if (!process.send) {
    throw new Error('createParentProcessTransport() must be called in a forked child process');
  }

  const onMessage = (msg: unknown): void => {
    if (isDaemonEnvelope(msg)) {
      for (const handler of handlers) {
        handler(msg.payload);
      }
    }
  };

  process.on('message', onMessage);

  return {
    send(message: JsonRpcMessage): void {
      if (process.send) {
        const envelope: DaemonIpcEnvelope = { __daemon: true, payload: message };
        process.send(envelope);
      }
    },
    onMessage(handler: (message: JsonRpcMessage) => void): void {
      handlers.push(handler);
    },
    close(): void {
      process.removeListener('message', onMessage);
      handlers.length = 0;
    },
  };
}
