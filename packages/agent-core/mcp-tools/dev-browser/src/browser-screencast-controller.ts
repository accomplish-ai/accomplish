import type { PageEntry } from './browser-page-service-state.js';
import {
  SCREENCAST_FIRST_FRAME_TIMEOUT_MS,
  SCREENCAST_FRAME_POLL_MS,
  isScreencastFrameStale,
} from './browser-page-service-state.js';

export class BrowserScreencastController {
  async captureScreenshot(entry: PageEntry, quality: number): Promise<Buffer> {
    await this.ensureScreencastRunning(entry, quality);
    return this.pollForFreshFrame(entry);
  }

  async stop(entry: PageEntry): Promise<void> {
    const { screencast } = entry;
    if (screencast.startPromise) {
      await screencast.startPromise.catch(() => {});
      screencast.startPromise = null;
    }
    if (screencast.session) {
      try {
        await screencast.session.send('Page.stopScreencast');
      } catch {
        // Session may already be detached
      }
      try {
        await screencast.session.detach();
      } catch {
        // Already detached
      }
      screencast.session = null;
    }
    screencast.quality = null;
    screencast.latestFrame = null;
    screencast.latestFrameUrl = null;
  }

  private async ensureScreencastRunning(entry: PageEntry, quality: number): Promise<void> {
    const { screencast } = entry;

    // Wait for in-progress start before checking state
    if (screencast.startPromise) {
      await screencast.startPromise.catch(() => {});
    }

    const needsRestart =
      !screencast.session ||
      screencast.quality !== quality ||
      (isScreencastFrameStale(entry) && this.staleGraceExpired(entry));

    if (!needsRestart) return;

    await this.stop(entry);
    screencast.startPromise = this.startScreencast(entry, quality);
    try {
      await screencast.startPromise;
    } catch (err) {
      await this.stop(entry);
      throw err;
    } finally {
      screencast.startPromise = null;
    }
  }

  private async startScreencast(entry: PageEntry, quality: number): Promise<void> {
    const { screencast, page } = entry;
    const session = await page.context().newCDPSession(page);
    screencast.session = session;
    screencast.quality = quality;
    screencast.latestFrame = null;
    screencast.latestFrameUrl = null;

    session.on('Page.screencastFrame', (event) => {
      screencast.latestFrame = Buffer.from(event.data, 'base64');
      screencast.latestFrameUrl = page.url();
      session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });

    await session.send('Page.enable');
    await session.send('Page.startScreencast', {
      format: 'jpeg',
      quality,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });
  }

  private async pollForFreshFrame(entry: PageEntry): Promise<Buffer> {
    const { screencast, page } = entry;
    const currentUrl = page.url();
    const deadline = Date.now() + SCREENCAST_FIRST_FRAME_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const frame = screencast.latestFrame;
      if (frame && screencast.latestFrameUrl === currentUrl) {
        return frame;
      }
      await new Promise((r) => setTimeout(r, SCREENCAST_FRAME_POLL_MS));
    }

    // Stale frame fallback: return whatever we have
    if (screencast.latestFrame) return screencast.latestFrame;

    throw new Error(`Screencast frame timed out after ${SCREENCAST_FIRST_FRAME_TIMEOUT_MS}ms`);
  }

  private staleGraceExpired(entry: PageEntry): boolean {
    // If the URL changed and we haven't got a fresh frame, check if grace period expired.
    // We use a simple heuristic: if latestFrameUrl doesn't match current URL,
    // the next poll will handle the stale restart.
    const { screencast, page } = entry;
    if (!screencast.latestFrame) return true;
    return screencast.latestFrameUrl !== page.url();
  }
}
