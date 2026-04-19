/**
 * Shared task config resolution — the "one brain" for config assembly.
 *
 * Resolves skills, connectors (with token refresh), cloud browser config,
 * workspace knowledge notes, Google Workspace accounts, and OpenAI
 * store:false injection into a ConfigGeneratorOptions object that can be
 * passed to generateConfig().
 *
 * Used by both the desktop config-generator (bridge period) and the
 * standalone daemon's TaskService.
 */

import type { Database } from 'better-sqlite3';
import type { StorageAPI } from '../types/storage.js';
import type { Skill } from '../common/types/skills.js';
import type { ConfigGeneratorOptions, ProviderConfig } from './config-generator.js';
import type { BrowserConfig } from './generator-mcp.js';
import type { AccomplishRuntime, StorageDeps } from './accomplish-runtime.js';
import { isTokenExpired, refreshAccessToken } from '../connectors/oauth-tokens.js';
import { getFormattedKnowledgeNotes } from '../storage/repositories/knowledgeNotes.js';
import { buildProviderConfigs } from './config-builder.js';
import { prepareGwsManifest, type LogFn } from '../google-accounts/index.js';

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

  /** Port for the WhatsApp HTTP API. Omit to disable the MCP tool. */
  whatsappApiPort?: number;

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
   * Optional per-task config filename (e.g. `opencode-<taskId>.json`).
   * When concurrent tasks run simultaneously, sharing the default
   * `opencode.json` makes them race on the same file. The daemon passes
   * a taskId-scoped filename; desktop can omit to keep legacy behavior.
   */
  configFileName?: string;

  /**
   * Accomplish AI runtime adapter (noop in OSS, real impl in commercial).
   * Forwarded into `buildProviderConfigs` so the Accomplish-AI provider can
   * register itself when the runtime is available.
   */
  accomplishRuntime?: AccomplishRuntime;

  /**
   * Accomplish AI identity storage deps (injected from the caller's
   * secure storage). Forwarded into `buildProviderConfigs`.
   */
  accomplishStorageDeps?: StorageDeps;

  /**
   * Optional SQLite handle for GWS manifest generation. The daemon passes
   * its shared database; desktop omits (its own config-generator calls
   * `prepareGwsManifest` separately with its own AccountManager).
   *
   * When provided AND the `google_accounts` table has `status='connected'`
   * rows, `resolveTaskConfig` writes per-account token files + a manifest
   * and sets `gwsAccountsManifestPath` + `gwsAccountsSummary` on the
   * returned configOptions. If the table is missing (pre-migration DB) or
   * empty, this step silently skips.
   */
  database?: Database;

  /**
   * Logger function for non-fatal warnings.
   * Defaults to console.warn if not provided.
   */
  log?: LogFn;
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
    whatsappApiPort,
    authToken,
    skills,
    workspaceId,
    configFileName,
    accomplishRuntime,
    accomplishStorageDeps,
    database,
  } = options;

  const log: LogFn = options.log ?? ((_level, msg) => console.warn(msg));

  // 1. Build provider configs. `accomplishRuntime` + `accomplishStorageDeps`
  // forward to the Accomplish-AI provider when the optional runtime is loaded
  // (Free build); omitted on OSS so the provider stays dormant.
  const { providerConfigs, enabledProviders, modelOverride } = await buildProviderConfigs({
    getApiKey,
    azureFoundryToken,
    accomplishRuntime,
    accomplishStorageDeps,
  });

  // 2. Inject store:false for OpenAI to prevent 403 errors with project-scoped keys
  injectOpenAiStoreFlag(providerConfigs, getApiKey);

  // 3. Resolve connectors with token refresh
  const connectors = await resolveConnectors(storage, log);

  // 4. Resolve cloud browser config
  const browser = resolveCloudBrowser(storage);

  // 5. Resolve workspace knowledge notes — split into binding instructions
  //    (rendered under a MANDATORY wrapper) and soft context (rendered under
  //    a "background info" wrapper). Per the post-review fix for Codex P2,
  //    instruction-type notes must be framed as persistent user instructions
  //    that override conversational-bypass default-concise behavior.
  let knowledgeInstructions: string | undefined;
  let knowledgeContext: string | undefined;
  if (workspaceId) {
    try {
      const formatted = getFormattedKnowledgeNotes(workspaceId);
      if (formatted.instructions) knowledgeInstructions = formatted.instructions;
      if (formatted.context) knowledgeContext = formatted.context;
    } catch (error) {
      log('WARN', '[resolveTaskConfig] Failed to load workspace knowledge notes', {
        workspaceId,
        err: String(error),
      });
    }
  }

  // 6. Resolve UI language preference for agent communication
  /** UI language preference read from app_settings; undefined if the column is absent (pre-migration DB). */

  let language: string | undefined;
  try {
    language = storage.getLanguage();
    if (typeof language === 'string' && language.trim().length === 0) {
      language = undefined;
    }
  } catch (_err) {
    // Non-critical: language column may be absent in older DBs before migration
  }

  // 7. Resolve Google Workspace accounts manifest (daemon only — desktop's
  // config-generator calls `prepareGwsManifest` separately via its own
  // `AccountManager`). When the caller omits `database`, we skip this step.
  let gwsAccountsManifestPath: string | undefined;
  let gwsAccountsSummary: Array<{ label: string; email: string; status: string }> | undefined;
  if (database) {
    try {
      const gwsResult = await prepareGwsManifest(storage, database, userDataPath, log);
      if (gwsResult?.manifestPath) {
        gwsAccountsManifestPath = gwsResult.manifestPath;
      }
      if (gwsResult?.summary && gwsResult.summary.length > 0) {
        gwsAccountsSummary = gwsResult.summary.map((s) => ({
          label: s.label,
          email: s.email,
          status: s.status,
        }));
      }
    } catch (err) {
      log('WARN', '[resolveTaskConfig] GWS manifest step failed', { err: String(err) });
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
      whatsappApiPort,
      authToken,
      model: modelOverride?.model,
      smallModel: modelOverride?.smallModel,
      connectors: connectors.length > 0 ? connectors : undefined,
      browser,
      knowledgeInstructions,
      knowledgeContext,
      language,
      configFileName,
      gwsAccountsManifestPath,
      gwsAccountsSummary,
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
