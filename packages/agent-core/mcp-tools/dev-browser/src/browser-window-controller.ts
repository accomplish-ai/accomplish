import type { BrowserContext, CDPSession, Page } from 'playwright';
import { isClosedPageError, withTimeout } from './browser-runtime-utils.js';
import type { BrowserWindowBounds, BrowserWindowState } from './browser-page-service-state.js';

export interface BrowserWindowControllerOptions {
  headless: boolean;
  ensureBrowserContext: () => Promise<BrowserContext>;
  withPreservedForeground: <T>(operation: () => Promise<T>) => Promise<T>;
}

export class BrowserWindowController {
  constructor(private readonly options: BrowserWindowControllerOptions) {}

  async getTargetId(page: Page, browserContext?: BrowserContext): Promise<string> {
    const activeContext = browserContext ?? (await this.options.ensureBrowserContext());
    const cdpSession = await activeContext.newCDPSession(page);
    try {
      const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
      return targetInfo.targetId;
    } finally {
      await cdpSession.detach();
    }
  }

  async backgroundPage(page: Page, browserContext?: BrowserContext): Promise<void> {
    if (this.options.headless) {
      return;
    }
    // Retry a few times with backoff: Browser.getWindowForTarget is not always ready
    // immediately after Chrome launches, especially on macOS with system Chrome.
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 500;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await this.setWindowStateForPage(page, 'minimized', undefined, browserContext);
        return;
      } catch (error) {
        lastError = error;
        if (isClosedPageError(error)) {
          throw error;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async setNormalWindowState(
    page: Page,
    targetId: string,
    browserContext: BrowserContext,
  ): Promise<void> {
    await this.setWindowStateForPage(page, 'normal', targetId, browserContext);
  }

  async restorePageWithoutForeground(
    page: Page,
    targetId: string,
    browserContext: BrowserContext,
  ): Promise<void> {
    if (this.options.headless) {
      return;
    }
    await this.options.withPreservedForeground(async () => {
      await this.setWindowStateForPage(page, 'normal', targetId, browserContext);
    });
  }

  async focusPreparedPage(
    page: Page,
    targetId: string,
    browserContext: BrowserContext,
    timeoutMessage: string,
  ): Promise<void> {
    await this.prepareForegroundedWindow(page, targetId, browserContext);
    await withTimeout(page.bringToFront(), 15000, timeoutMessage);
  }

  private async prepareForegroundedWindow(
    page: Page,
    targetId: string,
    browserContext: BrowserContext,
  ): Promise<void> {
    await this.setWindowStateForPage(page, 'normal', targetId, browserContext);
    if (this.options.headless) {
      return;
    }
    await this.syncWindowToViewport(page, targetId, browserContext);
  }

  private async syncWindowToViewport(
    page: Page,
    targetId: string,
    browserContext: BrowserContext,
  ): Promise<void> {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    await this.setWindowContentsSizeForPage(
      page,
      viewport.width,
      viewport.height,
      targetId,
      browserContext,
    ).catch((error) => {
      if (isClosedPageError(error)) throw error;
      console.warn('[syncWindowToViewport] setWindowContentsSizeForPage failed', {
        targetId,
        viewport,
        pageId: page?.id?.(),
        error,
      });
    });
    await this.normalizeWindowBoundsForPage(
      page,
      viewport.width,
      viewport.height,
      targetId,
      browserContext,
    ).catch((error) => {
      if (isClosedPageError(error)) throw error;
      console.warn('[syncWindowToViewport] normalizeWindowBoundsForPage failed', {
        targetId,
        viewport,
        pageId: page?.id?.(),
        error,
      });
    });
  }

  private async withBrowserWindowForPage<T>(
    page: Page,
    operation: (
      cdpSession: CDPSession,
      windowId: number,
      bounds: BrowserWindowBounds,
    ) => Promise<T>,
    targetId?: string,
    browserContext?: BrowserContext,
  ): Promise<T> {
    const activeContext = browserContext ?? (await this.options.ensureBrowserContext());
    const cdpSession = await activeContext.newCDPSession(page);
    try {
      const resolvedTargetId =
        targetId ??
        ((await cdpSession.send('Target.getTargetInfo')) as { targetInfo: { targetId: string } })
          .targetInfo.targetId;
      const { windowId, bounds } = (await cdpSession.send('Browser.getWindowForTarget', {
        targetId: resolvedTargetId,
      })) as { windowId: number; bounds?: BrowserWindowBounds };
      return await operation(cdpSession, windowId, bounds ?? {});
    } finally {
      await cdpSession.detach().catch(() => {});
    }
  }

  private async setWindowStateForPage(
    page: Page,
    windowState: BrowserWindowState,
    targetId?: string,
    browserContext?: BrowserContext,
  ): Promise<void> {
    await this.withBrowserWindowForPage(
      page,
      async (cdpSession, windowId) => {
        await cdpSession.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
      },
      targetId,
      browserContext,
    );
  }

  private async setWindowBoundsForPage(
    page: Page,
    bounds: BrowserWindowBounds,
    targetId?: string,
    browserContext?: BrowserContext,
  ): Promise<void> {
    await this.withBrowserWindowForPage(
      page,
      async (cdpSession, windowId) => {
        await cdpSession.send('Browser.setWindowBounds', { windowId, bounds });
      },
      targetId,
      browserContext,
    );
  }

  private async setWindowContentsSizeForPage(
    page: Page,
    width: number,
    height: number,
    targetId?: string,
    browserContext?: BrowserContext,
  ): Promise<void> {
    await this.withBrowserWindowForPage(
      page,
      async (cdpSession, windowId) => {
        await cdpSession.send('Browser.setContentsSize', { windowId, width, height });
      },
      targetId,
      browserContext,
    );
  }

  private clampWindowSizeDelta(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private async normalizeWindowBoundsForPage(
    page: Page,
    width: number,
    height: number,
    targetId?: string,
    browserContext?: BrowserContext,
  ): Promise<void> {
    await this.withBrowserWindowForPage(
      page,
      async (_cdpSession, _windowId, bounds) => {
        const desiredWidth =
          width + this.clampWindowSizeDelta((bounds.width ?? width) - width, 0, 64);
        const desiredHeight =
          height + this.clampWindowSizeDelta((bounds.height ?? height) - height, 80, 220);
        await this.setWindowBoundsForPage(
          page,
          { width: desiredWidth, height: desiredHeight },
          targetId,
          browserContext,
        );
      },
      targetId,
      browserContext,
    );
  }
}
