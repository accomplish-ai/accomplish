import type { BrowserContext, Page } from 'playwright';
import { isClosedPageError, withTimeout } from './browser-runtime-utils.js';
import { navigatePageToUrl } from './browser-page-navigator.js';
import {
  selectReusableStartupPage,
  type CreatedTaskPage,
  type TaskPageLaunchMode,
} from './browser-page-service-state.js';
import { BrowserWindowController } from './browser-window-controller.js';
import { isReusableStartupPageUrl } from './navigation-url.js';
import type { ViewportSize } from './types.js';

export interface BrowserTaskPageFactoryOptions {
  headless: boolean;
  ensureBrowserContext: () => Promise<BrowserContext>;
  withPreservedForeground: <T>(operation: () => Promise<T>) => Promise<T>;
  windowController: BrowserWindowController;
}

export class BrowserTaskPageFactory {
  private reusableStartupPage: Page | null = null;
  private readonly startupCloseHandlers = new WeakMap<Page, () => void>();

  constructor(private readonly options: BrowserTaskPageFactoryOptions) {}

  attachStartupPage(page: Page | null): void {
    if (page && isReusableStartupPageUrl(page.url())) {
      // Remove any existing handler for this page before adding a new one
      // to prevent accumulation when the same page is recycled multiple times.
      const prevHandler = this.startupCloseHandlers.get(page);
      if (prevHandler) {
        page.off('close', prevHandler);
      }
      this.reusableStartupPage = page;
      const closeHandler = () => {
        if (this.reusableStartupPage === page) {
          this.reusableStartupPage = null;
        }
        this.startupCloseHandlers.delete(page);
      };
      this.startupCloseHandlers.set(page, closeHandler);
      page.once('close', closeHandler);
      return;
    }
    this.reusableStartupPage = null;
  }

  async acquirePageForExternalOpen(browserContext: BrowserContext): Promise<Page> {
    const reusableStartupPage = this.takeReusableStartupPage();
    if (reusableStartupPage) {
      return reusableStartupPage;
    }
    return withTimeout(browserContext.newPage(), 30000, 'Page creation timed out after 30s');
  }

  reset(): void {
    this.reusableStartupPage = null;
  }

  async closeReusableStartupPage(): Promise<void> {
    const page = this.takeReusableStartupPage();
    if (!page) {
      return;
    }
    try {
      await page.close();
    } catch {
      // Ignore errors when closing the reusable startup page
    }
  }

  private takeReusableStartupPage(): Page | null {
    if (!this.reusableStartupPage || this.reusableStartupPage.isClosed()) {
      this.reusableStartupPage = null;
      return null;
    }
    const startupPage = this.reusableStartupPage;
    this.reusableStartupPage = null;
    return startupPage;
  }

  async createTaskPage(options: {
    activeTaskPageCount: number;
    browserContext: BrowserContext;
    initialUrl?: string;
    launchMode: TaskPageLaunchMode;
    name: string;
    viewport?: ViewportSize;
  }): Promise<CreatedTaskPage> {
    const launchMode = this.options.headless ? 'background-normal' : options.launchMode;
    const openPages = options.browserContext.pages().filter((candidate) => !candidate.isClosed());
    const reusableStartupPage = selectReusableStartupPage(
      this.reusableStartupPage,
      options.activeTaskPageCount,
      openPages,
    );

    if (reusableStartupPage) {
      this.reusableStartupPage = null;
      return this.createTaskPageFromReusableStartupPage({
        browserContext: options.browserContext,
        initialUrl: options.initialUrl,
        launchMode,
        name: options.name,
        page: reusableStartupPage,
        viewport: options.viewport,
      });
    }

    this.clearUnavailableReusableStartupPage(options.activeTaskPageCount);
    const anchorPage = openPages[0];

    if (this.options.headless || !anchorPage) {
      return this.createStandaloneTaskPage({
        browserContext: options.browserContext,
        initialUrl: options.initialUrl,
        launchMode,
        name: options.name,
        viewport: options.viewport,
      });
    }

    return this.createAnchoredTaskPage({
      anchorPage,
      browserContext: options.browserContext,
      initialUrl: options.initialUrl,
      launchMode,
      viewport: options.viewport,
    });
  }

  async recycleOrClosePage(page: Page): Promise<void> {
    if (page.isClosed()) {
      return;
    }
    const pageContext = page.context();
    if (!(await this.isLastOpenPage(page, pageContext))) {
      await page.close();
      return;
    }
    try {
      await this.prepareReusableStartupPage(page, pageContext);
    } catch (error) {
      if (!isClosedPageError(error)) {
        await page.close().catch(() => {});
      }
    }
  }

  private clearUnavailableReusableStartupPage(activeTaskPageCount: number): void {
    if (!this.reusableStartupPage) {
      return;
    }
    if (this.reusableStartupPage.isClosed() || activeTaskPageCount > 0) {
      this.reusableStartupPage = null;
    }
  }

  private async prepareReusableStartupPage(
    page: Page,
    browserContext?: BrowserContext,
  ): Promise<void> {
    if (page.isClosed()) {
      if (this.reusableStartupPage === page) {
        this.reusableStartupPage = null;
      }
      return;
    }
    if (!isReusableStartupPageUrl(page.url())) {
      await withTimeout(
        page.goto('about:blank'),
        30000,
        'Navigation timed out while preparing reusable startup page',
      );
    }
    this.attachStartupPage(page);
    await this.options.windowController.backgroundPage(page, browserContext);
  }

