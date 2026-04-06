/**
 * Shared task config resolution — the "one brain" for config assembly.
 *
 * Resolves skills, connectors (with token refresh), cloud browser config,
 * workspace knowledge notes, and OpenAI store:false injection into a
 * ConfigGeneratorOptions object that can be passed to generateConfig().
 *
 * Used by both the desktop config-generator (bridge period) and the
 * standalone daemon's TaskService.
 */

import type { StorageAPI } from '../types/storage.js';
import type { Skill } from '../common/types/skills.js';
import type { ConfigGeneratorOptions, ProviderConfig } from './config-generator.js';
import type { BrowserConfig } from './generator-mcp.js';
import { isTokenExpired, refreshAccessToken } from '../connectors/oauth-tokens.js';
import { getKnowledgeNotesForPrompt } from '../storage/repositories/knowledgeNotes.js';
import { buildProviderConfigs } from './config-builder.js';

export interface ResolveTaskConfigOptions {
  /** Storage API for reading connectors, cloud browser, sandbox, etc. */
  storage: StorageAPI;

  /** Platform info */
  platform: NodeJS.Platform;
  mcpToolsPath: string;
  userDataPath: string;
  isPackaged: boolean;
  bundledNodeBinPath?: string;

  /** API key getter (sync — reads from secure storage or DB) */
  getApiKey: (provider: string) => string | null;

  /** Optional Azure Foundry token for Entra ID auth */
  azureFoundryToken?: string;

  /** Permission and question API ports */
  permissionApiPort?: number;
  questionApiPort?: number;

  /** Optional auth token for daemon API endpoints */
  authToken?: string;

  /**
   * Pre-resolved enabled skills.
   * The caller provides these because skill resolution may go through
   * SkillsManager (desktop) or direct DB query (daemon).
   */
  skills?: Skill[];

  /**
   * Active workspace ID for knowledge notes injection.
   * If provided, workspace knowledge notes are loaded and injected.
   */
  workspaceId?: string;

  /**
   * Logger function for non-fatal warnings.
   * Defaults to console.warn if not provided.
   */
  log?: (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) => void;
}

export interface ResolvedTaskConfig {
  /** Ready-to-use options for generateConfig() */
  configOptions: ConfigGeneratorOptions;
}

/**
 * Resolve all task configuration from storage and external sources.
 *
 * This is the shared "one brain" that both desktop and daemon use to
 * assemble the full ConfigGeneratorOptions before calling generateConfig().
 */
export async function resolveTaskConfig(
  options: ResolveTaskConfigOptions,
): Promise<ResolvedTaskConfig> {
  const {
    storage,
    platform,
    mcpToolsPath,
    userDataPath,
    isPackaged,
    bundledNodeBinPath,
    getApiKey,
    azureFoundryToken,
    permissionApiPort,
    questionApiPort,
    authToken,
    skills,
    workspaceId,
  } = options;

  const log = options.log ?? ((_level: string, msg: string) => console.warn(msg));

  // 1. Build provider configs
  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs({
    getApiKey,
    azureFoundryToken,
  });

  // 2. Inject store:false for OpenAI to prevent 403 errors with project-scoped keys
  injectOpenAiStoreFlag(providerConfigs, getApiKey);

  // 3. Resolve connectors with token refresh
  const connectors = await resolveConnectors(storage, log);

  // 4. Resolve cloud browser config
  const browser = resolveCloudBrowser(storage);

  // 5. Resolve workspace knowledge notes
  let knowledgeNotes: string | undefined;
  if (workspaceId) {
    try {
      const formatted = getKnowledgeNotesForPrompt(workspaceId);
      if (formatted) {
        knowledgeNotes = formatted;
      }
    } catch (error) {
      log('WARN', '[resolveTaskConfig] Failed to load workspace knowledge notes', {
        workspaceId,
        err: String(error),
      });
    }
  }

  return {
    configOptions: {
      platform,
      mcpToolsPath,
      userDataPath,
      isPackaged,
      bundledNodeBinPath,
      skills,
      providerConfigs,
      enabledProviders,
      permissionApiPort,
      questionApiPort,
      authToken,
      model: modelOverride?.model,
      smallModel: modelOverride?.smallModel,
      connectors: connectors.length > 0 ? connectors : undefined,
      browser,
      knowledgeNotes,
    },
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function injectOpenAiStoreFlag(
  providerConfigs: ProviderConfig[],
  getApiKey: (provider: string) => string | null,
): void {
  const openAiApiKey = getApiKey('openai');
  if (!openAiApiKey) {
    return;
  }
  const existing = providerConfigs.find((p) => p.id === 'openai');
  if (existing) {
    existing.options.store = false;
  } else {
    providerConfigs.push({ id: 'openai', options: { store: false } });
  }
}

async function resolveConnectors(
  storage: StorageAPI,
  log: (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) => void,
): Promise<Array<{ id: string; name: string; url: string; accessToken: string }>> {
  const enabledConnectors = storage.getEnabledConnectors();
  const result: Array<{ id: string; name: string; url: string; accessToken: string }> = [];

  for (const connector of enabledConnectors) {
    if (connector.status !== 'connected') {
      continue;
    }

    let tokens = storage.getConnectorTokens(connector.id);
    if (!tokens?.accessToken) {
      log('WARN', `[resolveTaskConfig] Missing access token for ${connector.name}`);
      storage.setConnectorStatus(connector.id, 'error');
      continue;
    }

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      if (tokens.refreshToken && connector.oauthMetadata && connector.clientRegistration) {
        try {
          tokens = await refreshAccessToken({
            tokenEndpoint: connector.oauthMetadata.tokenEndpoint,
            refreshToken: tokens.refreshToken,
            clientId: connector.clientRegistration.clientId,
            clientSecret: connector.clientRegistration.clientSecret,
          });
          storage.storeConnectorTokens(connector.id, tokens);
        } catch (err) {
          log('WARN', `[resolveTaskConfig] Token refresh failed for ${connector.name}`, {
            err: String(err),
          });
          storage.setConnectorStatus(connector.id, 'error');
          continue;
        }
      } else {
        log('WARN', `[resolveTaskConfig] Token expired for ${connector.name} and cannot refresh`);
        storage.setConnectorStatus(connector.id, 'error');
        continue;
      }
    }

    result.push({
      id: connector.id,
      name: connector.name,
      url: connector.url,
      accessToken: tokens.accessToken,
    });
  }

  return result;
}

function resolveCloudBrowser(storage: StorageAPI): BrowserConfig | undefined {
  const cloudBrowserConfig = storage.getCloudBrowserConfig();
  if (!cloudBrowserConfig?.activeProvider) {
    return undefined;
  }
  const providerCfg = cloudBrowserConfig.providers[cloudBrowserConfig.activeProvider];
  if (!providerCfg?.endpoint) {
    return undefined;
  }
  return {
    mode: 'remote',
    cdpEndpoint: providerCfg.endpoint,
    cdpHeaders: providerCfg.apiKey ? { 'X-CDP-Secret': providerCfg.apiKey } : undefined,
  };
}
