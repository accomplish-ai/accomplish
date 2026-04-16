/**
 * Environment and CLI configuration builders for TaskService.
 * Extracted to keep task-service.ts under 200 lines.
 *
 * NO electron imports — this runs as plain Node.js.
 */
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isCliAvailable as coreIsCliAvailable,
  generateConfig,
  resolveTaskConfig,
  syncApiKeysToOpenCodeAuth,
  getOpenCodeAuthJsonPath,
  getBundledNodePaths,
  getEnabledSkills,
  type StorageAPI,
  type CliResolverConfig,
  type AccomplishRuntime,
  type OnBeforeStartContext,
} from '@accomplish_ai/agent-core';
import { getDatabase } from '@accomplish_ai/agent-core/storage/database';

export interface TaskConfigBuilderOptions {
  userDataPath: string;
  mcpToolsPath: string;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  accomplishRuntime?: AccomplishRuntime;
}

// Phase 4b of the OpenCode SDK cutover port removed the dead `getCliCommand`,
// `buildEnvironment`, and `buildCliArgs` helpers. The SDK adapter no longer
// spawns a CLI per task — `OpenCodeServerManager` runs `opencode serve`
// directly via `child_process.spawn` and the SDK uses HTTP. The
// per-task spawn environment is built inside the server-manager itself.

export function getBundledNodeBinPath(opts: TaskConfigBuilderOptions): string | undefined {
  const paths = getBundledNodePaths({
    isPackaged: opts.isPackaged,
    resourcesPath: opts.resourcesPath,
    appPath: opts.appPath,
    userDataPath: opts.userDataPath,
    tempPath: tmpdir(),
    platform: process.platform,
    arch: process.arch,
  });
  return paths?.binDir;
}

export async function isCliAvailable(opts: TaskConfigBuilderOptions): Promise<boolean> {
  const cliConfig: CliResolverConfig = {
    isPackaged: opts.isPackaged,
    resourcesPath: opts.resourcesPath,
    appPath: opts.appPath,
  };
  return coreIsCliAvailable(cliConfig);
}

/**
 * Read a port number from the given env var, returning `undefined` when the
 * var is unset or not an integer. Used to pick up port assignments that the
 * daemon emits from its own HTTP services (WhatsApp API) into child-process
 * MCP tools.
 */
function getPort(envVar: string): number | undefined {
  const val = process.env[envVar];
  if (!val) {
    return undefined;
  }
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Build the per-task config filename from the adapter-supplied taskId,
 * scrubbed to a safe character set. `task.start` accepts an optional
 * caller-provided `taskId` as an arbitrary string, and `generateConfig`
 * joins `configFileName` straight into a filesystem path — a value
 * containing `/`, `..`, or NUL could write outside the opencode config
 * directory. Replace anything outside `[A-Za-z0-9_-]` with `_`.
 *
 * Returns `undefined` when no taskId is supplied (the transient OAuth
 * path passes an empty `ctx`) so `generateConfig` falls back to its
 * default `opencode.json` filename.
 */
function buildConfigFileName(taskId: string | undefined): string | undefined {
  if (!taskId) {
    return undefined;
  }
  const safe = taskId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  if (!safe) {
    return undefined;
  }
  return `opencode-${safe}.json`;
}

/**
 * Pre-task hook invoked from two places:
 *   1. `OpenCodeAdapter.startTask` (agent-core) — writes the per-task config
 *      file, then calls `session.create` against the running `opencode serve`.
 *   2. `OpenCodeTaskRuntime.doStart` (server-manager) — writes the same
 *      config file and surfaces `OPENCODE_CONFIG[_DIR]` into the env the
 *      `opencode serve` child inherits.
 *
 * Both calls route through `resolveTaskConfig` — the shared "one brain"
 * that injects skills, connectors (with token refresh), cloud browser,
 * knowledge notes, language, GWS accounts manifest, and OpenAI store:false
 * into a single `ConfigGeneratorOptions` payload.
 *
 * The `ctx` argument carries per-task context:
 *   - `ctx.taskId` → lets us emit a per-task config filename
 *     (`opencode-<taskId>.json`) so concurrent tasks don't race on the same
 *     `opencode.json`.
 *   - `ctx.workspaceId` → workspace-scoped knowledge notes.
 *
 * The transient OAuth flow (`createTransientOpencodeClient`) passes an empty
 * ctx; in that case we fall back to the default `opencode.json` filename and
 * skip the workspace context.
 */
export async function onBeforeStart(
  storage: StorageAPI,
  opts: TaskConfigBuilderOptions,
  ctx: OnBeforeStartContext,
): Promise<{ configPath: string; env: NodeJS.ProcessEnv }> {
  const authPath = getOpenCodeAuthJsonPath();
  const apiKeys = await storage.getAllApiKeys();
  await syncApiKeysToOpenCodeAuth(authPath, apiKeys);

  const permissionApiPort = getPort('ACCOMPLISH_PERMISSION_API_PORT');
  const questionApiPort = getPort('ACCOMPLISH_QUESTION_API_PORT');
  const whatsappApiPort = getPort('ACCOMPLISH_WHATSAPP_API_PORT');

  const skills = getEnabledSkills();

  // Resolve the database lazily. Tests or daemon callers that initialize
  // storage differently may not have `getDatabase()` set up — treat it as
  // optional (GWS manifest step then silently skips).
  let database: ReturnType<typeof getDatabase> | undefined;
  try {
    database = getDatabase();
  } catch {
    database = undefined;
  }

  const { configOptions } = await resolveTaskConfig({
    storage,
    platform: process.platform,
    mcpToolsPath: opts.mcpToolsPath,
    userDataPath: opts.userDataPath,
    isPackaged: opts.isPackaged,
    bundledNodeBinPath: getBundledNodeBinPath(opts),
    getApiKey: (provider) => storage.getApiKey(provider),
    permissionApiPort,
    questionApiPort,
    whatsappApiPort,
    authToken: process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN,
    skills,
    workspaceId: ctx.workspaceId,
    configFileName: buildConfigFileName(ctx.taskId),
    accomplishRuntime: opts.accomplishRuntime,
    accomplishStorageDeps: {
      readKey: (key) => storage.get(key),
      writeKey: (key, value) => storage.set(key, value),
      readGaClientId: () => null, // GA client ID not available in daemon — fingerprint fallback used
    },
    database,
  });

  const result = generateConfig(configOptions);

  // Prepend the bundled Node.js bin dir to the env's PATH so the
  // `apps/desktop/node_modules/.bin/opencode` shell wrapper (and the
  // packaged equivalent) can find `node` even when the daemon runs as a
  // login item with a minimal PATH (e.g. `/usr/bin:/bin:/usr/sbin:/sbin`
  // with no user-installed Node.js). The deleted PTY-era `buildEnvironment`
  // helper used to do this; the SDK adapter still needs it because
  // `opencode serve` is launched by `OpenCodeServerManager.spawnOpenCodeServer`
  // through the same shell shim.
  const env: NodeJS.ProcessEnv = {
    OPENCODE_CONFIG: result.configPath,
    OPENCODE_CONFIG_DIR: path.dirname(result.configPath),
  };
  const bundledNodeBinPath = getBundledNodeBinPath(opts);
  if (bundledNodeBinPath) {
    env.PATH = `${bundledNodeBinPath}${path.delimiter}${process.env.PATH ?? ''}`;
    if (process.platform === 'win32') {
      env.Path = env.PATH;
    }
  }

  return {
    configPath: result.configPath,
    env,
  };
}
export * from './task-service-helpers.js';
export { createTaskCallbacks } from './task-callbacks.js';
