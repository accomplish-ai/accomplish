/**
 * In-Process Transport
 *
 * A DaemonTransport implementation that passes messages directly
 * between server and client within the same process via callbacks.
 * This is the Step 2 transport — no sockets, no serialization overhead.
 *
 * In Step 3, this will be swapped for a socket-based transport.
 */

import type { DaemonTransport, JsonRpcMessage } from '../common/types/daemon.js';

type MessageHandler = (message: JsonRpcMessage) => void;

/**
 * Creates a pair of linked in-process transports.
 * Messages sent on one side are received on the other.
 */
export function createInProcessTransportPair(): {
  serverTransport: DaemonTransport;
  clientTransport: DaemonTransport;
} {
  const serverHandlers: MessageHandler[] = [];
  const clientHandlers: MessageHandler[] = [];
  let closed = false;

  const serverTransport: DaemonTransport = {
    send(message: JsonRpcMessage): void {
      if (closed) {
        return;
      }
      for (const handler of clientHandlers) {
        handler(message);
      }
    },
    onMessage(handler: MessageHandler): void {
      serverHandlers.push(handler);
    },
    close(): void {
      closed = true;
      serverHandlers.length = 0;
      clientHandlers.length = 0;
    },
  };

  const clientTransport: DaemonTransport = {
    send(message: JsonRpcMessage): void {
      if (closed) {
        return;
      }
      for (const handler of serverHandlers) {
        handler(message);
      }
    },
    onMessage(handler: MessageHandler): void {
      clientHandlers.push(handler);
    },
    close(): void {
      closed = true;
      serverHandlers.length = 0;
      clientHandlers.length = 0;
    },
  };

  return { serverTransport, clientTransport };
}
