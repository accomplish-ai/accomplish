import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createConsoleLogger } from '../../utils/logging.js';
import { ERROR_PATTERNS, getErrorMessage } from './log-error-patterns.js';
import type { OpenCodeLogError } from './log-error-patterns.js';

export type { OpenCodeLogError } from './log-error-patterns.js';

const log = createConsoleLogger({ prefix: 'LogWatcher' });

export interface LogWatcherEvents {
  error: [OpenCodeLogError];
  'log-line': [string];
}

export class OpenCodeLogWatcher extends EventEmitter<LogWatcherEvents> {
  private logDir: string;
  private watcher: fs.FSWatcher | null = null;
  private currentLogFile: string | null = null;
  private fileHandle: fs.promises.FileHandle | null = null;
  private readPosition: number = 0;
  private isWatching: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private seenErrors: Set<string> = new Set();

  constructor(logDir?: string) {
    super();
    this.logDir = logDir || path.join(os.homedir(), '.local', 'share', 'opencode', 'log');
  }

  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.seenErrors.clear();

    await this.findAndWatchLatestLog();

    this.pollInterval = setInterval(() => {
      this.readNewContent();
    }, 500);

    try {
      this.watcher = fs.watch(this.logDir, (eventType, filename) => {
        if (eventType === 'rename' && filename?.endsWith('.log')) {
          this.findAndWatchLatestLog();
        }
      });
    } catch (err) {
      log.warn('[LogWatcher] Could not watch log directory:', { error: String(err) });
    }
  }

  async stop(): Promise<void> {
    this.isWatching = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }

    this.currentLogFile = null;
    this.readPosition = 0;
    this.seenErrors.clear();
  }

  private async findAndWatchLatestLog(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.logDir);
      const logFiles = files
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse();

      if (logFiles.length === 0) {
        return;
      }

      const latestLog = path.join(this.logDir, logFiles[0]);

      if (latestLog === this.currentLogFile) {
        return;
      }

      if (this.fileHandle) {
        await this.fileHandle.close();
      }

      this.currentLogFile = latestLog;

      this.fileHandle = await fs.promises.open(latestLog, 'r');
      const stat = await this.fileHandle.stat();
      this.readPosition = stat.size;

      log.info(`[LogWatcher] Watching log file: ${latestLog}`);
    } catch (err) {
      log.warn('[LogWatcher] Error finding latest log:', { error: String(err) });
    }
  }

  private async readNewContent(): Promise<void> {
    if (!this.fileHandle || !this.isWatching) {
      return;
    }

    try {
      const stat = await this.fileHandle.stat();
      if (stat.size <= this.readPosition) {
        return;
      }

      const bufferSize = stat.size - this.readPosition;
      const buffer = Buffer.alloc(bufferSize);
      const { bytesRead } = await this.fileHandle.read(buffer, 0, bufferSize, this.readPosition);

      this.readPosition += bytesRead;

      const content = buffer.toString('utf-8', 0, bytesRead);
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          this.emit('log-line', line);
          this.parseLine(line);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.findAndWatchLatestLog();
      }
    }
  }

  private parseLine(line: string): void {
    if (!line.includes('ERROR')) {
      return;
    }

    const timestampMatch = line.match(/^(\w+)\s+(\S+)\s+(\+\d+ms)/);
    const serviceMatch = line.match(/service=(\S+)/);
    const providerMatch = line.match(/providerID=(\S+)/);
    const modelMatch = line.match(/modelID=(\S+)/);
    const sessionMatch = line.match(/sessionID=(\S+)/);

    for (const { pattern, extract } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const errorInfo = extract(match, line);

        const errorKey = `${errorInfo.errorName}:${errorInfo.statusCode}:${sessionMatch?.[1] || ''}`;
        if (this.seenErrors.has(errorKey)) {
          continue;
        }
        this.seenErrors.add(errorKey);

        const error: OpenCodeLogError = {
          timestamp: timestampMatch?.[2] || new Date().toISOString(),
          service: serviceMatch?.[1] || 'unknown',
          providerID: providerMatch?.[1],
          modelID: modelMatch?.[1],
          sessionID: sessionMatch?.[1],
          raw: line,
          ...errorInfo,
          errorName: errorInfo.errorName || 'UnknownError',
          message: errorInfo.message || 'Unknown error occurred',
          statusCode: errorInfo.statusCode || 500,
        };

        log.info(`[LogWatcher] Detected error: ${error.errorName} ${error.message}`);
        this.emit('error', error);
        return;
      }
    }
  }

  static getErrorMessage(error: OpenCodeLogError): string {
    return getErrorMessage(error);
  }
}

export function createLogWatcher(logDir?: string): OpenCodeLogWatcher {
  return new OpenCodeLogWatcher(logDir);
}
