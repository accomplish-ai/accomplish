import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import net from 'net';
import os from 'os';
import { sendJsonRpc, sendRawLine, SERVER_READY_WAIT } from './helpers/server.helpers';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

import {
  startDaemonServer,
  stopDaemonServer,
  registerMethod,
  getSocketPath,
} from '@main/daemon/server';

describe('daemon/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopDaemonServer();
  });

  it('getSocketPath returns a valid socket path', () => {
    const socketPath = getSocketPath();
    if (process.platform === 'win32') {
      expect(socketPath).toContain('pipe');
    } else {
      expect(socketPath).toContain('daemon.sock');
    }
  });

  it.skipIf(process.platform === 'win32')(
    'registerMethod stores and dispatches handlers',
    async () => {
      const handler = vi.fn(() => ({ hello: 'world' }));
      registerMethod('test.echo', handler);

      startDaemonServer();
      const socketPath = getSocketPath();

      // Wait for server to be ready
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

      const response = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'test.echo',
        params: {},
      });

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: { hello: 'world' },
      });
      expect(handler).toHaveBeenCalledOnce();
    },
  );

  it.skipIf(process.platform === 'win32')(
    'returns method-not-found for unknown methods',
    async () => {
      startDaemonServer();
      const socketPath = getSocketPath();
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

      const response = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'nonexistent',
        params: {},
      });

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32601,
          message: 'Method not found: nonexistent',
        },
      });
    },
  );

  it.skipIf(process.platform === 'win32')('returns parse error for invalid JSON', async () => {
    startDaemonServer();
    const socketPath = getSocketPath();
    await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

    const response = await sendRawLine(socketPath, 'not valid json');

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });

  it.skipIf(process.platform === 'win32')(
    'does not respond to JSON-RPC notifications (no id)',
    async () => {
      const handler = vi.fn(() => ({ ok: true }));
      registerMethod('test.notify', handler);

      startDaemonServer();
      const socketPath = getSocketPath();
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

      // Send a notification (no id field) - should get no response
      const gotResponse = await new Promise<boolean>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.write(
            JSON.stringify({ jsonrpc: '2.0', method: 'test.notify', params: {} }) + '\n',
          );
        });

        const timeout = setTimeout(() => {
          client.destroy();
          resolve(false); // No response received - correct behavior
        }, 500);

        client.on('data', () => {
          clearTimeout(timeout);
          client.destroy();
          resolve(true); // Got unexpected response
        });

        client.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      expect(gotResponse).toBe(false);
      expect(handler).toHaveBeenCalledOnce();
    },
  );

  it.skipIf(process.platform === 'win32')('handles async method handlers', async () => {
    registerMethod('test.async', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { delayed: true };
    });

    startDaemonServer();
    const socketPath = getSocketPath();
    await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

    const response = await sendJsonRpc(socketPath, {
      jsonrpc: '2.0',
      id: 3,
      method: 'test.async',
      params: {},
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: { delayed: true },
    });
  });

  it.skipIf(process.platform === 'win32')(
    'returns internal error when handler throws',
    async () => {
      registerMethod('test.fail', () => {
        throw new Error('handler exploded');
      });

      startDaemonServer();
      const socketPath = getSocketPath();
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_WAIT));

      const response = await sendJsonRpc(socketPath, {
        jsonrpc: '2.0',
        id: 4,
        method: 'test.fail',
        params: {},
      });

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 4,
        error: {
          code: -32603,
          message: 'Internal error',
          data: { reason: 'internal' },
        },
      });
    },
  );

  it('startDaemonServer is idempotent', () => {
    startDaemonServer();
    startDaemonServer(); // Should not throw
    stopDaemonServer();
  });

  it('stopDaemonServer is idempotent', () => {
    stopDaemonServer(); // Should not throw even if not started
  });
});
