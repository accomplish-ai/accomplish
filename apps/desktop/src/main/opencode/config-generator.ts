import { app } from 'electron';
import path from 'path';
import {
  generateConfig,
  ACCOMPLISH_AGENT_NAME,
  resolveTaskConfig,
  syncApiKeysToOpenCodeAuth as coreSyncApiKeysToOpenCodeAuth,
  getOpenCodeAuthPath,
  PERMISSION_API_PORT,
  QUESTION_API_PORT,
} from '@accomplish_ai/agent-core';
import { getApiKey, getAllApiKeys } from '../store/secureStorage';
import { getStorage } from '../store/storage';
import { getBundledNodePaths } from '../utils/bundled-node';
import { skillsManager } from '../skills';
import { getLogCollector } from '../logging';
import * as workspaceManager from '../store/workspaceManager';

function logOC(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'opencode', msg, data);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

export { ACCOMPLISH_AGENT_NAME };

/**
 * Returns the path to MCP tools directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core', 'mcp-tools');
  }
}

/**
 * Returns the OpenCode config directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core');
  }
}

/**
 * Generates the OpenCode configuration file.
 *
 * Uses the shared resolveTaskConfig() helper (the "one brain") for config
 * assembly. This ensures desktop and daemon use identical resolution logic
 * for skills, connectors, cloud browser, and workspace knowledge notes.
 *
 * @param azureFoundryToken - Optional Azure Foundry token for Entra ID auth
 * @returns Path to the generated config file
 */
export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  const mcpToolsPath = getMcpToolsPath();
  const userDataPath = app.getPath('userData');
  const bundledNodeBinPath = getBundledNodePaths()?.binDir;

  logOC('INFO', `[OpenCode Config] MCP tools path: ${mcpToolsPath}`);
  logOC('INFO', `[OpenCode Config] User data path: ${userDataPath}`);
  if (!bundledNodeBinPath) {
    throw new Error(
      '[OpenCode Config] Bundled Node.js path is missing. ' +
        'Run "pnpm -F @accomplish/desktop download:nodejs" and rebuild before launching.',
    );
  }

  // Resolve enabled skills via SkillsManager (desktop-specific wrapper)
  const enabledSkills = await skillsManager.getEnabled();

  // Resolve active workspace ID (desktop-specific workspace manager)
  const activeWorkspaceId = workspaceManager.getActiveWorkspace();

  // Use shared "one brain" config resolution for everything else
  const { configOptions } = await resolveTaskConfig({
    storage: getStorage(),
    platform: process.platform,
    mcpToolsPath,
    userDataPath,
    isPackaged: app.isPackaged,
    bundledNodeBinPath,
    getApiKey,
    azureFoundryToken,
    permissionApiPort: PERMISSION_API_PORT,
    questionApiPort: QUESTION_API_PORT,
    skills: enabledSkills,
    workspaceId: activeWorkspaceId ?? undefined,
    log: logOC,
  });

  const result = generateConfig(configOptions);

  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);

  logOC('INFO', `[OpenCode Config] Generated config at: ${result.configPath}`);
  logOC('INFO', `[OpenCode Config] OPENCODE_CONFIG env set to: ${process.env.OPENCODE_CONFIG}`);
  logOC(
    'INFO',
    `[OpenCode Config] OPENCODE_CONFIG_DIR env set to: ${process.env.OPENCODE_CONFIG_DIR}`,
  );

  return result.configPath;
}

/**
 * Returns the path to the OpenCode config file.
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

// Re-export getOpenCodeAuthPath from core for consumers that import from this module
export { getOpenCodeAuthPath };

/**
 * Syncs API keys to the OpenCode auth.json file.
 * Uses Electron-specific path resolution and secure storage access.
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const apiKeys = await getAllApiKeys();
  const authPath = getOpenCodeAuthPath();

  await coreSyncApiKeysToOpenCodeAuth(authPath, apiKeys);
}
