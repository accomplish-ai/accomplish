import express, { type Express, type Request, type Response } from 'express';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { Socket } from 'net';
import type {
  ServeOptions,
  GetPageRequest,
  GetPageResponse,
  ListPagesResponse,
  ServerInfoResponse,
} from './types';

export type { ServeOptions, GetPageResponse, ListPagesResponse, ServerInfoResponse };

export interface DevBrowserServer {
  wsEndpoint: string;
  port: number;
  stop: () => Promise<void>;
}

async function fetchWithRetry(
  url: string,
  maxRetries = 5,
  delayMs = 500,
): Promise<globalThis.Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${message}`)), ms),
    ),
  ]);
}

export async function serve(options: ServeOptions = {}): Promise<DevBrowserServer> {
  const port = options.port ?? parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
  const headless = options.headless ?? false;
  const cdpPort = options.cdpPort ?? parseInt(process.env.DEV_BROWSER_CDP_PORT || '9225', 10);
  const profileDir = options.profileDir ?? process.env.DEV_BROWSER_PROFILE;
  const useSystemChrome = options.useSystemChrome ?? true;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Must be a number between 1 and 65535`);
  }
  if (!Number.isFinite(cdpPort) || cdpPort < 1 || cdpPort > 65535) {
    throw new Error(`Invalid cdpPort: ${cdpPort}. Must be a number between 1 and 65535`);
  }
  if (port === cdpPort) {
    throw new Error('port and cdpPort must be different');
  }

  const baseProfileDir = profileDir ?? join(process.cwd(), '.browser-data');

  let context: BrowserContext;
  let usedSystemChrome = false;

  if (useSystemChrome) {
    try {
      console.log('Trying to use system Chrome...');
      const chromeUserDataDir = join(baseProfileDir, 'chrome-profile');
      mkdirSync(chromeUserDataDir, { recursive: true });

      context = await chromium.launchPersistentContext(chromeUserDataDir, {
        headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--remote-debugging-port=${cdpPort}`,
          '--disable-blink-features=AutomationControlled',
        ],
      });
      usedSystemChrome = true;
      console.log('Using system Chrome (fast startup!)');
    } catch (_chromeError) {
      console.log('System Chrome not available, falling back to Playwright Chromium...');
    }
  }

  if (!usedSystemChrome) {
    const playwrightUserDataDir = join(baseProfileDir, 'playwright-profile');
    mkdirSync(playwrightUserDataDir, { recursive: true });

    console.log('Launching browser with Playwright Chromium...');
    context = await chromium.launchPersistentContext(playwrightUserDataDir, {
      headless,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [`--remote-debugging-port=${cdpPort}`, '--disable-blink-features=AutomationControlled'],
    });
    console.log('Browser launched with Playwright Chromium');
  }

  console.log('Browser launched with persistent profile...');

  context.on('close', () => {
    console.log('Browser context closed (user may have closed Chrome). Exiting server...');
    process.exit(0);
  });

  const cdpResponse = await fetchWithRetry(`http://127.0.0.1:${cdpPort}/json/version`);
  const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
  const wsEndpoint = cdpInfo.webSocketDebuggerUrl;
  console.log(`CDP WebSocket endpoint: ${wsEndpoint}`);

  interface PageEntry {
    page: Page;
    targetId: string;
  }

  const registry = new Map<string, PageEntry>();

  async function getTargetId(page: Page): Promise<string> {
    const cdpSession = await context.newCDPSession(page);
    try {
      const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
      return targetInfo.targetId;
    } finally {
      await cdpSession.detach();
    }
  }

  const app: Express = express();
  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    const response: ServerInfoResponse = { wsEndpoint };
    res.json(response);
  });

  app.get('/pages', (_req: Request, res: Response) => {
    const response: ListPagesResponse = {
      pages: Array.from(registry.keys()),
    };
    res.json(response);
  });

  app.post('/pages', async (req: Request, res: Response) => {
    const body = req.body as GetPageRequest;
    const { name, viewport } = body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' });
      return;
    }

    if (name.length === 0) {
      res.status(400).json({ error: 'name cannot be empty' });
      return;
    }

    if (name.length > 256) {
      res.status(400).json({ error: 'name must be 256 characters or less' });
      return;
    }

    let entry = registry.get(name);
    if (!entry) {
      const page = await withTimeout(context.newPage(), 30000, 'Page creation timed out after 30s');

      if (viewport) {
        await page.setViewportSize(viewport);
      }

      const targetId = await getTargetId(page);
      entry = { page, targetId };
      registry.set(name, entry);

      page.on('close', () => {
        registry.delete(name);
      });
    }

    const response: GetPageResponse = { wsEndpoint, name, targetId: entry.targetId };
    res.json(response);
  });

  app.delete('/pages/:name', async (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);

    if (entry) {
      await entry.page.close();
      registry.delete(name);
      res.json({ success: true });
      return;
    }

    res.status(404).json({ error: 'page not found' });
  });

  const server = app.listen(port, () => {
    console.log(`HTTP API server running on port ${port}`);
  });

  const connections = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
  });

  let cleaningUp = false;

  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;

    console.log('\nShutting down...');

    for (const socket of connections) {
      socket.destroy();
    }
    connections.clear();

    for (const entry of registry.values()) {
      try {
        await entry.page.close();
      } catch {
        // intentionally empty
      }
    }
    registry.clear();

    try {
      await context.close();
    } catch {
      // intentionally empty
    }

    server.close();
    console.log('Server stopped.');
  };

  const syncCleanup = () => {
    try {
      context.close();
    } catch {
      // intentionally empty
    }
  };

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

  const signalHandler = async () => {
    await cleanup();
    process.exit(0);
  };

  const errorHandler = async (err: unknown) => {
    console.error('Unhandled error:', err);
    await cleanup();
    process.exit(1);
  };

  signals.forEach((sig) => process.on(sig, signalHandler));
  process.on('uncaughtException', errorHandler);
  process.on('unhandledRejection', errorHandler);
  process.on('exit', syncCleanup);

  const removeHandlers = () => {
    signals.forEach((sig) => process.off(sig, signalHandler));
    process.off('uncaughtException', errorHandler);
    process.off('unhandledRejection', errorHandler);
    process.off('exit', syncCleanup);
  };

  return {
    wsEndpoint,
    port,
    async stop() {
      removeHandlers();
      await cleanup();
    },
  };
}
