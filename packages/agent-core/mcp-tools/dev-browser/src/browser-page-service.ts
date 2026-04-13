import type { BrowserContext, Page } from 'playwright';
import type { GetPageRequest, PageLaunchIntent, PageStateResponse, ViewportSize } from './types.js';
import { isClosedPageError, withTimeout } from './browser-runtime-utils.js';
import { navigatePageToUrl } from './browser-page-navigator.js';
import {
  createPageEntry,
  resolveRequestedLaunchIntent,
  shouldLaunchMinimizedOnce,
  type CreatedTaskPage,
  type PageEntry,
  type TaskPageLaunchMode,
} from './browser-page-service-state.js';
import { BrowserPageStateReader } from './browser-page-state-reader.js';
import { BrowserScreencastController } from './browser-screencast-controller.js';
import { BrowserTaskPageFactory } from './browser-task-page-factory.js';
import { BrowserWindowController } from './browser-window-controller.js';
import { isHttpNavigationUrl } from './navigation-url.js';

export interface BrowserPageServiceOptions {
  headless: boolean;
  ensureBrowserContext: () => Promise<BrowserContext>;
  withPreservedForeground: <T>(operation: () => Promise<T>) => Promise<T>;
}

export interface EnsuredPage {
  name: string;
  targetId: string;
  created: boolean;
}

export class BrowserPageService {
  private readonly registry = new Map<string, PageEntry>();
  private readonly releasedPageUrls = new Map<string, string>();
  private readonly knownTaskPages = new Set<string>();
  private readonly closeHandlers = new WeakMap<import('playwright').Page, () => void>();
  private readonly windowController: BrowserWindowController;
  private readonly screencastController: BrowserScreencastController;
  private readonly pageStateReader: BrowserPageStateReader;
  private readonly pageFactory: BrowserTaskPageFactory;

  constructor(private readonly options: BrowserPageServiceOptions) {
    this.windowController = new BrowserWindowController(options);
    this.pageStateReader = new BrowserPageStateReader({
      ensureBrowserContext: options.ensureBrowserContext,
    });
    this.screencastController = new BrowserScreencastController();
    this.pageFactory = new BrowserTaskPageFactory({
      ensureBrowserContext: options.ensureBrowserContext,
      headless: options.headless,
      withPreservedForeground: options.withPreservedForeground,
      windowController: this.windowController,
    });
  }

  listPageNames(): string[] {
    return Array.from(this.registry.keys());
  }

  hasPage(name: string): boolean {
    return this.registry.has(name);
  }

  private pendingCreations: Map<string, Promise<EnsuredPage>> = new Map();

  async ensurePage(body: GetPageRequest): Promise<EnsuredPage> {
    const { name, viewport, initialUrl, keepForegroundUntilFirstFrame, launchIntent } = body;

    const existingEntry = this.registry.get(name);
    if (existingEntry) {
      return { name, targetId: existingEntry.targetId, created: false };
    }

    if (this.pendingCreations.has(name)) {
      const pending = this.pendingCreations.get(name)!;
      const createdEntry = await pending;
      return { name, targetId: createdEntry.targetId, created: true };
    }

    const creationPromise: Promise<EnsuredPage> = this.createAndRegisterPageEntry({
      initialUrl,
      keepForegroundUntilFirstFrame,
      launchIntent,
      name,
      viewport,
    }).then((createdEntry) => ({
      name,
      targetId: createdEntry.targetId,
      created: true,
    }));
    this.pendingCreations.set(name, creationPromise);
    try {
      const ensured = await creationPromise;
      return ensured;
    } finally {
      this.pendingCreations.delete(name);
    }
  }

  async deletePage(name: string): Promise<boolean> {
    const entry = this.registry.get(name);
    this.releasedPageUrls.delete(name);
    if (!entry) return false;

    await this.screencastController.stop(entry);
    try {
      await entry.page.close();
    } catch (_error) {
      // Log or ignore error, but continue cleanup
      // console.error(`Error closing page for ${name}:`, _error);
    }
    this.registry.delete(name);
    return true;
  }

  async releasePage(name: string): Promise<boolean> {
    const entry = this.registry.get(name);
    if (!entry) return false;

    this.rememberReleasedUrl(name, entry);
    await this.detachReleasedEntry(name, entry);
    await this.pageFactory.recycleOrClosePage(entry.page);
    return true;
  }

  async openExternalPage(url: string): Promise<void> {
    if (!isHttpNavigationUrl(url)) throw new Error('url must use http or https');

    const activeContext = await this.options.ensureBrowserContext();
    const page = await this.pageFactory.acquirePageForExternalOpen(activeContext);
    try {
      const targetId = await this.windowController.getTargetId(page, activeContext);
      await this.windowController.focusPreparedPage(
        page,
        targetId,
        activeContext,
        `Focus timed out for external page: ${url}`,
      );
      await withTimeout(page.goto(url), 30000, `Navigation timed out for external page: ${url}`);
    } catch (error) {
      if (isClosedPageError(error)) {
        return;
      }
      await page.close().catch(() => {});
      throw error;
    }
  }

