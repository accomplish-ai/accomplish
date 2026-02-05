export { redact } from '@accomplish/agent-core';
export {
  getLogFileWriter,
  initializeLogFileWriter,
  shutdownLogFileWriter,
  type LogLevel,
  type LogSource,
} from './log-file-writer';
export {
  getLogCollector,
  initializeLogCollector,
  shutdownLogCollector,
} from './log-collector';
