/**
 * Browser-safe constants.
 *
 * This module only exports constants that are safe for use in browser/renderer contexts.
 * System constants (ports, logging config) have been moved to src/constants/ and
 * are only exported from the main index.ts entry point.
 */

// Model display constants - safe for browser use
export * from './constants/model-display.js';
