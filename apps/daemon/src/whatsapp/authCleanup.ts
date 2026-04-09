/**
 * authCleanup — WhatsApp auth-state filesystem helpers.
 *
 * Extracted from WhatsAppService for modularity.
 */
import fs from 'fs';
import { log } from '../logger.js';

/**
 * Delete the Baileys multi-file auth state directory at `authStatePath`.
 * Errors are swallowed and logged so callers can always proceed with cleanup.
 */
export function cleanupAuthState(authStatePath: string): void {
  try {
    if (fs.existsSync(authStatePath)) {
      fs.rmSync(authStatePath, { recursive: true, force: true });
    }
  } catch (err) {
    log.error('[WhatsApp] Failed to cleanup auth state:', err);
  }
}
