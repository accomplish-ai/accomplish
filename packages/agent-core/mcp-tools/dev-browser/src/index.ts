import express, { type Express, type Request, type Response } from 'express';
import { chromium, type BrowserContext } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { Socket } from 'net';
import type {
  ServeOptions,
  GetPageRequest,
  GetPageResponse,
  ListPagesResponse,
  ServerInfoResponse,
} from './types.js';
import { fetchWithRetry, respondInternalError } from './browser-runtime-utils.js';
import { withPreservedForeground } from './foreground-application.js';
import { BrowserPageService } from './browser-page-service.js';

export type { ServeOptions, GetPageResponse, ListPagesResponse, ServerInfoResponse };

export interface DevBrowserServer {
  wsEndpoint: string;
  port: number;
  stop: () => Promise<void>;
}

export async function serve(options: ServeOptions = {}): Promise<DevBrowserServer> {
  const port = options.port ?? parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
  const headless = options.headless ?? false;
  const cdpPort = options.cdpPort ?? parseInt(process.env.DEV_BROWSER_CDP_PORT || '9225', 10);
  const profileDir = options.profileDir ?? process.env.DEV_BROWSER_PROFILE;
  const useSystemChrome = options.useSystemChrome ?? true;

  const baseProfileDir = profileDir ?? join(process.cwd(), '.browser-data');

  // ─── Lazy Chrome launch ───────────────────────────────────────────────────
  // Chrome is NOT started here. It starts on the first POST /pages request so
  // no Chrome window appears for tasks that never use the browser.

  let _wsEndpoint = '';
  let _browserContext: BrowserContext | null = null;
  let _launchPromise: Promise<BrowserContext> | null = null;

  async function launchBrowserContext(): Promise<BrowserContext> {
    let browserContext: BrowserContext;
    let usedSystemChrome = false;

    try {
      if (useSystemChrome) {
        try {
          console.log('Trying to use system Chrome...');
          const chromeUserDataDir = join(baseProfileDir, 'chrome-profile');
          mkdirSync(chromeUserDataDir, { recursive: true });
          browserContext = await chromium.launchPersistentContext(chromeUserDataDir, {
            headless,
            channel: 'chrome',
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
              `--remote-debugging-port=${cdpPort}`,
              '--remote-debugging-address=127.0.0.1',
              '--disable-blink-features=AutomationControlled',
            ],
          });
          usedSystemChrome = true;
          console.log('Using system Chrome');
        } catch {
          console.log('System Chrome not available, falling back to Playwright Chromium...');
        }
      }

      if (!usedSystemChrome) {
        const playwrightUserDataDir = join(baseProfileDir, 'playwright-profile');
        mkdirSync(playwrightUserDataDir, { recursive: true });
        browserContext = await chromium.launchPersistentContext(playwrightUserDataDir, {
          headless,
          ignoreDefaultArgs: ['--enable-automation'],
          args: [
            `--remote-debugging-port=${cdpPort}`,
            '--remote-debugging-address=127.0.0.1',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      }

      const cdpResponse = await fetchWithRetry(`http://127.0.0.1:${cdpPort}/json/version`);
      const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
      // Normalize to 127.0.0.1 — Chrome may report "localhost" which resolves to ::1 (IPv6)
      // on macOS Sequoia/Tahoe, breaking connectOverCDP and the browser preview.
      _wsEndpoint = cdpInfo.webSocketDebuggerUrl.replace(
        /^(wss?:\/\/)localhost(:\d+)/,
        '$1127.0.0.1$2',
      );
      console.log(`CDP WebSocket endpoint: ${_wsEndpoint}`);

      _browserContext = browserContext!;

      // Attach any startup page (blank tab Chrome opens on launch)
      const startupPages = browserContext!.pages();
      const blankStartup = startupPages.find((p) => p.url() === 'about:blank') ?? null;
      if (blankStartup) {
        pageService.attachStartupPage(blankStartup);
        // Minimize the blank startup tab immediately so no Chrome window appears.
        // Fire-and-forget: a CDP timing error here (Browser.getWindowForTarget not yet ready)
        // must NOT reject _launchPromise — that would make every subsequent POST /pages
        // throw immediately with a 500.  Window minimization is best-effort.
        void pageService.backgroundPage(blankStartup, browserContext!).catch(() => {});
      }

      // Reset cached state when the browser context closes so ensureBrowserContext()
      // retries on the next call instead of returning a stale resolved promise.
      browserContext!.on('close', () => {
        console.log('Browser context closed.');
        _launchPromise = null;
        _browserContext = null;
        _wsEndpoint = '';
      });

      return browserContext!;
    } catch (error) {
      // Reset so the next ensureBrowserContext() call retries Chrome launch
      // instead of immediately re-throwing from a permanently-rejected promise.
      _launchPromise = null;
      _browserContext = null;
      _wsEndpoint = '';
      throw error;
    }
  }

  function ensureBrowserContext(): Promise<BrowserContext> {
    if (!_launchPromise) {
      _launchPromise = launchBrowserContext();
    }
    return _launchPromise;
  }

  // ─── Page service ─────────────────────────────────────────────────────────

  const pageService = new BrowserPageService({
    headless,
    ensureBrowserContext,
    withPreservedForeground,
  });

  const app: Express = express();
  app.use(express.json());

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get('/', (_req: Request, res: Response) => {
    const response: ServerInfoResponse = {
      wsEndpoint: _wsEndpoint,
      browserReady: !!_browserContext,
    };
    res.json(response);
  });

  // ─── Page list ─────────────────────────────────────────────────────────────
  app.get('/pages', (_req: Request, res: Response) => {
    const response: ListPagesResponse = { pages: pageService.listPageNames() };
    res.json(response);
  });

  // ─── Create / get page ─────────────────────────────────────────────────────
  app.post('/pages', async (req: Request, res: Response) => {
    try {
      const body = req.body as GetPageRequest;
      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({ error: 'name is required and must be a string' });
        return;
      }
      const ensured = await pageService.ensurePage(body);
      const response: GetPageResponse = {
        wsEndpoint: _wsEndpoint,
        name: ensured.name,
        targetId: ensured.targetId,
        created: ensured.created,
      };
      res.json(response);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Open external URL in unfocused tab ────────────────────────────────────
  app.post('/pages/open-external', async (req: Request, res: Response) => {
    try {
      const { url } = req.body as { url: string };
      if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
      }
      try {
        // Validate URL format
        new URL(url);
      } catch {
        res.status(400).json({ error: 'invalid url' });
        return;
      }
      await pageService.openExternalPage(url);
      res.json({ success: true });
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Release page (remember URL, close tab) ────────────────────────────────
  app.post('/pages/:name/release', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const released = await pageService.releasePage(name);
      res.json({ success: released });
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Delete page ───────────────────────────────────────────────────────────
  app.delete('/pages/:name', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const deleted = await pageService.deletePage(name);
      if (!deleted) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Page state ────────────────────────────────────────────────────────────
  app.get('/pages/:name/state', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.readPageState(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Navigate ──────────────────────────────────────────────────────────────
  app.post('/pages/:name/navigate', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const { url } = req.body as { url: string };
      // Validate url
      let valid = false;
      if (typeof url === 'string') {
        try {
          new URL(url);
          valid = true;
        } catch (_e) {
          // invalid URL — valid stays false
        }
      }
      if (!valid) {
        res.status(400).json({ error: 'invalid url' });
        return;
      }
      const state = await pageService.navigatePage(name, url);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── History navigation ────────────────────────────────────────────────────
  app.post('/pages/:name/back', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.goBack(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  app.post('/pages/:name/forward', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.goForward(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Reload ────────────────────────────────────────────────────────────────
  app.post('/pages/:name/reload', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.reloadPage(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Focus page ────────────────────────────────────────────────────────────
  app.post('/pages/:name/focus', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.focusPage(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Background page (minimize OS window) ─────────────────────────────────
  app.post('/pages/:name/background', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const state = await pageService.backgroundPageByName(name);
      if (!state) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.json(state);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Screenshot (JPEG binary) ──────────────────────────────────────────────
  app.get('/pages/:name/screenshot', async (req: Request<{ name: string }>, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const quality = parseInt(String(req.query['quality'] ?? '70'), 10);
      const buffer = await pageService.capturePageScreenshot(name, quality);
      if (!buffer) {
        res.status(404).json({ error: 'page not found' });
        return;
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(buffer);
    } catch (error) {
      respondInternalError(res, error);
    }
  });

  // ─── Graceful shutdown endpoint ───────────────────────────────────────────
  app.post('/shutdown', (_req: Request, res: Response) => {
    res.json({ ok: true });
    void cleanup().then(() => process.exit(0));
  });

  // ─── HTTP server + graceful shutdown ──────────────────────────────────────
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`dev-browser HTTP server running on port ${port}`);
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
    await pageService.closeAllPages();
    if (_browserContext) {
      try {
        await _browserContext.close();
      } catch {
        // intentionally empty
      }
    }
    server.close();
    console.log('Server stopped.');
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
  process.on('exit', () => {
    if (_browserContext) {
      try {
        _browserContext.close();
      } catch {
        /* intentionally empty */
      }
    }
  });

  const removeHandlers = () => {
    signals.forEach((sig) => process.off(sig, signalHandler));
    process.off('uncaughtException', errorHandler);
    process.off('unhandledRejection', errorHandler);
  };

  return {
    get wsEndpoint() {
      return _wsEndpoint;
    },
    port,
    async stop() {
      removeHandlers();
      await cleanup();
    },
  };
}
