// Debug handlers are split into focused sub-modules for maintainability.
// Each module registers a related set of IPC handlers.
import { registerLogHandlers } from './log-handlers';
import { registerCaptureHandlers } from './capture-handlers';
import { registerBugReportHandlers } from './bug-report-handlers';

export function registerDebugHandlers(): void {
  registerLogHandlers();
  registerCaptureHandlers();
  registerBugReportHandlers();
}
