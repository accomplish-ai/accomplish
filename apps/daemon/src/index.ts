import crypto from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import {
  DaemonRpcServer,
  getSocketPath,
  getPidFilePath,
  acquirePidLock,
  installCrashHandlers,
  noopRuntime,
  type PidLockHandle,
  type AccomplishRuntime,
  WHATSAPP_API_PORT,
} from '@accomplish_ai/agent-core';
import { StorageService } from './storage-service.js';
import { TaskService } from './task-service.js';
import { SchedulerService } from './scheduler-service.js';
import { HealthService, VERSION } from './health.js';
import { parseArgs } from './cli.js';
import { registerRpcMethods, safeHandler } from './daemon-routes.js';
import { registerTaskEventForwarding } from './task-event-forwarding.js';
import { WhatsAppDaemonService } from './whatsapp-service.js';
import { WhatsAppSendApi } from './whatsapp/whatsapp-send-api.js';
import { OpenAiOauthManager } from './opencode/auth-openai.js';
// Milestone 2 of the daemon-only-SQLite migration — these four services
// expose the daemon's storage surface over RPC so main can progressively
// stop opening the DB itself. They're purely additive in M2; desktop doesn't
// consume them yet.
import { SecretsService } from './secrets-service.js';
import { SettingsService } from './settings-service.js';
import { WorkspaceService } from './workspace-service.js';
import { ConnectorService } from './connector-service.js';
import { LegacyImportService } from './legacy-import-service.js';
// Milestone 4 of the daemon-only-SQLite migration — daemon takes over
// ownership of Google accounts (CRUD + token refresh) and skills (CRUD +
// disk scan). Main keeps the Electron-only parts (OAuth loopback +
// `shell.open*`) and calls these services over RPC.
import { GoogleAccountService } from './google-account-service.js';
import { SkillsService } from './skills-service.js';
import { log } from './logger.js';

// __dirname is available natively in CJS (the daemon is built as CJS by tsup)

