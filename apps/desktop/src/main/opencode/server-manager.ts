/**
 * ServerManager - Manages the lifecycle of a single `opencode serve` process.
 *
 * Uses the SDK's createOpencodeServer() for spawning and stdout-based readiness
 * detection, then wraps it with crash recovery (health monitoring + exponential
 * backoff restart) and graceful disposal.
 */

import { createOpencodeServer, createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import path from 'path';
import fs from 'fs';
import { getOpenCodeCliPath } from './cli-path';
import { getBundledNodePaths } from '../utils/bundled-node';
import { getExtendedNodePath } from '../utils/system-path';
import { getAllApiKeys } from '../store/secureStorage';

export type ServerState = 'stopped' | 'starting' | 'ready' | 'error';

interface ServerManagerEvents {
  'state-change': [ServerState];
  'error': [Error];
}

/** Default port for opencode serve */
const DEFAULT_PORT = 4096;

/** Max restart attempts before giving up */
const MAX_RESTART_ATTEMPTS = 5;

/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 1000;

/** Max backoff delay (ms) */
const BACKOFF_MAX_MS = 30000;

/** Interval for post-startup health monitoring (ms) */
const HEALTH_MONITOR_INTERVAL_MS = 5000;

/**
 * Check if a port is available by attempting to connect.
 * Returns true if the port is free (connection refused = nothing listening).
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false); // Port is in use
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(true); // Port is free
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(true); // Timeout = nothing listening
    });
  });
}

/**
 * Find an available port starting from the given port.
 * Tries up to maxAttempts consecutive ports.
 */
async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  // Fall back to the start port and let the server fail with a clear error
  return startPort;
}

export class ServerManager extends EventEmitter<ServerManagerEvents> {
  private server: { url: string; close(): void } | null = null;
  private client: OpencodeClient | null = null;
  private state: ServerState = 'stopped';
  private password: string = '';
  private port: number = DEFAULT_PORT;
  private restartAttempts: number = 0;
  private disposed: boolean = false;
  private healthMonitorTimer: ReturnType<typeof setInterval> | null = null;

  getState(): ServerState {
    return this.state;
  }

  getClient(): OpencodeClient {
    if (!this.client || this.state !== 'ready') {
      throw new Error('Server is not ready. Current state: ' + this.state);
    }
    return this.client;
  }

