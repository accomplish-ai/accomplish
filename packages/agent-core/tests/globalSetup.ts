/**
 * Vitest global setup — runs once in the main process before any test workers start.
 *
 * Handles two recurring environment issues:
 *
 * 1. Port 9228 left bound from a previous interrupted test run (azure-foundry-proxy tests).
 *    We kill any process holding that port so the proxy tests can bind it cleanly.
 *
 * 2. better-sqlite3 ABI mismatch (NODE_MODULE_VERSION).
 *    If the native module was compiled for a different Node.js version we emit a
 *    clear warning and set SKIP_SQLITE_TESTS=1 so test files can skip gracefully.
 */

import { execSync } from 'child_process';

export async function setup(): Promise<void> {
  checkNodeVersion();
  freePort(9228);
  await checkSqlite();
}

function checkNodeVersion(): void {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) {
    process.env.SKIP_NODE22_TESTS = '1';
    console.warn(
      `\n[globalSetup] WARNING: Node.js ${process.versions.node} detected. ` +
        'This project requires Node.js >=22.0.0. ' +
        'Tests that depend on Node 22 APIs (undici 8.x, etc.) will be skipped.\n' +
        'To fix: upgrade to Node.js 22 via nvm or similar.\n',
    );
  }
}

function freePort(port: number): void {
  try {
    if (process.platform === 'win32') {
      // Windows: find and kill the process holding the port
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pid = out.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, { shell: true });
    }
  } catch {
    // Port not in use or command unavailable — nothing to do
  }
}

async function checkSqlite(): Promise<void> {
  try {
    const mod = await import('better-sqlite3');
    const Db = (mod as { default: new (path: string) => { close(): void } }).default;
    const probe = new Db(':memory:');
    probe.close();
  } catch {
    process.env.SKIP_SQLITE_TESTS = '1';
    console.warn(
      '\n[globalSetup] WARNING: better-sqlite3 native module could not be instantiated ' +
        '(NODE_MODULE_VERSION mismatch). SQLite-dependent tests will be skipped.\n' +
        'To fix: pnpm install --force\n',
    );
  }
}
