// packages/browser-manager/src/test/scenarios/port-conflict.test.ts
import { describe, it, expect } from 'vitest';
import { PortExhaustedError, findAvailablePorts } from '../../port-finder.js';
import http from 'http';

// High ports unlikely to conflict with system services (59000-59999)
const TEST_PORT_RANGE_1 = { start: 59800, end: 59810 };
const TEST_PORT_RANGE_2 = { start: 59850, end: 59854 };

/**
 * Close an HTTP server and wait for completion
 */
async function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe('Port Conflict Scenarios', () => {
  it('port-finder skips occupied port and returns next available', async () => {
    // Create a dummy server on port 59800
    const server = http.createServer((_, res) => {
      res.writeHead(200);
      res.end('not our server');
    });

    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT_RANGE_1.start, resolve);
    });

    try {
      // Test port-finder directly - verifies the module skips occupied ports
      const ports = await findAvailablePorts({
        portRangeStart: TEST_PORT_RANGE_1.start,
        portRangeEnd: TEST_PORT_RANGE_1.end,
      });

      // Port 59800 is taken, should get 59802 (next pair)
      expect(ports.http).toBe(59802);
      expect(ports.cdp).toBe(59803);
    } finally {
      await closeServer(server);
    }
  });

  it('throws PortExhaustedError when all ports taken', async () => {
    // Create servers on all ports in a tiny range
    const servers: http.Server[] = [];

    for (let port = TEST_PORT_RANGE_2.start; port <= TEST_PORT_RANGE_2.end; port += 2) {
      const server = http.createServer((_, res) => {
        res.writeHead(200);
        res.end('taken');
      });
      await new Promise<void>((resolve) => {
        server.listen(port, resolve);
      });
      servers.push(server);
    }

    try {
      await expect(
        findAvailablePorts({
          portRangeStart: TEST_PORT_RANGE_2.start,
          portRangeEnd: TEST_PORT_RANGE_2.end,
        })
      ).rejects.toThrow(PortExhaustedError);
    } finally {
      // Close all servers and wait for completion
      await Promise.all(servers.map(closeServer));
    }
  });
});
