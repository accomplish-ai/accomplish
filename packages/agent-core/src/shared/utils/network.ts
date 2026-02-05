import * as net from 'net';

/**
 * Checks if a port is currently in use.
 * @param port - The port number to check
 * @returns Promise that resolves to true if port is in use, false otherwise
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE');
    });

    server.once('listening', () => {
      server.close();
      resolve(false);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Waits for a port to be released/available.
 * @param port - The port number to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise that resolves when port is free or rejects on timeout
 */
export async function waitForPortRelease(
  port: number,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeoutMs) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Port ${port} still in use after ${timeoutMs}ms`);
}