const DRAIN_TIMEOUT_MS = 30_000;
let pidLock: PidLockHandle | null = null;

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  installCrashHandlers();

  // ── Load Accomplish AI runtime (noop in OSS, real impl in commercial) ───
  let accomplishRuntime: AccomplishRuntime = noopRuntime;
  try {
    const mod = await import('@accomplish/llm-gateway-client');
    accomplishRuntime = mod.createRuntime();
  } catch (err: unknown) {
    const isTargetPackageMissing =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'ERR_MODULE_NOT_FOUND' &&
      String(err).includes("Cannot find package '@accomplish/llm-gateway-client'");
    if (isTargetPackageMissing) {
      console.log('[Daemon] @accomplish/llm-gateway-client not installed — OSS mode');
    } else {
      throw err;
    }
  }

  // Resolve dataDir early — all identity files (socket, PID, DB) derive from it.
  // --data-dir is required by default. Only explicitly opted-in dev mode skips it,
  // so a misconfigured launcher can never silently use the wrong profile.
  const dataDir = args.dataDir;
  const isDevMode = process.env.ACCOMPLISH_DAEMON_DEV === '1';
  if (!dataDir && !isDevMode) {
    log.error(
      '[Daemon] Error: --data-dir is required.\n' +
        'The daemon must know which data directory to use so it shares the same\n' +
        'database, socket, and PID file as the desktop app.\n\n' +
        'Usage: node daemon/index.js --data-dir /path/to/userData\n\n' +
        'For local development without --data-dir, set ACCOMPLISH_DAEMON_DEV=1\n' +
        'to fall back to ~/.accomplish.',
    );
    process.exit(1);
  }

  if (!dataDir && isDevMode) {
    log.warn('[Daemon] Warning: running in dev mode without --data-dir, using ~/.accomplish');
  }

  log.info(`[Daemon] Starting... (dataDir=${dataDir ?? '~/.accomplish (dev fallback)'})`);

  // 1. Acquire PID lock scoped to dataDir (atomic, with stale detection)
  const pidPath = getPidFilePath(dataDir);
  pidLock = acquirePidLock(pidPath);
  log.info(`[Daemon] PID lock acquired: ${pidLock.pidPath} (pid=${process.pid})`);

  // 2. Generate per-session auth token for HTTP APIs
  const authToken = crypto.randomUUID();

  // 3. Initialize storage (use shared data dir if provided, enabling shared DB with desktop)
  const storageService = new StorageService();
  const storage = storageService.initialize(dataDir);

  // 4. Crash recovery: mark stale running tasks as failed
  for (const task of storage.getTasks()) {
    if (task.status === 'running') {
      log.warn(`[Daemon] Crash recovery: marking stale task ${task.id} as failed`);
      storage.updateTaskStatus(task.id, 'failed', new Date().toISOString());
    }
  }

  // 5. Create services
  // Packaged-mode context: CLI args take precedence over env vars (for Windows login-item).
  const userDataPath = dataDir || path.join(homedir(), '.accomplish');
  const isPackaged = args.isPackaged || process.env.ACCOMPLISH_IS_PACKAGED === '1';
  const resourcesPath = args.resourcesPath || process.env.ACCOMPLISH_RESOURCES_PATH || '';
  const appPath = args.appPath || process.env.ACCOMPLISH_APP_PATH || '';
  const mcpToolsPath = isPackaged
    ? path.join(resourcesPath, 'mcp-tools')
    : process.env.MCP_TOOLS_PATH ||
      path.resolve(__dirname, '..', '..', '..', 'packages', 'agent-core', 'mcp-tools');
  // 5a. RPC server first — TaskService needs its `hasConnectedClients` probe
  // for the no-UI auto-deny policy introduced in Phase 2 of the SDK cutover
  // port. Socket path derived from dataDir for profile isolation.
  const socketPath = args.socketPath || getSocketPath(dataDir);
  const rpc = new DaemonRpcServer({
    socketPath,
    onConnection: (clientId) => log.info(`[Daemon] Client connected: ${clientId}`),
    onDisconnection: (clientId) => log.info(`[Daemon] Client disconnected: ${clientId}`),
  });

  // Optional runtime-proxy tagger. The adapter's proxy-tagging path
  // becomes a no-op in pure OSS builds where the optional package is
  // not installed. Mirrors the `accomplishRuntime` bootstrap pattern at
  // the top of this function — distinguishes "not installed" (silent)
  // from "installed but broken" (logs).
  const OPTIONAL_RUNTIME_MODULE = '@accomplish/llm-gateway-client';
  let setProxyTaskId: ((taskId: string | undefined) => void) | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const runtimeMod = require(OPTIONAL_RUNTIME_MODULE) as {
      setProxyTaskId?: (taskId: string | undefined) => void;
    };
    if (typeof runtimeMod.setProxyTaskId === 'function') {
      setProxyTaskId = runtimeMod.setProxyTaskId;
      log.info('[Daemon] optional runtime detected; proxy task-tagging wired');
    } else {
      log.warn(
        '[Daemon] optional runtime resolved but exports no setProxyTaskId function — proxy task-tagging stays unwired. Check the package build.',
      );
    }
  } catch (err) {
    const isPackageMissing =
      err instanceof Error &&
      ('code' in err ? (err as { code: string }).code === 'MODULE_NOT_FOUND' : false) &&
      String(err).includes(`Cannot find module '${OPTIONAL_RUNTIME_MODULE}'`);
    if (!isPackageMissing) {
      log.error(
        `[Daemon] optional runtime present but failed to load: ${err instanceof Error ? err.message : String(err)}. Proxy task-tagging stays unwired.`,
      );
    }
    // Missing package: pure OSS. Stay silent.
  }

  const taskService = new TaskService(storage, {
    userDataPath,
    mcpToolsPath,
    isPackaged,
    resourcesPath,
    appPath,
    accomplishRuntime,
    rpcConnectivityProbe: { hasConnectedClients: () => rpc.hasConnectedClients() },
    setProxyTaskId,
  });
  const healthService = new HealthService();
  // Scheduler-sourced tasks: `source: 'scheduler'` drives the no-UI auto-deny
  // policy in task-callbacks. If no RPC client is connected when a scheduled
  // task asks for a permission, it auto-denies immediately (matches the
  // pre-port PermissionService safeguard that Phase 2 replaced).
  const schedulerService = new SchedulerService(storage, (prompt, workspaceId) => {
    void taskService.startTask({ prompt, workspaceId, source: 'scheduler' });
  });
  const whatsappService = new WhatsAppDaemonService(storage, userDataPath, taskService);
  const whatsappSendApi = new WhatsAppSendApi(whatsappService, authToken);

  // OpenAI ChatGPT OAuth manager (Phase 4a of the SDK cutover port). Owns
  // the transient `opencode serve` + SDK auth flow so desktop only handles
  // the Electron-only `shell.openExternal` step.
  const openAiOauthManager = new OpenAiOauthManager({
    storage,
    userDataPath,
    mcpToolsPath,
    isPackaged,
    resourcesPath,
    appPath,
    accomplishRuntime,
  });

  // Phase 2 of the SDK cutover port deleted PermissionService. Permission and
  // question requests now flow adapter → task-callbacks → taskService emit
  // → daemon-routes 'permission.request' RPC notification, and replies come
  // back via 'permission.respond' RPC → taskService.sendResponse → SDK reply.
  // The /permission and /question HTTP endpoints are gone with the service.

  // Milestone 2: storage-surface services. Thin wrappers over StorageAPI
  // (plus, in the legacy importer's case, the raw `better-sqlite3` handle)
  // that expose typed RPC endpoints. Nothing in main consumes these yet —
  // Milestones 3 and 5 repoint desktop callers onto them.
  const secretsService = new SecretsService(storage);
  const settingsService = new SettingsService(storage);
  const workspaceService = new WorkspaceService();
  const connectorService = new ConnectorService(storage);
  const legacyImportService = new LegacyImportService(storageService.getRawDatabase());

  // Milestone 4 services — own Google accounts + skills.
  const googleAccountService = new GoogleAccountService(storageService.getRawDatabase(), storage);
  // Bundled-skills location mirrors the desktop pre-M4 path. In packaged
  // builds Electron passes `--resources-path`; in dev we fall back to the
  // repo root so `pnpm dev` still finds the bundled skills directory.
  const bundledSkillsPath = isPackaged
    ? path.join(resourcesPath, 'bundled-skills')
    : appPath
      ? path.join(appPath, 'bundled-skills')
      : path.resolve(__dirname, '..', '..', '..', 'bundled-skills');
  const skillsService = new SkillsService({
    dataDir: userDataPath,
    bundledSkillsPath,
  });

  // Ensure the default workspace exists and the active-workspace pointer is
  // valid BEFORE registering any workspace RPCs. Ports the bootstrap from
  // desktop's `workspaceManager.initialize()`; migrations only create the
  // tables, so without this a fresh profile would answer `workspace.list`
  // with `[]` and `workspace.getActive` with `null`. Idempotent.
  workspaceService.ensureInitialized();

  // Milestone 4 — initialize SkillsService (reads bundled + user skill
  // directories from disk, reconciles with the DB) and restart Google
  // account refresh timers for every previously-connected account. Both
  // are crash-safe: idempotent and tolerant of partial / corrupted state.
  try {
    await skillsService.initialize();
  } catch (err) {
    log.warn(
      `[Daemon] SkillsService initialize failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  googleAccountService.startAllTimers();

  // Register RPC methods and task event forwarding
  const routeServices = {
    rpc,
    taskService,
    healthService,
    storageService,
    schedulerService,
    accomplishRuntime,
    whatsappService,
    openAiOauthManager,
    secretsService,
    settingsService,
    workspaceService,
    connectorService,
    legacyImportService,
    googleAccountService,
    skillsService,
  };
  registerRpcMethods(routeServices);
  registerTaskEventForwarding(routeServices);

  // Start remaining HTTP / RPC services on well-known ports.
  // The two HTTP listeners that ran on pre-cutover permission/question ports
  // were removed in Phase 3 of the SDK cutover port — their MCP shims
  // (file-permission, ask-user-question) were replaced by native SDK events.
  // THOUGHT_STREAM_PORT (9228) was removed with the rest of the unused
  // thought-stream reporting pipeline (report-thought / report-checkpoint
  // MCP tools were never registered in the opencode config, so the HTTP
  // server never received real traffic).
  await rpc.start();
  await whatsappSendApi.start(WHATSAPP_API_PORT);

  // Pass auth token and actual ports to child processes via environment
  process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN = authToken;
  const whatsappPort = whatsappSendApi.getPort();
  if (whatsappPort) {
    process.env.ACCOMPLISH_WHATSAPP_API_PORT = String(whatsappPort);
  }

  // Start scheduler after RPC server is ready
  schedulerService.start();
  log.info('[Daemon] Scheduler started');

  // Auto-connect WhatsApp if previously enabled
  whatsappService.autoConnectIfEnabled();

  log.info(`[Daemon] Listening on ${socketPath}`);

  // 12. Graceful shutdown with drain phase
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info('[Daemon] Shutting down...');

    // Stop scheduler FIRST — prevent new tasks from being launched during drain
    schedulerService.stop();
    log.info('[Daemon] Scheduler stopped');

    const activeCount = taskService.getActiveTaskCount();
    if (activeCount > 0) {
      log.info(`[Daemon] Draining ${activeCount} active task(s)...`);
      await new Promise<void>((resolve) => {
        let remaining = taskService.getActiveTaskCount();
        if (remaining === 0) {
          resolve();
          return;
        }

        const drainTimeout = setTimeout(() => {
          log.warn('[Daemon] Drain timeout reached, force-killing active tasks');
          taskService.dispose();
          resolve();
        }, DRAIN_TIMEOUT_MS);
        drainTimeout.unref();

        const onComplete = () => {
          remaining = taskService.getActiveTaskCount();
          if (remaining === 0) {
            clearTimeout(drainTimeout);
            taskService.removeListener('complete', onComplete);
            taskService.removeListener('error', onComplete);
            resolve();
          }
        };
        taskService.on('complete', onComplete);
        taskService.on('error', onComplete);
      });
    }

    whatsappSendApi.stop();
    whatsappService.dispose();
    openAiOauthManager.dispose();
    taskService.dispose();
    await rpc.stop();
    storageService.close();
    pidLock?.release();
    log.info('[Daemon] Shutdown complete');
    process.exit(0);
  };

  const forceShutdown = () => {
    log.error('[Daemon] Forced shutdown after timeout');
    pidLock?.release();
    process.exit(1);
  };

  // Register daemon.shutdown RPC method (must be after shutdown() is defined)
  rpc.registerMethod(
    'daemon.shutdown',
    safeHandler(async () => {
      log.info('[Daemon] Shutdown requested via RPC');
      // Defer actual shutdown to after the RPC response is sent
      setTimeout(() => void shutdown(), 100);
      return Promise.resolve();
    }),
  );

  process.on('SIGINT', () => {
    setTimeout(forceShutdown, DRAIN_TIMEOUT_MS + 10_000).unref();
    void shutdown();
  });
  process.on('SIGTERM', () => {
    setTimeout(forceShutdown, DRAIN_TIMEOUT_MS + 10_000).unref();
    void shutdown();
  });
}

main().catch((err) => {
  log.error('[Daemon] Fatal error:', err);
  pidLock?.release();
  process.exit(1);
});
