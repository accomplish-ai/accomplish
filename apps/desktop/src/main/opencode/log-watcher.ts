import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Parsed error from OpenCode logs
 */
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
  /** True if this is an authentication error that requires re-login */
  isAuthError?: boolean;
}

/**
 * Known error patterns and their user-friendly messages
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray, line: string) => Partial<OpenCodeLogError>;
}> = [
  {
    // OpenAI OAuth token expired/invalid
    pattern: /openai.*(?:invalid_api_key|invalid_token|token.*expired|oauth.*invalid|Incorrect API key)/i,
    extract: () => ({
      errorName: 'OAuthExpiredError',
      statusCode: 401,
      message: 'Your OpenAI session has expired. Please re-authenticate.',
      providerID: 'openai',
      isAuthError: true,
    }),
  },
  {
    // OpenAI 401 Unauthorized
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
    // OpenAI authentication failed
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
    // AWS Bedrock throttling error
    pattern: /ThrottlingException.*?"message":"([^"]+)"/,
    extract: (match) => ({
      errorName: 'ThrottlingException',
      statusCode: 429,
      message: match[1] || 'Rate limit exceeded. Please wait before trying again.',
    }),
  },
  {
    // Generic AI_APICallError with status code
    pattern: /"name":"AI_APICallError".*?"statusCode":(\d+).*?"message":"([^"]+)"/,
    extract: (match) => ({
      errorName: 'AI_APICallError',
      statusCode: parseInt(match[1], 10),
      message: match[2],
    }),
  },
  {
    // AI_APICallError without detailed message (fallback)
    pattern: /"name":"AI_APICallError".*?"statusCode":(\d+)/,
    extract: (match) => ({
      errorName: 'AI_APICallError',
      statusCode: parseInt(match[1], 10),
      message: `API call failed with status ${match[1]}`,
    }),
  },
  {
    // Access denied / authentication errors
    pattern: /AccessDeniedException|UnauthorizedException|InvalidSignatureException/,
    extract: () => ({
      errorName: 'AuthenticationError',
      statusCode: 403,
      message: 'Authentication failed. Please check your credentials.',
    }),
  },
  {
    // Model not found
    pattern: /ModelNotFoundError|ResourceNotFoundException.*model/i,
    extract: () => ({
      errorName: 'ModelNotFoundError',
      statusCode: 404,
      message: 'The requested model was not found or is not available in your region.',
    }),
  },
  {
    // Validation errors
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

/**
 * Watches OpenCode CLI log files for errors.
 * The CLI writes logs to ~/.local/share/opencode/log/ but doesn't output
 * errors as JSON to stdout, so we need to monitor the log files directly.
 */
export class OpenCodeLogWatcher extends EventEmitter<LogWatcherEvents> {
  private logDir: string;
  private watcher: fs.FSWatcher | null = null;
  private currentLogFile: string | null = null;
  private fileHandle: fs.promises.FileHandle | null = null;
  private readPosition: number = 0;
  private isWatching: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private seenErrors: Set<string> = new Set();

  constructor() {
    super();
    // OpenCode stores logs in ~/.local/share/opencode/log/
    this.logDir = path.join(os.homedir(), '.local', 'share', 'opencode', 'log');
  }

  /**
   * Start watching for errors in the most recent log file
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;
    this.seenErrors.clear();

    // Find the most recent log file
    await this.findAndWatchLatestLog();

    // Poll for new content every 500ms
    this.pollInterval = setInterval(() => {
      this.readNewContent();
    }, 500);

    // Watch for new log files being created
    try {
      this.watcher = fs.watch(this.logDir, (eventType, filename) => {
        if (eventType === 'rename' && filename?.endsWith('.log')) {
          // A new log file was created, switch to it
          this.findAndWatchLatestLog();
        }
      });
    } catch (err) {
      console.warn('[LogWatcher] Could not watch log directory:', err);
    }
  }

  /**
   * Stop watching
   */
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

  /**
   * Find and start watching the most recent log file
   */
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

      // If we're already watching this file, don't restart
      if (latestLog === this.currentLogFile) {
        return;
      }

      // Close previous file handle
      if (this.fileHandle) {
        await this.fileHandle.close();
      }

      this.currentLogFile = latestLog;

      // Open file and seek to end (we only care about new errors)
      this.fileHandle = await fs.promises.open(latestLog, 'r');
      const stat = await this.fileHandle.stat();
      this.readPosition = stat.size;

      console.log('[LogWatcher] Watching log file:', latestLog);
    } catch (err) {
      console.warn('[LogWatcher] Error finding latest log:', err);
    }
  }

  /**
   * Read new content from the log file
   */
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
      const { bytesRead } = await this.fileHandle.read(
        buffer,
        0,
        bufferSize,
        this.readPosition
      );

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
      // File might have been rotated, try to find new log
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.findAndWatchLatestLog();
      }
    }
  }

  /**
   * Parse a log line for errors
   */
  private parseLine(line: string): void {
    // Only process ERROR lines
    if (!line.includes('ERROR')) {
      return;
    }

    // Extract timestamp and basic info
    const timestampMatch = line.match(/^(\w+)\s+(\S+)\s+(\+\d+ms)/);
    const serviceMatch = line.match(/service=(\S+)/);
    const providerMatch = line.match(/providerID=(\S+)/);
    const modelMatch = line.match(/modelID=(\S+)/);
    const sessionMatch = line.match(/sessionID=(\S+)/);

    // Try to match known error patterns
    for (const { pattern, extract } of ERROR_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const errorInfo = extract(match, line);

        // Create a unique key for deduplication
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

  /**
   * Get a user-friendly error message
   */
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

/**
 * Create a log watcher instance
 */
export function createLogWatcher(): OpenCodeLogWatcher {
  return new OpenCodeLogWatcher();
}