  private async waitForPageByTargetId(
    targetId: string,
    browserContext: BrowserContext,
  ): Promise<Page> {
    const startTime = Date.now();
    while (Date.now() - startTime < 30000) {
      for (const candidate of browserContext.pages()) {
        if (candidate.isClosed()) {
          continue;
        }
        try {
          if (
            (await this.options.windowController.getTargetId(candidate, browserContext)) ===
            targetId
          ) {
            return candidate;
          }
        } catch (error) {
          if (!isClosedPageError(error)) {
            throw error;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for background page target ${targetId}`);
  }

  private async createTaskPageFromReusableStartupPage(options: {
    browserContext: BrowserContext;
    initialUrl?: string;
    launchMode: TaskPageLaunchMode;
    name: string;
    page: Page;
    viewport?: ViewportSize;
  }): Promise<CreatedTaskPage> {
    const { browserContext, initialUrl, launchMode, name, page, viewport } = options;
    try {
      const targetId = await this.options.windowController.getTargetId(page, browserContext);

      if (viewport) {
        await page.setViewportSize(viewport);
      }

      let navigatedDuringCreate = false;
      if (initialUrl) {
        await navigatePageToUrl(name, page, initialUrl);
        navigatedDuringCreate = true;
      }

      await this.prepareReusedStartupPageForLaunch({ browserContext, launchMode, page, targetId });
      return {
        page,
        targetId,
        windowState: 'normal',
        backgroundAfterFirstFrame: launchMode === 'minimized-once',
        navigatedDuringCreate,
      };
    } catch (error) {
      // Restore or close reusable startup page if partial modifications occurred
      if (this.reusableStartupPage === null && !page.isClosed()) {
        // Try to restore it as reusable startup page, or close it
        try {
          await this.prepareReusableStartupPage(page, browserContext);
        } catch {
          await page.close().catch(() => {});
        }
      }
      throw error;
    }
  }

  private async prepareReusedStartupPageForLaunch(options: {
    browserContext: BrowserContext;
    launchMode: TaskPageLaunchMode;
    page: Page;
    targetId: string;
  }): Promise<void> {
    const { browserContext, launchMode, page, targetId } = options;
    if (launchMode === 'foreground') {
      await this.options.windowController.setNormalWindowState(page, targetId, browserContext);
      return;
    }
    if (launchMode === 'minimized-once') {
      return;
    }
    // background-normal: the startup page was minimized at server start; keep it that way.
    // Do NOT restore to normal — that would make the Chrome window visible.
  }

  private async createStandaloneTaskPage(options: {
    browserContext: BrowserContext;
    initialUrl?: string;
    launchMode: TaskPageLaunchMode;
    name: string;
    viewport?: ViewportSize;
  }): Promise<CreatedTaskPage> {
    return this.options.withPreservedForeground(async () => {
      const page = await withTimeout(
        options.browserContext.newPage(),
        30000,
        'Page creation timed out after 30s',
      );
      try {
        if (options.viewport) {
          await page.setViewportSize(options.viewport);
        }
        let navigatedDuringCreate = false;
        if (options.initialUrl) {
          await navigatePageToUrl(options.name, page, options.initialUrl);
          navigatedDuringCreate = true;
        }
        const targetId = await this.options.windowController.getTargetId(
          page,
          options.browserContext,
        );
        const windowState = 'normal';
        const backgroundAfterFirstFrame = options.launchMode === 'minimized-once';
        return {
          page,
          targetId,
          windowState,
          backgroundAfterFirstFrame,
          navigatedDuringCreate,
        };
      } catch (error) {
        // Close the newly created page on error
        await page.close().catch(() => {});
        throw error;
      }
    });
  }

  private async createAnchoredTaskPage(options: {
    anchorPage: Page;
    browserContext: BrowserContext;
    initialUrl?: string;
    launchMode: TaskPageLaunchMode;
    viewport?: ViewportSize;
  }): Promise<CreatedTaskPage> {
    return this.options.withPreservedForeground(async () => {
      const cdpSession = await options.browserContext.newCDPSession(options.anchorPage);
      let _createdTargetId: string | null = null;
      let page: Page | null = null;
      try {
        const { targetId } = (await cdpSession.send('Target.createTarget', {
          url: options.initialUrl ?? 'about:blank',
          background: options.launchMode !== 'foreground',
        })) as { targetId: string };
        _createdTargetId = targetId;
        page = await this.waitForPageByTargetId(targetId, options.browserContext);
        if (options.viewport) {
          await page.setViewportSize(options.viewport);
        }
        return {
          page,
          targetId,
          windowState: 'normal',
          backgroundAfterFirstFrame: options.launchMode === 'minimized-once',
          navigatedDuringCreate: !!options.initialUrl,
        };
      } catch (error) {
        // Close/remove the created target/page if subsequent operations fail
        if (page && !page.isClosed()) {
          await page.close().catch(() => {});
        }
        throw error;
      } finally {
        if (_createdTargetId && !page) {
          await cdpSession
            .send('Target.closeTarget', { targetId: _createdTargetId })
            .catch(() => {});
        }
        await cdpSession.detach().catch(() => {});
      }
    });
  }

  private async isLastOpenPage(page: Page, browserContext: BrowserContext): Promise<boolean> {
    const openPages = browserContext.pages().filter((candidate) => !candidate.isClosed());
    return openPages.length === 1 && openPages[0] === page;
  }
}
