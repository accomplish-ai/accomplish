/**
 * Vitest setup file for tests
 * Configures testing-library matchers and global test utilities
 */

import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Load English locale files so renderer tests using useTranslation() get real strings
import common from '../locales/en/common.json';
import settings from '../locales/en/settings.json';
import home from '../locales/en/home.json';
import execution from '../locales/en/execution.json';
import history from '../locales/en/history.json';
import errors from '../locales/en/errors.json';
import sidebar from '../locales/en/sidebar.json';

// Initialize i18next for tests (only when in jsdom environment)
i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'settings', 'home', 'execution', 'history', 'errors', 'sidebar'],
  resources: {
    en: { common, settings, home, execution, history, errors, sidebar },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

expect.extend(matchers);

// Mock scrollIntoView for jsdom (not implemented in jsdom)
// Only apply when running in jsdom environment (Element is defined)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Mock ResizeObserver for jsdom (not implemented, required by Radix UI tooltips)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
