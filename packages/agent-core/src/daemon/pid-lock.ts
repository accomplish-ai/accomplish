import {
  openSync,
  closeSync,
  writeSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
  linkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getPidFilePath } from './socket-path.js';

export interface PidLockPayload {
  pid: number;
  createdAt: string;
  startTime: number;
}

export interface PidLockHandle {
  pidPath: string;
  release: () => void;
}

export class PidLockError extends Error {
  constructor(
    message: string,
    public readonly existingPid?: number,
  ) {
    super(message);
    this.name = 'PidLockError';
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPayload(pidPath: string): PidLockPayload | null {
  try {
    const raw = readFileSync(pidPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PidLockPayload>;
    if (typeof parsed.pid !== 'number' || typeof parsed.createdAt !== 'string') {
      return null;
    }
    return {
      pid: parsed.pid,
      createdAt: parsed.createdAt,
      startTime: typeof parsed.startTime === 'number' ? parsed.startTime : 0,
    };
  } catch {
    return null;
  }
}

function isLockStale(payload: PidLockPayload | null): boolean {
  if (payload) {
    return !isPidAlive(payload.pid);
  }

  // Unparseable lock file — treat as stale
  return true;
}

function writeTempLockFile(dir: string, payload: PidLockPayload): string {
  const suffix = randomBytes(6).toString('hex');
  const tmpPath = join(dir, `.pid-lock-${process.pid}-${suffix}.tmp`);
  const fd = openSync(tmpPath, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify(payload), 0, 'utf-8');
  } finally {
    closeSync(fd);
  }
  return tmpPath;
}

function cleanupTempFile(tmpPath: string): void {
  try {
    unlinkSync(tmpPath);
  } catch {
    // Temp file may already be removed
  }
}

export function acquirePidLock(pidPath?: string): PidLockHandle {
  const resolvedPath = pidPath ?? getPidFilePath();
  const dir = dirname(resolvedPath);
  mkdirSync(dir, { recursive: true });

  const payload: PidLockPayload = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    startTime: Date.now(),
  };

  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tmpPath = writeTempLockFile(dir, payload);

    try {
      linkSync(tmpPath, resolvedPath);
    } catch (err) {
      cleanupTempFile(tmpPath);

      const code = (err as { code?: string }).code;
      if (code !== 'EEXIST') {
        throw new PidLockError(`Failed to acquire PID lock at ${resolvedPath}: ${String(err)}`);
      }

      const existingPayload = readLockPayload(resolvedPath);
      if (isLockStale(existingPayload)) {
        try {
          unlinkSync(resolvedPath);
        } catch {
          // Another process may have already removed it
        }
        continue;
      }

      throw new PidLockError(
        `Daemon already running (pid ${existingPayload?.pid ?? 'unknown'})`,
        existingPayload?.pid,
      );
    }

    cleanupTempFile(tmpPath);

    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      try {
        unlinkSync(resolvedPath);
      } catch {
        // File may already be removed
      }
    };

    return { pidPath: resolvedPath, release };
  }

  throw new PidLockError(`Failed to acquire PID lock after removing stale lock at ${resolvedPath}`);
}
