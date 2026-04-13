import type { BrowserContext } from 'playwright';
import type { PageStateResponse } from './types';
import { isTransientNavigationContextError } from './browser-runtime-utils';
import type { PageEntry } from './browser-page-service-state';

export interface BrowserPageStateReaderOptions {
  ensureBrowserContext: () => Promise<BrowserContext>;
}

export class BrowserPageStateReader {
  constructor(private readonly options: BrowserPageStateReaderOptions) {}

  async readPageState(name: string, entry: PageEntry): Promise<PageStateResponse> {
    const title = await this.readPageTitle(name, entry);
    const { canGoBack, canGoForward } = await this.readNavigationHistory(name, entry);
    return {
      name,
      targetId: entry.targetId,
      url: entry.page.url(),
      title,
      canGoBack,
      canGoForward,
    };
  }

  private async readNavigationHistory(
    name: string,
    entry: PageEntry,
  ): Promise<{ canGoBack: boolean; canGoForward: boolean }> {
    const activeContext = await this.options.ensureBrowserContext();
    const cdpSession = await activeContext.newCDPSession(entry.page);

    try {
      const history = (await cdpSession
        .send('Page.getNavigationHistory')
        .catch((error: unknown) => {
          this.logPageOperationFailure('getPageState:navigation-history', name, entry, error);
          throw error;
        })) as { currentIndex: number; entries: Array<unknown> };

      return {
        canGoBack: history.currentIndex > 0,
        canGoForward: history.currentIndex < history.entries.length - 1,
      };
    } finally {
      await cdpSession.detach().catch(() => {});
    }
  }

  private async readPageTitle(name: string, entry: PageEntry): Promise<string> {
    const readTitle = async (operation: 'getPageState:title' | 'getPageState:title-retry') => {
      try {
        const title = await entry.page.title();
        entry.lastKnownTitle = title;
        return title;
      } catch (error) {
        this.logPageOperationFailure(operation, name, entry, error);
        throw error;
      }
    };

    try {
      return await readTitle('getPageState:title');
    } catch (error) {
      if (!isTransientNavigationContextError(error)) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      return await readTitle('getPageState:title-retry');
    } catch (error) {
      if (!isTransientNavigationContextError(error)) throw error;
      return entry.lastKnownTitle ?? 'Untitled';
    }
  }

  private logPageOperationFailure(
    operation: string,
    name: string,
    entry: PageEntry,
    error: unknown,
  ): void {
    const errorDetails =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    let url: string | undefined = undefined;
    try {
      url = entry.page.url();
    } catch {
      url = '<unavailable>';
    }
    console.error('[dev-browser] page operation failed', {
      operation,
      name,
      targetId: entry.targetId,
      url,
      error: errorDetails,
    });
  }
}
