/**
 * Daemon-side OpenCode server manager. Spawns one `opencode serve` child per
 * task and exposes a stable base URL for the SDK-based `OpenCodeAdapter` to
 * connect to.
 *
 * Ported from commercial `1a320029:apps/desktop/src/main/opencode/server-manager.ts`
 * with Electron dependencies stripped (no `@sentry/electron/main`, no
 * `./electron-options`). Daemon-flavour adaptations:
 *
 *   - Logging routed through pino via `./logger` instead of Sentry.
 *   - `opencode` binary resolved from the `opencode-ai` npm package via
 *     `require.resolve`, matching how the Phase 0 SDK spike validated it.
 *   - Environment + pre-flight (API-key sync, config-generation) delegated
 *     to the existing `task-config-builder` helpers so we don't duplicate
 *     desktop's pre-cutover logic.
 *
 * Lifecycle decisions (per plan decision #9):
 *   - Crash detection on child `exit`: notifyClosed fires so owners can
 *     emit a clean task-failure event.
 *   - Clean termination: SIGTERM then SIGKILL; POSIX process-group kill
 *     reaps grandchildren; Windows taskkill /T /F.
 *   - Daemon-shutdown cleanup: `process.on('exit', ...)` iterates every
 *     tracked PID and kills it. Hooked once on first runtime start.
 *   - Port-leak prevention: the tracked-PID registry combined with
 *     exit-hook cleanup prevents daemon restarts from orphaning servers.
 *     Startup zombie sweep (for crashed-daemon recovery) is not included
 *     here; that is a separate pid-file/state-directory concern to add
 *     later if it becomes a real problem.
 *
 * Part of the OpenCode SDK cutover port (Phase 2 of commercial PR #720).
 */

import { spawn, spawnSync, type ChildProcess } from 'child_process';
import {
  resolveCliPath,
  type StorageAPI,
  type AccomplishRuntime,
  type CliResolverConfig,
  type OnBeforeStartContext,
} from '@accomplish_ai/agent-core';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2';

import { log } from '../logger.js';
import { onBeforeStart, type TaskConfigBuilderOptions } from '../task-config-builder.js';

const READY_TIMEOUT_MS = 15_000;
const SERVER_URL_WAIT_TIMEOUT_MS = 10_000;
/**
 * Keep a short reuse window after a task completes so an immediate follow-up
 * task (e.g. resume) stays fast without leaving a finished runtime alive
 * forever.
 */
const TASK_RUNTIME_IDLE_CLEANUP_MS = 60_000;

interface TrackedOpencodeServerHandle {
  url: string;
  close(): void;
}

/**
 * Dependencies the server-manager needs to resolve per-task runtime config.
 * Passed once at construction instead of reading from globals so the daemon
 * can inject its storage, paths, and optional runtime hooks.
 */
export interface ServerManagerDeps extends TaskConfigBuilderOptions {
  storage: StorageAPI;
  /** Optional Accomplish runtime context (proxy, credits, etc.); daemon wires it. */
  accomplishRuntime?: AccomplishRuntime;
}

// ──────────────────────────── process-tree management ──────────────────────

const activeRuntimePids = new Set<number>();
let runtimeCleanupRegistered = false;

function ensureRuntimeCleanupRegistered(): void {
  if (runtimeCleanupRegistered) return;
  runtimeCleanupRegistered = true;
  process.on('exit', () => {
    for (const pid of activeRuntimePids) {
      killProcessTree(pid);
    }
  });
}

function killProcessTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 2000,
      windowsHide: true,
    });
    return;
  }

  // POSIX: kill the whole process group so grandchildren (e.g. plugins) go too.
  try {
    process.kill(-pid, 'SIGKILL');
    return;
  } catch {
    spawnSync('pkill', ['-9', '-P', String(pid)], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 2000,
    });
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited — fine.
  }
}

function trackRuntimePid(proc: ChildProcess): number {
  if (!proc.pid) {
    throw new Error('OpenCode server process did not expose a pid');
  }
  const pid = proc.pid;
  ensureRuntimeCleanupRegistered();
  activeRuntimePids.add(pid);
  proc.once('exit', () => {
    activeRuntimePids.delete(pid);
  });
  return pid;
}

// ──────────────────────────── binary resolution ────────────────────────────

let cachedOpencodeBinPath: string | null = null;

