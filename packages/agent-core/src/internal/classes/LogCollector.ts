import { type LogLevel, type LogSource } from '../../common/types/logging.js';
import { detectLogSource } from '../../common/utils/log-source-detector.js';

interface InternalLogFileWriter {
  initialize(): void;
  write(level: LogLevel, source: LogSource, message: string): void;
  flush(): void;
  getCurrentLogPath(): string;
  getLogDir(): string;
  shutdown(): void;
}

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

export class LogCollector {
  private initialized = false;

  constructor(private writer: InternalLogFileWriter) {}

  initialize(): void {
    if (this.initialized) return;

    this.writer.initialize();

    // Wrap original console calls in try-catch to handle EIO errors when stdout is unavailable
    // (e.g., when terminal is closed or during app shutdown)
    console.log = (...args: unknown[]) => {
      try {
        originalConsole.log(...args);
      } catch {}
      this.captureConsole('INFO', args);
    };

    console.warn = (...args: unknown[]) => {
      try {
        originalConsole.warn(...args);
      } catch {}
      this.captureConsole('WARN', args);
    };

    console.error = (...args: unknown[]) => {
      try {
        originalConsole.error(...args);
      } catch {}
      this.captureConsole('ERROR', args);
    };

    console.debug = (...args: unknown[]) => {
      try {
        originalConsole.debug(...args);
      } catch {}
      this.captureConsole('DEBUG', args);
    };

    this.initialized = true;

    this.log('INFO', 'main', 'LogCollector initialized');
  }

  log(level: LogLevel, source: LogSource, message: string, data?: unknown): void {
    let fullMessage = message;
    if (data !== undefined) {
      try {
        fullMessage += ' ' + JSON.stringify(data);
      } catch {
        fullMessage += ' [unserializable data]';
      }
    }

    this.writer.write(level, source, fullMessage);
  }

  logMcp(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'mcp', message, data);
  }

  logBrowser(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'browser', message, data);
  }

  logOpenCode(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'opencode', message, data);
  }

  logEnv(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'env', message, data);
  }

  logIpc(level: LogLevel, message: string, data?: unknown): void {
    this.log(level, 'ipc', message, data);
  }

  getCurrentLogPath(): string {
    return this.writer.getCurrentLogPath();
  }

  getLogDir(): string {
    return this.writer.getLogDir();
  }

  flush(): void {
    this.writer.flush();
  }

  shutdown(): void {
    if (!this.initialized) return;

    this.log('INFO', 'main', 'LogCollector shutting down');

    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;

    this.writer.shutdown();
    this.initialized = false;
  }

  private captureConsole(level: LogLevel, args: unknown[]): void {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const source = detectLogSource(message);
    this.writer.write(level, source, message);
  }
}