  async readPageState(name: string): Promise<PageStateResponse | null> {
    const entry = this.registry.get(name);
    if (!entry) return null;
    return this.getPageState(name, entry);
  }

  async navigatePage(name: string, url: string): Promise<PageStateResponse | null> {
    const entry = this.registry.get(name);
    if (!entry) return null;
    await this.navigateEntry(name, entry, url);
    return this.getPageState(name, entry);
  }

  async goBack(name: string): Promise<PageStateResponse | null> {
    return this.runPageOperation(name, async (entry) => {
      await entry.page.goBack();
    });
  }

  async goForward(name: string): Promise<PageStateResponse | null> {
    return this.runPageOperation(name, async (entry) => {
      await entry.page.goForward();
    });
  }

  async reloadPage(name: string): Promise<PageStateResponse | null> {
    return this.runPageOperation(name, async (entry) => {
      await withTimeout(entry.page.reload(), 30000, `Reload timed out for ${name}`);
    });
  }

  async focusPage(name: string): Promise<PageStateResponse | null> {
    const entry = this.registry.get(name);
    if (!entry) return null;

    try {
      // Use the page's owning context so CDP sessions are created against the correct BrowserContext
      const pageContext = entry.page.context();
      await this.windowController.focusPreparedPage(
        entry.page,
        entry.targetId,
        pageContext,
        `Focus timed out for ${name}`,
      );
      entry.windowState = 'normal';
    } catch (error) {
      if (isClosedPageError(error)) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      throw error;
    }

    return this.getPageState(name, entry);
  }

  async capturePageScreenshot(name: string, quality: number): Promise<Buffer | null> {
    const entry = this.registry.get(name);
    if (!entry) return null;

    try {
      return await this.screencastController.captureScreenshot(entry, quality);
    } catch (error) {
      if (isClosedPageError(error)) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      throw error;
    }
  }

  async closeAllPages(): Promise<void> {
    for (const entry of this.registry.values()) {
      try {
        await entry.page.close();
      } catch {
        /* intentionally empty */
      }
    }
    this.registry.clear();
    this.knownTaskPages.clear();
    this.releasedPageUrls.clear();
    try {
      await this.pageFactory.closeReusableStartupPage();
    } catch {
      /* intentionally empty */
    }
    this.pageFactory.reset();
  }

  private resolveTaskPageLaunchMode(
    name: string,
    launchIntent?: PageLaunchIntent,
    keepForegroundUntilFirstFrame?: boolean,
  ): TaskPageLaunchMode {
    const requestedLaunchIntent = resolveRequestedLaunchIntent(
      launchIntent,
      keepForegroundUntilFirstFrame,
      this.options.headless,
    );

    if (requestedLaunchIntent === 'foreground') return 'foreground';

    if (
      shouldLaunchMinimizedOnce({
        launchIntent: requestedLaunchIntent,
        hasReleasedPageUrl: this.releasedPageUrls.has(name),
        hasKnownTaskPage: this.knownTaskPages.has(name),
      })
    ) {
      return 'minimized-once';
    }

    return 'background-normal';
  }

  private resolveRestoreUrl(
    name: string,
    initialUrl: string | undefined,
    launchIntent: PageLaunchIntent | undefined,
  ): string | undefined {
    if (initialUrl) return initialUrl;
    if (launchIntent === 'browser-tool-open') return this.releasedPageUrls.get(name);
    return undefined;
  }

  private attachPageCloseHandler(name: string, entry: PageEntry): void {
    // Remove any previous handler for this page to prevent listener accumulation
    // when a page is reused across multiple task registrations.
    const previousHandler = this.closeHandlers.get(entry.page);
    if (previousHandler) {
      entry.page.off('close', previousHandler);
    }

    const closeHandler = () => {
      // Validate that the registration is still the same PageEntry before acting
      if (this.registry.get(name) === entry) {
        void this.screencastController.stop(entry);
        this.registry.delete(name);
      }
    };
    entry.page.on('close', closeHandler);
    this.closeHandlers.set(entry.page, closeHandler);
  }

  private async runPageOperation(
    name: string,
    operation: (entry: PageEntry) => Promise<void>,
  ): Promise<PageStateResponse | null> {
    const entry = this.registry.get(name);
    if (!entry) return null;

    try {
      await operation(entry);
    } catch (error) {
      if (isClosedPageError(error)) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      throw error;
    }

    return this.getPageState(name, entry);
  }