/**
 * Resolve the `opencode` CLI binary using the SAME resolver agent-core's
 * `isCliAvailable` uses. Earlier drafts of this function called
 * `require.resolve('opencode-ai/package.json')` directly, but in the
 * tsup-bundled CJS daemon the search root is `apps/daemon/dist/`, which has
 * no `node_modules/opencode-ai/`. The bundled-app form is
 * `${resourcesPath}/app.asar.unpacked/node_modules/opencode-ai/bin/opencode`;
 * the dev form is `${appPath}/node_modules/.bin/opencode`. Both are handled
 * by `resolveCliPath` so the daemon doesn't need to re-implement the
 * lookup. Cached after the first successful resolution.
 *
 * Throws when the CLI cannot be located — the per-task runtime can't spawn
 * `opencode serve` without it. The error message matches what the daemon
 * reports through the RPC layer for consistency.
 */
function getOpencodeBinPath(deps: TaskConfigBuilderOptions): string {
  if (cachedOpencodeBinPath) return cachedOpencodeBinPath;

  const cliConfig: CliResolverConfig = {
    isPackaged: deps.isPackaged,
    resourcesPath: deps.resourcesPath,
    appPath: deps.appPath,
  };
  const resolved = resolveCliPath(cliConfig);
  if (!resolved) {
    throw new Error(
      `Cannot locate opencode-ai CLI. resolveCliPath returned null for ` +
        `(isPackaged=${deps.isPackaged}, resourcesPath=${deps.resourcesPath}, appPath=${deps.appPath}).`,
    );
  }
  cachedOpencodeBinPath = resolved.cliPath;
  return resolved.cliPath;
}

// ──────────────────────────── low-level spawn ──────────────────────────────

function parseServerUrlFromOutput(line: string): string | null {
  if (!line.startsWith('opencode server listening')) return null;
  const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
  return match?.[1] ?? null;
}

function spawnOpenCodeServer(
  runtimeEnv: NodeJS.ProcessEnv,
  deps: TaskConfigBuilderOptions,
  signal?: AbortSignal,
  onClosed?: () => void,
): Promise<TrackedOpencodeServerHandle> {
  const command = getOpencodeBinPath(deps);
  const args = ['serve', '--hostname=127.0.0.1', '--port=0'];
  // Merge runtimeEnv (per-task config: OPENCODE_CONFIG, OPENCODE_CONFIG_DIR,
  // and PATH if onBeforeStart prepended bundled Node) ON TOP of process.env
  // so the spawned `opencode` shim inherits PATH, HOME, XDG_*, locale, etc.
  // Without this merge the shim runs in a near-empty env and the wrapper
  // shell script can't `exec node`. The runtime overrides win on conflict.
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...runtimeEnv };
  const proc = spawn(command, args, {
    detached: process.platform !== 'win32',
    env: mergedEnv,
    signal,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  return new Promise((resolve, reject) => {
    let runtimePid: number | null = null;
    let output = '';
    let stdoutBuffer = '';
    let settled = false;
    let closed = false;
    let closeNotified = false;

    const readyTimeout = setTimeout(() => {
      settle(() => {
        close();
        reject(new Error(`Timeout waiting for server to start after ${READY_TIMEOUT_MS}ms`));
      });
    }, READY_TIMEOUT_MS);

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimeout);
      proc.stdout?.removeListener('data', onStdout);
      proc.stderr?.removeListener('data', onStderr);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };

    const notifyClosed = (): void => {
      if (closeNotified) return;
      closeNotified = true;
      onClosed?.();
    };

    const close = (): void => {
      if (closed) return;
      closed = true;
      if (runtimePid !== null) {
        activeRuntimePids.delete(runtimePid);
        killProcessTree(runtimePid);
      }
    };

    const onStdout = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      output += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        // Forward opencode's own stdout into the daemon log. Previously we
        // captured stdout silently for ready-line parsing, which made it
        // impossible to see what opencode was doing during long-running
        // flows like OAuth. Forwarding gives direct visibility — the cost
        // is a little more log noise on successful task runs.
        if (settled) {
          log.info(`[opencode:stdout] ${trimmed}`);
        }
        const url = parseServerUrlFromOutput(trimmed);
        if (!url) continue;
        settle(() => {
          log.info(`[opencode:stdout] ${trimmed}`);
          resolve({ url, close });
        });
        return;
      }
    };

    const onStderr = (chunk: Buffer | string): void => {
      const text = chunk.toString();
      output += text;
      // Forward opencode's own stderr too — schema validation failures,
      // port conflicts, OAuth exchange errors all land here.
      for (const rawLine of text.split('\n')) {
        const trimmed = rawLine.trim();
        if (trimmed) log.warn(`[opencode:stderr] ${trimmed}`);
      }
    };

    const onExit = (code: number | null): void => {
      close();
      notifyClosed();
      // Always log the exit so silent child-process deaths are visible.
      log.warn(
        `[opencode:exit] opencode-serve exited with code ${code} after ${output.trim().length} bytes of output (settled=${settled})`,
      );
      if (settled) return;
      settle(() => {
        let message = `OpenCode server exited with code ${code}`;
        if (output.trim()) message += `\nServer output: ${output}`;
        reject(new Error(message));
      });
    };

    const onError = (error: Error): void => {
      close();
      notifyClosed();
      if (settled) return;
      settle(() => {
        reject(error);
      });
    };

    const onAbort = (): void => {
      settle(() => {
        close();
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    };

    proc.stdout?.on('data', onStdout);
    proc.stderr?.on('data', onStderr);
    proc.on('exit', onExit);
    proc.on('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });

    if (proc.pid) {
      runtimePid = trackRuntimePid(proc);
    }
  });
}

function throwIfStartAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Task runtime start aborted');
  error.name = 'AbortError';
  throw error;
}

// ──────────────────────────── per-task runtime ─────────────────────────────

class OpenCodeTaskRuntime {
  private server: TrackedOpencodeServerHandle | null = null;
  private serverUrl: string | undefined;
  private ready = false;
  private startPromise: Promise<void> | null = null;
  private startAbortController: AbortController | null = null;
  private disposed = false;
  /**
   * Per-task context forwarded to `onBeforeStart`. Populated by
   * `ensureTaskRuntime(taskId, ctx)`. Defaults to `{ taskId }` so runtimes
   * spawned by code paths that predate the workspace-aware task path
   * (transient OAuth client, future callers) still get a taskId at
   * minimum — `prepareGwsManifest` etc. only need the `workspaceId` when
   * it's actually present.
   */
  private ctx: OnBeforeStartContext;

  constructor(
    readonly taskId: string,
    private readonly deps: ServerManagerDeps,
  ) {
    this.ctx = { taskId };
  }

  /**
   * Update the per-task context. Called by the manager before `start()` /
   * on follow-up `ensureTaskRuntime` calls so the latest workspace context
   * reaches `onBeforeStart` if the runtime is still warm from a previous
   * task step.
   */
  setContext(ctx: OnBeforeStartContext): void {
    this.ctx = { taskId: this.taskId, ...ctx };
  }

  isReady(): boolean {
    return this.ready;
  }

