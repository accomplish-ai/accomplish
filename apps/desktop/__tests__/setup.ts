/**
 * Vitest setup file for tests
 * Configures testing-library matchers and global test utilities
 */

import '@testing-library/jest-dom/vitest';

// Mock scrollIntoView for jsdom (not implemented in jsdom)
// Only apply when running in jsdom environment (Element is defined)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Extend global types for test utilities
declare global {
  // Add any global test utilities here if needed
}

export {};
