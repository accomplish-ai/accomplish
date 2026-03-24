import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface OpenCodeLogError {
  timestamp: string;
  service: string;
  providerID?: string;
  modelID?: string;
  sessionID?: string;
  errorName: string;
  statusCode?: number;
  message?: string;
  raw: string;
  isAuthError?: boolean;
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray, line: string) => Partial<OpenCodeLogError>;
}> = [
  {
    pattern:
      /openai.*(?:invalid_api_key|invalid_token|token.*expired|oauth.*invalid|Incorrect API key)/i,
    extract: () => ({
      errorName: 'OAuthExpiredError',
      statusCode: 401,
      message: 'Your OpenAI session has expired. Please re-authenticate.',
      providerID: 'openai',
      isAuthError: true,
    }),
  },
  {
    pattern: /openai.*"status":\s*401|"status":\s*401.*openai|providerID=openai.*statusCode.*401/i,
    extract: () => ({
      errorName: 'OAuthUnauthorizedError',
      statusCode: 401,
      message: 'Your OpenAI session has expired. Please re-authenticate.',
      providerID: 'openai',
      isAuthError: true,
    }),
  },
  {
    pattern: /openai.*authentication.*failed|authentication.*failed.*openai/i,
    extract: () => ({
      errorName: 'OAuthAuthenticationError',
      statusCode: 401,
      message: 'OpenAI authentication failed. Please re-authenticate.',
      providerID: 'openai',
      isAuthError: true,
    }),
  },
  {
    pattern: /ThrottlingException.*?"message":"([^"]+)"/,
    extract: (match) => ({
      errorName: 'ThrottlingException',
      statusCode: 429,
      message: match[1] || 'Rate limit exceeded. Please wait before trying again.',
    }),
  },
  {
    pattern: /"name":"AI_APICallError".*?"statusCode":(\d+).*?"message":"([^"]+)"/,
    extract: (match) => ({
      errorName: 'AI_APICallError',
      statusCode: parseInt(match[1], 10),
      message: match[2],
    }),
  },
  {
    pattern: /"name":"AI_APICallError".*?"statusCode":(\d+)/,
    extract: (match) => ({
      errorName: 'AI_APICallError',
      statusCode: parseInt(match[1], 10),
      message: `API call failed with status ${match[1]}`,
    }),
  },
  {
    pattern: /AccessDeniedException|UnauthorizedException|InvalidSignatureException/,
    extract: () => ({
      errorName: 'AuthenticationError',
      statusCode: 403,
      message: 'Authentication failed. Please check your credentials.',
    }),
  },
  {
    pattern: /ModelNotFoundError|ResourceNotFoundException.*model/i,
    extract: () => ({
      errorName: 'ModelNotFoundError',
      statusCode: 404,
      message: 'The requested model was not found or is not available in your region.',
    }),
  },
  {
    pattern: /ValidationException.*?"message":"([^"]+)"/,
    extract: (match) => ({
      errorName: 'ValidationError',
      statusCode: 400,
      message: match[1] || 'Invalid request parameters.',
    }),
  },
];

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
      console.warn('[LogWatcher] Could not watch log directory:', err);
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

      console.log('[LogWatcher] Watching log file:', latestLog);
    } catch (err) {
      console.warn('[LogWatcher] Error finding latest log:', err);
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
          errorName: errorInfo.errorName || 'UnknownError',
          statusCode: errorInfo.statusCode,
          message: errorInfo.message,
          raw: line,
        };

        console.log('[LogWatcher] Detected error:', error.errorName, error.message);
        this.emit('error', error);
        return;
      }
    }
  }

  static getErrorMessage(error: OpenCodeLogError): string {
    switch (error.errorName) {
      case 'OAuthExpiredError':
      case 'OAuthUnauthorizedError':
      case 'OAuthAuthenticationError':
        return error.message || 'Your session has expired. Please re-authenticate.';
      case 'ThrottlingException':
        return `Rate limit exceeded: ${error.message || 'Please wait before trying again.'}`;
      case 'AuthenticationError':
        return 'Authentication failed. Please check your API credentials in Settings.';
      case 'ModelNotFoundError':
        return `Model not available: ${error.modelID || 'unknown'}. Please select a different model.`;
      case 'ValidationError':
        return `Invalid request: ${error.message}`;
      case 'AI_APICallError':
        if (error.statusCode === 429) {
          return `Rate limit exceeded: ${error.message || 'Please wait before trying again.'}`;
        }
        if (error.statusCode === 503) {
          return 'Service temporarily unavailable. Please try again later.';
        }
        return `API error (${error.statusCode}): ${error.message || 'Unknown error'}`;
      default:
        return error.message || `Error: ${error.errorName}`;
    }
  }
}

export function createLogWatcher(logDir?: string): OpenCodeLogWatcher {
  return new OpenCodeLogWatcher(logDir);
}