  /**
   * Start the opencode serve process.
   * Ensures PATH includes the bundled CLI and Node.js directories,
   * then delegates to the SDK's createOpencodeServer().
   */
  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') {
      return;
    }

    this.disposed = false;
    this.restartAttempts = 0;
    this.setupPath();
    await this.setupApiKeys();
    await this.launchServer();
  }

  /**
   * Add bundled CLI and Node.js directories to process.env.PATH (once).
   * The SDK's createOpencodeServer() spreads process.env into the child,
   * so this is all we need for the spawned process to find its dependencies.
   */
  private setupPath(): void {
    const { command } = getOpenCodeCliPath();
    const cliDir = path.dirname(command);
    const delimiter = process.platform === 'win32' ? ';' : ':';

    const dirsToAdd: string[] = [cliDir];

    const bundledPaths = getBundledNodePaths();
    if (bundledPaths) {
      dirsToAdd.push(bundledPaths.binDir);
      process.env.NODE_BIN_PATH = bundledPaths.binDir;
    }

    const extendedPath = getExtendedNodePath();
    if (extendedPath) {
      dirsToAdd.push(extendedPath);
    }

    const currentPath = process.env.PATH || '';
    const currentDirs = new Set(currentPath.split(delimiter));
    const newDirs = dirsToAdd.filter(d => !currentDirs.has(d));

    if (newDirs.length > 0) {
      process.env.PATH = `${newDirs.join(delimiter)}${delimiter}${currentPath}`;
    }
  }

  /**
   * Read API keys from secure storage and set them as environment
   * variables so the spawned opencode serve process inherits them.
   * This restores the behavior of the deleted PTY adapter's buildEnvironment().
   */
  private async setupApiKeys(): Promise<void> {
    const apiKeys = await getAllApiKeys();

    // Standard provider API keys
    if (apiKeys.anthropic) process.env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    if (apiKeys.openai) process.env.OPENAI_API_KEY = apiKeys.openai;
    if (apiKeys.google) process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
    if (apiKeys.xai) process.env.XAI_API_KEY = apiKeys.xai;
    if (apiKeys.deepseek) process.env.DEEPSEEK_API_KEY = apiKeys.deepseek;
    if (apiKeys.openrouter) process.env.OPENROUTER_API_KEY = apiKeys.openrouter;
    if (apiKeys.minimax) process.env.MINIMAX_API_KEY = apiKeys.minimax;

    // Bedrock: Set AWS credentials as env vars
    if (apiKeys.bedrock) {
      try {
        const creds = JSON.parse(apiKeys.bedrock);
        if (creds.authType === 'accessKeys') {
          process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
          process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
          if (creds.sessionToken) process.env.AWS_SESSION_TOKEN = creds.sessionToken;
          if (creds.region) process.env.AWS_REGION = creds.region;
        } else if (creds.authType === 'profile') {
          if (creds.profileName) process.env.AWS_PROFILE = creds.profileName;
          if (creds.region) process.env.AWS_REGION = creds.region;
        }
      } catch {
        console.warn('[ServerManager] Failed to parse Bedrock credentials');
      }
    }

    console.log('[ServerManager] API keys loaded into environment');
  }

  /**
   * Build the Basic Auth header value for the current password.
   * The opencode server uses HTTP Basic Auth with username "opencode".
   */
  private get basicAuthHeader(): string {
    return `Basic ${Buffer.from(`opencode:${this.password}`).toString('base64')}`;
  }

  /**
   * Launch the server using the SDK's createOpencodeServer().
   * This waits for the process's own stdout readiness signal
   * ("opencode server listening on ...") rather than polling /health,
   * which guarantees the spawned process is the one that's ready.
   */
  private async launchServer(): Promise<void> {
    this.setState('starting');

    // New password per launch so each server instance has unique auth
    this.password = randomUUID();
    process.env.OPENCODE_SERVER_PASSWORD = this.password;

    // Read the config file that generateOpenCodeConfig() already wrote
    const configPath = process.env.OPENCODE_CONFIG;
    let config = {};
    if (configPath && fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    this.port = await findAvailablePort(DEFAULT_PORT);
    if (this.port !== DEFAULT_PORT) {
      console.log(`[ServerManager] Port ${DEFAULT_PORT} in use, using port ${this.port}`);
    }
    console.log(`[ServerManager] Starting opencode serve on port ${this.port}`);

    const server = await createOpencodeServer({
      port: this.port,
      hostname: '127.0.0.1',
      timeout: 15000,
      config: config as Parameters<typeof createOpencodeServer>[0] extends { config?: infer C } ? C : never,
    });

    this.server = server;

    // The opencode server uses HTTP Basic Auth (username: "opencode", password from env).
    // The SDK's `auth` config option requires security annotations in the generated code,
    // which this SDK version doesn't include. Set the Authorization header directly.
    this.client = createOpencodeClient({
      baseUrl: server.url,
      headers: { 'Authorization': this.basicAuthHeader },
    });

    this.setState('ready');
    console.log(`[ServerManager] Server ready at ${server.url}`);

    // Monitor for post-startup crashes via periodic health checks
    this.startHealthMonitor();
  }

  /**
   * Periodically check the server is still alive.
   * The SDK doesn't expose process exit events after startup,
   * so we poll /health to detect crashes and trigger restart.
   */
  private startHealthMonitor(): void {
    this.stopHealthMonitor();

    this.healthMonitorTimer = setInterval(async () => {
      if (this.state !== 'ready' || !this.server) return;

      try {
        const res = await fetch(`${this.server.url}/health`, {
          headers: { 'Authorization': this.basicAuthHeader },
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) throw new Error(`Health returned ${res.status}`);
      } catch {
        console.log('[ServerManager] Health check failed, server may have crashed');
        this.handleCrash();
      }
    }, HEALTH_MONITOR_INTERVAL_MS);
  }

  private stopHealthMonitor(): void {
    if (this.healthMonitorTimer) {
      clearInterval(this.healthMonitorTimer);
      this.healthMonitorTimer = null;
    }
  }

  /**
   * Handle a detected server crash: clean up state and attempt restart
   * with exponential backoff.
   */
  private async handleCrash(): Promise<void> {
    this.stopHealthMonitor();
    this.server = null;
    this.client = null;
    this.setState('error');

    while (!this.disposed && this.restartAttempts < MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++;
      const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, this.restartAttempts - 1), BACKOFF_MAX_MS);
      console.log(`[ServerManager] Restarting in ${delay}ms (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})`);

      await new Promise(resolve => setTimeout(resolve, delay));
      if (this.disposed) return;

      try {
        await this.launchServer();
        this.restartAttempts = 0;
        return;
      } catch (err) {
        console.error('[ServerManager] Restart failed:', err);
      }
    }

    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      console.error(`[ServerManager] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
      this.emit('error', new Error('Server failed to restart after maximum attempts'));
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopHealthMonitor();

    // Graceful SDK shutdown (tells the server to clean up)
    if (this.client && this.state === 'ready') {
      try {
        await Promise.race([
          this.client.instance.dispose(),
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Ignore errors during shutdown
      }
    }

    // Kill the server process
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.client = null;
    this.setState('stopped');
    console.log('[ServerManager] Disposed');
  }

  private setState(state: ServerState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state-change', state);
    }
  }
}

// Singleton
let serverManagerInstance: ServerManager | null = null;

export function getServerManager(): ServerManager {
  if (!serverManagerInstance) {
    serverManagerInstance = new ServerManager();
  }
  return serverManagerInstance;
}

export function disposeServerManager(): Promise<void> {
  if (serverManagerInstance) {
    const promise = serverManagerInstance.dispose();
    serverManagerInstance = null;
    return promise;
  }
  return Promise.resolve();
}
