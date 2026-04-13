import type { CDPSession, Page } from 'playwright';
import type { PageLaunchIntent } from './types.js';

// minimized: intentionally hidden from the desktop
// normal: available for background/live use without implying user-visible foreground
export type BrowserWindowState = 'minimized' | 'normal';

// minimized-once: first real task open/reopen; background after the first live frame only once
// background-normal: generic ensure/recovery work that must never consume first-open behavior
// foreground: explicit user-facing open/focus flows only
export type TaskPageLaunchMode = 'minimized-once' | 'background-normal' | 'foreground';

export const SCREENCAST_FRAME_POLL_MS = 25;
export const SCREENCAST_FIRST_FRAME_TIMEOUT_MS = 2000;
export const STALE_FRAME_RESTART_GRACE_MS = 500;

export interface PageEntry {
  page: Page;
  targetId: string;
  lastKnownTitle: string;
  backgroundAfterFirstFrame: boolean;
  screencastPrimed: boolean;
  windowState: BrowserWindowState;
  screencast: {
    session: CDPSession | null;
    quality: number | null;
    latestFrame: Buffer | null;
    latestFrameUrl: string | null;
    startPromise: Promise<void> | null;
  };
}

export type CreatedTaskPage = Pick<
  PageEntry,
  'page' | 'targetId' | 'windowState' | 'backgroundAfterFirstFrame'
> & {
  navigatedDuringCreate: boolean;
};

export type BrowserWindowBounds = Partial<{
  left: number;
  top: number;
  width: number;
  height: number;
  windowState: BrowserWindowState;
}>;

export function createEmptyScreencastState(): PageEntry['screencast'] {
  return {
    session: null,
    quality: null,
    latestFrame: null,
    latestFrameUrl: null,
    startPromise: null,
  };
}

export function createPageEntry(createdPage: CreatedTaskPage): PageEntry {
  return {
    page: createdPage.page,
    targetId: createdPage.targetId,
    lastKnownTitle: '',
    backgroundAfterFirstFrame: createdPage.backgroundAfterFirstFrame,
    screencastPrimed: false,
    windowState: createdPage.windowState,
    screencast: createEmptyScreencastState(),
  };
}

export function resolveRequestedLaunchIntent(
  launchIntent: PageLaunchIntent | undefined,
  keepForegroundUntilFirstFrame: boolean | undefined,
  headless: boolean,
): PageLaunchIntent {
  if (launchIntent) return launchIntent;
  if (keepForegroundUntilFirstFrame && !headless) return 'foreground';
  return 'background-normal';
}

export function shouldLaunchMinimizedOnce(options: {
  launchIntent: PageLaunchIntent;
  hasReleasedPageUrl: boolean;
  hasKnownTaskPage: boolean;
}): boolean {
  return (
    options.launchIntent === 'browser-tool-open' &&
    (options.hasReleasedPageUrl || !options.hasKnownTaskPage)
  );
}

export function selectReusableStartupPage(
  reusableStartupPage: Page | null,
  registrySize: number,
  openPages: Page[],
): Page | null {
  if (!reusableStartupPage || reusableStartupPage.isClosed()) return null;
  if (registrySize !== 0 || openPages.length !== 1 || openPages[0] !== reusableStartupPage)
    return null;
  return reusableStartupPage;
}

export function isScreencastTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bScreencast frame timed out\b/i.test(message);
}

export function isScreencastFrameStale(entry: PageEntry): boolean {
  const currentUrl = entry.page.url();
  return !!entry.screencast.latestFrame && entry.screencast.latestFrameUrl !== currentUrl;
}