  async waitForServerUrl(): Promise<string | undefined> {
    if (this.ready && this.serverUrl) return this.serverUrl;
    const deadline = Date.now() + SERVER_URL_WAIT_TIMEOUT_MS;

    while (true) {
      if (this.disposed) return undefined;
      if (this.ready && this.serverUrl) return this.serverUrl;
      if (Date.now() > deadline) return undefined;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;

    this.startAbortController = new AbortController();
    const signal = this.startAbortController.signal;

    this.startPromise = this.doStart(signal).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(signal: AbortSignal): Promise<void> {
    const startedAt = performance.now();
    try {
      throwIfStartAborted(signal);
      const { env: runtimeEnv } = await onBeforeStart(this.deps.storage, this.deps, this.ctx);
      throwIfStartAborted(signal);

      const spawnedServer = await spawnOpenCodeServer(runtimeEnv, this.deps, signal, () => {
        // Runtime-side `onClosed`: the child exited independently. Flip state
        // so `isReady()` reflects reality; the adapter consumes its own
        // `session.error` SDK event stream to report task-level failures.
        if (this.disposed) return;
        this.ready = false;
        this.serverUrl = undefined;
        this.server = null;
      });
      this.server = spawnedServer;

      if (signal.aborted) {
        await this.stop();
        return;
      }

      this.serverUrl = this.server.url;
      this.ready = true;
      log.info(
        `[OpenCode Server] Task runtime ${this.taskId} ready in ${(
          performance.now() - startedAt
        ).toFixed(0)}ms at ${this.serverUrl}`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        await this.stop();
        return;
      }
      log.warn(
        `[OpenCode Server] Failed to start task runtime ${this.taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.serverUrl = undefined;
    const serverToStop = this.server;
    this.server = null;
    if (!serverToStop) return;
    serverToStop.close();
  }

  abortStart(): void {
    this.startAbortController?.abort();
  }

  async waitForStartToSettle(): Promise<void> {
    if (this.startPromise) await this.startPromise;
  }

  dispose(): void {
    this.disposed = true;
    this.abortStart();
    void this.stop();
  }
}

// ──────────────────────────── manager (singleton per daemon) ───────────────

export class OpenCodeServerManager {
  private runtimes = new Map<string, OpenCodeTaskRuntime>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly deps: ServerManagerDeps) {}

  isReady(taskId: string): boolean {
    return this.runtimes.get(taskId)?.isReady() ?? false;
  }

  async ensureTaskRuntime(taskId: string, ctx?: OnBeforeStartContext): Promise<void> {
    if (!taskId || this.disposed) return;
    this.clearCleanupTimer(taskId);
    const runtime = this.getOrCreateRuntime(taskId);
    if (ctx) {
      runtime.setContext(ctx);
    }
    await runtime.start();
  }

  async waitForServerUrl(taskId: string): Promise<string | undefined> {
    if (!taskId || this.disposed) return undefined;
    this.clearCleanupTimer(taskId);
    return this.runtimes.get(taskId)?.waitForServerUrl();
  }

  scheduleTaskRuntimeCleanup(taskId: string, delayMs = TASK_RUNTIME_IDLE_CLEANUP_MS): void {
    if (!taskId || this.disposed || !this.runtimes.has(taskId)) return;
    this.clearCleanupTimer(taskId);
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(taskId);
      void this.destroyTaskRuntime(taskId).catch((error) => {
        log.warn(
          `[OpenCode Server] Failed to clean up task runtime ${taskId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, delayMs);
    this.cleanupTimers.set(taskId, timer);
  }

  async destroyTaskRuntime(taskId: string): Promise<void> {
    const runtime = this.runtimes.get(taskId);
    if (!runtime) return;
    this.clearCleanupTimer(taskId);
    this.runtimes.delete(taskId);
    runtime.abortStart();
    await runtime.stop();
    await runtime.waitForStartToSettle();
  }

  async destroyAllTaskRuntimes(): Promise<void> {
    const taskIds = [...this.runtimes.keys()];
    await Promise.all(taskIds.map((taskId) => this.destroyTaskRuntime(taskId)));
  }

  async invalidate(): Promise<void> {
    if (this.disposed) return;
    log.info('[OpenCode Server] Invalidating all task runtimes...');
    await this.destroyAllTaskRuntimes();
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }

  /**
   * Returns a closure suitable for `TaskAdapterOptions.getServerUrl`.
   * Used by the daemon when constructing the adapter: the adapter calls this
   * every task start to get its runtime URL.
   */
  getServerUrlResolver(): (taskId: string) => Promise<string | undefined> {
    return async (taskId: string) => this.waitForServerUrl(taskId);
  }

  private getOrCreateRuntime(taskId: string): OpenCodeTaskRuntime {
    this.clearCleanupTimer(taskId);
    const existing = this.runtimes.get(taskId);
    if (existing) return existing;
    const runtime = new OpenCodeTaskRuntime(taskId, this.deps);
    this.runtimes.set(taskId, runtime);
    return runtime;
  }

  private clearCleanupTimer(taskId: string): void {
    const timer = this.cleanupTimers.get(taskId);
    if (!timer) return;
    clearTimeout(timer);
    this.cleanupTimers.delete(taskId);
  }
}

// ──────────────────────────── transient client (OAuth / Phase 4a) ──────────

/**
 * Start a short-lived `opencode serve` instance and return an SDK client
 * bound to it. Used by the OAuth daemon RPC (Phase 4a) which needs to drive
 * the SDK auth flow once per login attempt and then tear down.
 *
 * NOT used by the task-execution path — tasks use `OpenCodeServerManager`
 * directly so runtimes can be pooled / cleaned up per-task.
 */
export async function createTransientOpencodeClient(
  deps: ServerManagerDeps,
  signal?: AbortSignal,
): Promise<{ client: OpencodeClient; close: () => void }> {
  throwIfStartAborted(signal);
  // No task context for the OAuth flow — pass an empty ctx. The daemon's
  // onBeforeStart uses this to skip workspace/config-filename specifics and
  // write the default `opencode.json` for OAuth.
  const { env: runtimeEnv } = await onBeforeStart(deps.storage, deps, {});
  throwIfStartAborted(signal);
  const server = await spawnOpenCodeServer(runtimeEnv, deps, signal);
  return {
    client: createOpencodeClient({ baseUrl: server.url }),
    close: () => server.close(),
  };
}
