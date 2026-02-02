/**
 * Auth Sync Module
 *
 * Synchronizes API keys from Openwork's secure storage to OpenCode CLI's auth.json.
 * This enables OpenCode to recognize DeepSeek, Z.AI, and MiniMax providers.
 *
 * OpenCode stores credentials in:
 * - Unix: ~/.local/share/opencode/auth.json
 * - Windows: %LOCALAPPDATA%/opencode/auth.json
 *
 * @module main/opencode/config-generator/auth/sync
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Map Openwork provider IDs to OpenCode CLI provider IDs
 *
 * Note: zai maps to 'zai-coding-plan' in OpenCode CLI, not 'zai'
 */
export const API_KEY_MAPPINGS: Record<string, string> = {
  deepseek: 'deepseek',
  zai: 'zai-coding-plan',
  minimax: 'minimax',
};

/**
 * Auth entry structure in auth.json
 */
interface AuthEntry {
  type: string;
  key: string;
}

type AuthJson = Record<string, AuthEntry>;

/**
 * Get the path to OpenCode CLI's auth.json
 *
 * OpenCode stores credentials in platform-specific locations:
 * - Unix (macOS/Linux): ~/.local/share/opencode/auth.json
 * - Windows: %USERPROFILE%/AppData/Local/opencode/auth.json
 *
 * @returns The absolute path to auth.json
 */
export function getOpenCodeAuthPath(): string {
  const homeDir = app.getPath('home');
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'opencode', 'auth.json');
  }
  return path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
}

/**
 * Sync API keys from Openwork's secure storage to OpenCode CLI's auth.json
 *
 * This function:
 * 1. Retrieves all API keys from secure storage
 * 2. For each provider in API_KEY_MAPPINGS, checks if key exists
 * 3. Creates/updates auth.json only if changes are needed
 * 4. Preserves existing entries for other providers
 *
 * @param getAllApiKeys - Function to retrieve all API keys from secure storage
 */
export async function syncApiKeysToOpenCodeAuth(
  getAllApiKeys?: () => Promise<Record<string, string | null>>
): Promise<void> {
  // Use provided function or import default
  let getKeys = getAllApiKeys;
  if (!getKeys) {
    const { getAllApiKeys: defaultGetAllApiKeys } = await import(
      '../../../store/secureStorage'
    );
    getKeys = defaultGetAllApiKeys;
  }

  const apiKeys = await getKeys();

  // Check if any of the sync-able keys are present
  const hasKeysToSync = Object.keys(API_KEY_MAPPINGS).some(
    (key) => apiKeys[key] != null
  );

  if (!hasKeysToSync) {
    // No keys to sync, return early
    return;
  }

  const authPath = getOpenCodeAuthPath();
  const authDir = path.dirname(authPath);

  // Ensure directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Read existing auth.json or create empty object
  let auth: AuthJson = {};
  if (fs.existsSync(authPath)) {
    try {
      auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    } catch (e) {
      console.warn(
        '[OpenCode Auth] Failed to parse existing auth.json, creating new one'
      );
      auth = {};
    }
  }

  let updated = false;

  // Sync DeepSeek API key
  if (apiKeys.deepseek) {
    if (!auth['deepseek'] || auth['deepseek'].key !== apiKeys.deepseek) {
      auth['deepseek'] = { type: 'api', key: apiKeys.deepseek };
      updated = true;
      console.log('[OpenCode Auth] Synced DeepSeek API key');
    }
  }

  // Sync Z.AI Coding Plan API key (maps to 'zai-coding-plan' provider in OpenCode CLI)
  if (apiKeys.zai) {
    if (!auth['zai-coding-plan'] || auth['zai-coding-plan'].key !== apiKeys.zai) {
      auth['zai-coding-plan'] = { type: 'api', key: apiKeys.zai };
      updated = true;
      console.log('[OpenCode Auth] Synced Z.AI Coding Plan API key');
    }
  }

  // Sync MiniMax API key
  if (apiKeys.minimax) {
    if (!auth.minimax || auth.minimax.key !== apiKeys.minimax) {
      auth.minimax = { type: 'api', key: apiKeys.minimax };
      updated = true;
      console.log('[OpenCode Auth] Synced MiniMax API key');
    }
  }

  // Write updated auth.json
  if (updated) {
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    console.log(`[OpenCode Auth] Updated auth.json at: ${authPath}`);
  }
}
