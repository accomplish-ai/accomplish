export { redact } from '@accomplish_ai/agent-core/desktop-main';
export {
  getLogFileWriter,
  initializeLogFileWriter,
  shutdownLogFileWriter,
  type LogLevel,
  type LogSource,
} from './log-file-writer';
export { getLogCollector, initializeLogCollector, shutdownLogCollector } from './log-collector';
