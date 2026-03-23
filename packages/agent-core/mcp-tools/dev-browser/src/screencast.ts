/**
 * ScreencastController — CDP-based live browser frame capture.
 *
 * Attaches a CDP session to a Playwright page, starts the Chrome
 * Page.startScreencast protocol, and streams JPEG frames via callbacks.
 * Handles idempotent stop/start, page-close events, and proper cleanup to
 * prevent CDP session leaks.
 *
 * Originally authored by david-mamani (PR #553) for ENG-695.
 */

import type { BrowserContext, Page, CDPSession } from 'playwright';
import type { ScreencastConfig, ScreencastFrame, ScreencastStatus } from './types.js';
import { createConsoleLogger } from '../../../src/utils/logging.js';

export type FrameCallback = (frame: ScreencastFrame) => void;
export type StatusCallback = (status: ScreencastStatus, error?: string) => void;

const DEFAULT_CONFIG: ScreencastConfig = {
  format: 'jpeg',
  quality: 50,
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: 6,
};

export class ScreencastController {
  private readonly logger = createConsoleLogger({ prefix: 'Screencast' });
  private cdpSession: CDPSession | null = null;
  private status: ScreencastStatus = 'idle';
  private onFrame: FrameCallback | null = null;
  private onStatus: StatusCallback | null = null;
  private activePage: Page | null = null;
  private onPageClose: (() => void) | null = null;

  async start(
    context: BrowserContext,
    page: Page,
    config: Partial<ScreencastConfig> = {},
    onFrame: FrameCallback,
    onStatus: StatusCallback,
  ): Promise<void> {
    if (this.status === 'streaming' || this.status === 'starting') {
      await this.stop();
    }

    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.activePage = page;

    this.setStatus('starting');

    try {
      this.cdpSession = await context.newCDPSession(page);

      const mergedConfig = { ...DEFAULT_CONFIG, ...config };

      this.cdpSession.on('Page.screencastFrame', (params) => {
        const frame: ScreencastFrame = {
          data: params.data as string,
          sessionId: params.sessionId as number,
          metadata: {
            pageUrl: page.url(),
            timestamp: Date.now(),
            offsetTop: (params.metadata as { offsetTop: number }).offsetTop,
            pageScaleFactor: (params.metadata as { pageScaleFactor: number }).pageScaleFactor,
            deviceWidth: (params.metadata as { deviceWidth: number }).deviceWidth,
            deviceHeight: (params.metadata as { deviceHeight: number }).deviceHeight,
          },
        };

        try {
          this.onFrame?.(frame);
        } finally {
          // Acknowledge frame to allow CDP to send the next one (always, even if onFrame throws)
          this.cdpSession
            ?.send('Page.screencastFrameAck', {
              sessionId: params.sessionId,
            })
            .catch((err) => {
              this.logger.error('Failed to ack frame:', { err: String(err) });
            });
        }
      });

      await this.cdpSession.send('Page.startScreencast', {
        format: mergedConfig.format,
        quality: mergedConfig.quality,
        maxWidth: mergedConfig.maxWidth,
        maxHeight: mergedConfig.maxHeight,
        everyNthFrame: mergedConfig.everyNthFrame,
      });

      this.setStatus('streaming');

      this.onPageClose = () => this.handlePageClosed();
      page.on('close', this.onPageClose);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to start:', { message });
      this.setStatus('error', message);
      await this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'idle' || this.status === 'stopping') {
      return;
    }

    this.setStatus('stopping');
    this.setStatus('idle');
    await this.cleanup();
  }

  getStatus(): ScreencastStatus {
    return this.status;
  }

  private setStatus(status: ScreencastStatus, error?: string): void {
    this.status = status;
    this.onStatus?.(status, error);
  }

  private handlePageClosed(): void {
    this.logger.warn('Page closed, stopping screencast');
    this.cleanup().catch((err) => {
      this.logger.error('Cleanup error after page close:', { err: String(err) });
    });
    this.setStatus('idle');
  }

  private async cleanup(): Promise<void> {
    if (this.cdpSession) {
      try {
        await this.cdpSession.send('Page.stopScreencast');
      } catch {
        // Page may already be closed
      }
      try {
        await this.cdpSession.detach();
      } catch {
        // Session may already be detached
      }
      this.cdpSession = null;
    }
    if (this.activePage && this.onPageClose) {
      this.activePage.off('close', this.onPageClose);
    }
    this.onPageClose = null;
    this.activePage = null;
    this.onFrame = null;
    this.onStatus = null;
  }
}
