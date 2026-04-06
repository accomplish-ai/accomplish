import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonRpcServer } from '../../../src/daemon/rpc-server.js';
import { DaemonClient } from '../../../src/daemon/client.js';
import { createSocketTransport } from '../../../src/daemon/socket-transport.js';

let tempDir: string;
let server: DaemonRpcServer | null = null;

function createTempSocketPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'daemon-lifecycle-test-'));
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

describe('DaemonClient offNotification', () => {
  it('removes a specific handler so it no longer fires', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });
    await client.ping();

    const received: unknown[] = [];
    const handler = (data: unknown) => {
      received.push(data);
    };

    client.onNotification('task.progress' as never, handler);

    // Send first notification — should be received
    server.notify('task.progress', { taskId: 'tsk-1', stage: 'running' });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1);

    // Remove handler
    client.offNotification('task.progress' as never, handler);

    // Send second notification — should NOT be received
    server.notify('task.progress', { taskId: 'tsk-2', stage: 'done' });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1); // still 1, not 2

    client.close();
  });

  it('only removes the specific handler, not others on the same method', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });
    await client.ping();

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const handlerA = (data: unknown) => receivedA.push(data);
    const handlerB = (data: unknown) => receivedB.push(data);

    client.onNotification('task.progress' as never, handlerA);
    client.onNotification('task.progress' as never, handlerB);

    // Remove only handlerA
    client.offNotification('task.progress' as never, handlerA);

    server.notify('task.progress', { taskId: 'tsk-1' });
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedA).toHaveLength(0); // removed
    expect(receivedB).toHaveLength(1); // still active

    client.close();
  });

  it('is a no-op for unregistered handlers', async () => {
    const socketPath = createTempSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const transport = await createSocketTransport({ socketPath });
    const client = new DaemonClient({ transport });

    // Should not throw
    client.offNotification('task.progress' as never, () => {});

    client.close();
  });
});