  private async createAndRegisterPageEntry(options: {
    initialUrl?: string;
    keepForegroundUntilFirstFrame?: boolean;
    launchIntent?: PageLaunchIntent;
    name: string;
    viewport?: ViewportSize;
  }): Promise<PageEntry> {
    const browserContext = await this.options.ensureBrowserContext();
    const restoreUrl = this.resolveRestoreUrl(
      options.name,
      options.initialUrl,
      options.launchIntent,
    );
    const launchMode = this.resolveTaskPageLaunchMode(
      options.name,
      options.launchIntent,
      options.keepForegroundUntilFirstFrame,
    );
    const createdPage = await this.pageFactory.createTaskPage({
      activeTaskPageCount: this.registry.size,
      browserContext,
      initialUrl: restoreUrl,
      name: options.name,
      launchMode,
      viewport: options.viewport,
    });

    await this.finishCreatedPageSetup(createdPage, options.viewport);

    // For background-normal mode, ensure the OS window stays minimized after page creation.
    // Fire-and-forget: window management must NOT block page registration — a hanging CDP
    // call here would stall POST /pages and cascade-block connectOverCDP in the MCP client.
    if (launchMode === 'background-normal' && !this.options.headless) {
      void this.windowController.backgroundPage(createdPage.page, browserContext).catch(() => {});
    }

    const entry = createPageEntry(createdPage);

    // Navigate before registering so a failed navigation leaves no partial state.
    try {
      await this.finishCreatedPageNavigation(options.name, entry, restoreUrl, createdPage);
    } catch (error) {
      try {
        await entry.page.close();
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }

    this.registry.set(options.name, entry);
    this.knownTaskPages.add(options.name);
    this.attachPageCloseHandler(options.name, entry);
    this.releasedPageUrls.delete(options.name);
    return entry;
  }

  private async finishCreatedPageSetup(
    createdPage: CreatedTaskPage,
    viewport: ViewportSize | undefined,
  ): Promise<void> {
    if (!viewport || createdPage.navigatedDuringCreate) return;
    await createdPage.page.setViewportSize(viewport);
  }

  private async finishCreatedPageNavigation(
    name: string,
    entry: PageEntry,
    restoreUrl: string | undefined,
    createdPage: CreatedTaskPage,
  ): Promise<void> {
    if (!restoreUrl || createdPage.navigatedDuringCreate) return;

    try {
      await this.navigateEntry(name, entry, restoreUrl);
    } catch (error) {
      if (isClosedPageError(error)) throw new Error('page not found');
      throw error;
    }
  }

  private deleteStaleEntry(name: string, entry: PageEntry): void {
    if (this.registry.get(name) === entry) {
      void this.screencastController.stop(entry);
      this.registry.delete(name);
    }
  }

  private async getPageState(name: string, entry: PageEntry): Promise<PageStateResponse | null> {
    const { page } = entry;

    try {
      if (page.isClosed()) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      return await this.pageStateReader.readPageState(name, entry);
    } catch (error) {
      if (isClosedPageError(error)) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      throw error;
    }
  }

  private async navigateEntry(name: string, entry: PageEntry, url: string): Promise<void> {
    try {
      await navigatePageToUrl(name, entry.page, url);
    } catch (error) {
      if (isClosedPageError(error)) this.deleteStaleEntry(name, entry);
      throw error;
    }
  }

  private rememberReleasedUrl(name: string, entry: PageEntry): void {
    const recoverableUrl = isHttpNavigationUrl(entry.page.url()) ? entry.page.url() : null;
    if (recoverableUrl) {
      this.releasedPageUrls.set(name, recoverableUrl);
    } else {
      this.releasedPageUrls.delete(name);
    }
  }

  private async detachReleasedEntry(name: string, entry: PageEntry): Promise<void> {
    // Remove the close handler so it doesn't fire after the page is recycled
    const handler = this.closeHandlers.get(entry.page);
    if (handler) {
      entry.page.off('close', handler);
      this.closeHandlers.delete(entry.page);
    }
    await this.screencastController.stop(entry);
    this.registry.delete(name);
  }

  attachStartupPage(page: Page | null): void {
    this.pageFactory.attachStartupPage(page);
  }

  async backgroundPage(page: Page, browserContext?: BrowserContext): Promise<void> {
    await this.windowController.backgroundPage(page, browserContext);
  }

  /**
   * Minimizes the startup blank tab so no Chrome window flashes on server start.
   * Called immediately after attaching the startup page in serve().
   */
  async backgroundStartupPage(page: Page): Promise<void> {
    // Use the page's owning context so CDP sessions are created against the correct BrowserContext
    const ctx = page.context();
    await this.windowController.backgroundPage(page, ctx);
  }

  /**
   * Looks up a registered page by name and minimizes its OS window.
   * Returns the updated page state, or null if the page is not found.
   */
  async backgroundPageByName(name: string): Promise<PageStateResponse | null> {
    const entry = this.registry.get(name);
    if (!entry) {
      return null;
    }

    try {
      // Use the page's owning context so CDP sessions are created against the correct BrowserContext
      const ctx = entry.page.context();
      await this.windowController.backgroundPage(entry.page, ctx);
      entry.windowState = 'minimized';
    } catch (error) {
      if (isClosedPageError(error)) {
        this.deleteStaleEntry(name, entry);
        return null;
      }
      throw error;
    }

    return this.getPageState(name, entry);
  }
}
