import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonRpcServer } from '../../../src/daemon/rpc-server.js';
import { DaemonClient } from '../../../src/daemon/client.js';
import { createSocketTransport } from '../../../src/daemon/socket-transport.js';

// Use a temp dir for each test's socket to avoid collisions
let tempDir: string;
let server: DaemonRpcServer | null = null;

function createTempSocketPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'daemon-test-'));
  return join(tempDir, 'test.sock');
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('createSocketTransport', () => {
  it('connects to a DaemonRpcServer and pings', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });

    const result = await client.ping();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');

    client.close();
  });

  it('calls a custom registered method', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    server.registerMethod('echo', (params) => params);
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });

    const result = await client.call('echo' as never, { hello: 'world' } as never);
    expect(result).toEqual({ hello: 'world' });

    client.close();
  });

  it('receives notifications from server', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });

    // Wait for connection to register on server side
    await client.ping();

    const received: unknown[] = [];
    client.onNotification('task.progress' as never, (data: unknown) => {
      received.push(data);
    });

    // Server pushes a notification
    server.notify('task.progress', { taskId: 'tsk-1', stage: 'running' });

    // Give the notification time to arrive
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ taskId: 'tsk-1', stage: 'running' });

    client.close();
  });

  it('rejects when server is not running', async () => {
    const socketPath = createTempSocketPath();

    await expect(createSocketTransport({ socketPath, connectTimeout: 500 })).rejects.toThrow();
  });

  it('calls onDisconnect when server stops', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });
    await client.ping();

    let disconnected = false;
    transport.onDisconnect(() => {
      disconnected = true;
    });

    await server.stop();
    server = null;

    // Wait for close event to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(disconnected).toBe(true);

    client.close();
  });

  it('handles multiple sequential requests', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    let counter = 0;
    server.registerMethod('increment', () => ++counter);
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });

    const r1 = await client.call('increment' as never);
    const r2 = await client.call('increment' as never);
    const r3 = await client.call('increment' as never);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(r3).toBe(3);

    client.close();
  });
});
