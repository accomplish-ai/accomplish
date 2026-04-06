import { createHash } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DAEMON_DIR_NAME = '.accomplish';
const SOCKET_FILE_NAME = 'daemon.sock';
const PID_FILE_NAME = 'daemon.pid';
const WINDOWS_PIPE_BASE = 'accomplish-daemon';

/**
 * Default daemon directory when no dataDir is provided.
 * Used for dev/standalone mode only.
 */
export function getDaemonDir(): string {
  return join(homedir(), DAEMON_DIR_NAME);
}

/**
 * Get the socket path for daemon IPC.
 *
 * When `dataDir` is provided, the socket is scoped to that directory so
 * multiple profiles (dev/prod, different users) never collide.
 * On Windows, named pipes are kernel-level objects, so we hash the dataDir
 * to create a unique pipe name.
 *
 * @param dataDir — Explicit data directory. Falls back to `~/.accomplish`.
 */
export function getSocketPath(dataDir?: string): string {
  const dir = dataDir ?? getDaemonDir();
  if (platform() === 'win32') {
    // Windows named pipes don't live in the filesystem — namespace by hashing dataDir.
    const hash = createHash('sha256').update(dir).digest('hex').slice(0, 12);
    return `\\\\.\\pipe\\${WINDOWS_PIPE_BASE}-${hash}`;
  }
  return join(dir, SOCKET_FILE_NAME);
}

/**
 * Get the PID lock file path.
 *
 * @param dataDir — Explicit data directory. Falls back to `~/.accomplish`.
 */
export function getPidFilePath(dataDir?: string): string {
  const dir = dataDir ?? getDaemonDir();
  return join(dir, PID_FILE_NAME);
}
