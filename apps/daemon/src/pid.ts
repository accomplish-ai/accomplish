import fs from 'fs';
import path from 'path';
import os from 'os';

const PID_DIR = path.join(os.homedir(), '.accomplish');
const PID_FILE = path.join(PID_DIR, 'daemon.pid');

/**
 * Check if a process with the given PID is still running.
 * process.kill(pid, 0) throws ESRCH if the process doesn't exist,
 * or EPERM if it exists but we lack permission (still means it's running).
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Check if another daemon instance is already running.
 * Returns the PID if running, null otherwise.
 * Cleans up stale PID files automatically.
 */
export function checkExistingDaemon(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;

  const raw = fs.readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(raw, 10);

  if (isNaN(pid)) {
    removePidFile();
    return null;
  }

  if (!isProcessRunning(pid)) {
    console.log(`[Daemon] Removing stale PID file (pid ${pid} not running)`);
    removePidFile();
    return null;
  }

  return pid;
}

/**
 * Write the current process PID to the PID file.
 */
export function writePidFile(): void {
  fs.mkdirSync(PID_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
  console.log(`[Daemon] PID file written: ${PID_FILE} (pid ${process.pid})`);
}

/**
 * Remove the PID file if it exists.
 */
export function removePidFile(): void {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
    console.log('[Daemon] PID file removed');
  }
}

export function getPidFilePath(): string {
  return PID_FILE;
}
