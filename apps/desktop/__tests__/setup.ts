/**
 * Vitest setup file for desktop tests (main process + preload only)
 */

import { vi } from 'vitest';

// Mock the logging module so handlers that call getLogCollector() don't require
// a real Electron app.getPath() or agent-core createLogWriter during unit tests.
vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    write: vi.fn(),
    logEnv: vi.fn(),
    flush: vi.fn(),
    getCurrentLogPath: vi.fn(() => '/mock/logs/app.log'),
    getLogDir: vi.fn(() => '/mock/logs'),
    initialize: vi.fn(),
    shutdown: vi.fn(),
  })),
  getLogFileWriter: vi.fn(() => ({
    write: vi.fn(),
    initialize: vi.fn(),
    shutdown: vi.fn(),
  })),
  initializeLogCollector: vi.fn(),
  shutdownLogCollector: vi.fn(),
  initializeLogFileWriter: vi.fn(),
  shutdownLogFileWriter: vi.fn(),
}));

// Mock better-sqlite3 native module (not available in test environment)
vi.mock('better-sqlite3', () => {
  class MockDatabase {
    pragma = vi.fn().mockReturnThis();
    prepare = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([]),
    });
    exec = vi.fn();
    transaction = vi.fn((fn: () => unknown) => () => fn());
    close = vi.fn();
  }

  return {
    default: MockDatabase,
  };
});

export {};
