export {
  isSystemChromeInstalled,
  isPlaywrightInstalled,
  hasBrowserAvailable,
} from './detection.js';

export {
  type BrowserServerConfig,
  type ServerStartResult,
  installPlaywrightChromium,
  isDevBrowserServerReady,
  waitForDevBrowserServer,
  startDevBrowserServer,
  ensureDevBrowserServer,
  shutdownDevBrowserServer,
} from './server.js';
