// Phase 4b of the OpenCode SDK cutover port simplified this barrel: the
// PTY-era TaskManager wiring (`createElectronTaskManagerOptions`,
// `buildCliArgs`, `getCliCommand`, `isCliAvailable`, `onBeforeStart`,
// `onBeforeTaskStart`, `buildEnvironment`) is gone — task execution is
// owned by `apps/daemon`. The desktop only retains:
//   - bundled OpenCode CLI metadata for the Settings UI
//   - dev-browser MCP server shutdown for app teardown
//   - Vertex service-account key cleanup
//   - `loginOpenAiWithChatGpt` was removed in Phase 4a (now a daemon RPC).

// Re-export agent-core types still used by callers in the main process.
// Sourced from `/desktop-main` to keep this file fully off the root barrel —
// even type-only imports from root are avoided here so the M1 invariant
// (no runtime evaluation of root `@accomplish_ai/agent-core` from main) is
// held statically as well as dynamically. `OpenCodeCliNotFoundError` used
// to be re-exported here but has no consumer in `apps/desktop` (only
// `packages/agent-core/src/internal/classes/TaskManager.ts` throws it, and
// that code never runs in main post-SDK-cutover); removing the value
// re-export eliminates the only path by which importing this barrel pulled
// `storage/database.ts` + `better-sqlite3` into main's module graph.
export type {
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  TaskManagerAPI,
} from '@accomplish_ai/agent-core/desktop-main';

export { cleanupVertexServiceAccountKey } from './vertex-cleanup';
export { stopDevBrowserServer } from './dev-browser-shutdown';
export {
  getOpenCodeCliPath,
  isOpenCodeCliAvailable,
  getBundledOpenCodeVersion,
} from './cli-resolver';

import { isOpenCodeCliAvailable, getBundledOpenCodeVersion } from './cli-resolver';

export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isOpenCodeCliAvailable();
}

export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
