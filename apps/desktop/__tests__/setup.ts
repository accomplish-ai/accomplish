/**
 * Vitest setup file for tests
 * Configures testing-library matchers and global test utilities
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { vi } from 'vitest';

// Automatically cleanup after each test to prevent element accumulation
// This is required for happy-dom environment in vitest
afterEach(() => {
  cleanup();
});

// Mock DOM APIs not implemented in happy-dom/jsdom
// Only apply when running in browser-like environment (Element is defined)
if (typeof Element !== 'undefined') {
  // Mock scrollIntoView (not implemented in jsdom/happy-dom)
  Element.prototype.scrollIntoView = () => {};

  // Mock getAnimations (Web Animations API, not implemented in happy-dom)
  // Required for @base-ui/react ScrollAreaViewport
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
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
