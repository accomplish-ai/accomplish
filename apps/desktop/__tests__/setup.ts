/**
 * Vitest setup file for tests
 * Configures testing-library matchers and global test utilities
 */

import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Mock scrollIntoView for jsdom (not implemented in jsdom)
// Only apply when running in jsdom environment (Element is defined)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Mock better-sqlite3 native module (not available in test environment)
// This prevents the native module from being loaded, which would fail in CI
vi.mock('better-sqlite3', () => {
  // Create a mock database class that can be instantiated with `new`
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

// Extend global types for test utilities
declare global {
  // Add any global test utilities here if needed
}

export {};
