// Analytics service initialization and core functions
export {
  initAnalytics,
  trackEvent,
  setOnlineStatus,
  flushAnalytics,
  getSessionDuration,
  getSessionTaskCount,
} from './service';

// Typed event helpers
export * from './events';
