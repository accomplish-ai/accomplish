import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DAEMON_DIR_NAME = '.accomplish';
const SOCKET_FILE_NAME = 'daemon.sock';
const PID_FILE_NAME = 'daemon.pid';
const WINDOWS_PIPE_NAME = 'accomplish-daemon';

export function getDaemonDir(): string {
  return join(homedir(), DAEMON_DIR_NAME);
}

export function getSocketPath(): string {
  if (platform() === 'win32') {
    return `\\\\.\\pipe\\${WINDOWS_PIPE_NAME}`;
  }
  return join(getDaemonDir(), SOCKET_FILE_NAME);
}

export function getPidFilePath(): string {
  return join(getDaemonDir(), PID_FILE_NAME);
}
