/**
 * Daemon module — public exports
 *
 * Provides the in-process RPC infrastructure for the daemon architecture.
 * Step 2: server and client run in the same Electron main process.
 * Step 3: swap createInProcessTransportPair for a socket-based transport.
 */

export { DaemonServer } from './server.js';
export type { DaemonServerOptions } from './server.js';

export { DaemonClient } from './client.js';
export type { DaemonClientOptions } from './client.js';

export { createInProcessTransportPair } from './transport.js';

export { createChildProcessTransport, createParentProcessTransport } from './ipc-transport.js';

export {
  addScheduledTask,
  listScheduledTasks,
  cancelScheduledTask,
  onScheduledTaskFire,
  disposeScheduler,
  parseCronField,
  matchesCron,
} from './scheduler.js';

export { DaemonRpcServer } from './rpc-server.js';
export type { DaemonRpcServerOptions } from './rpc-server.js';

export { getSocketPath, getPidFilePath, getDaemonDir } from './socket-path.js';

export { acquirePidLock, PidLockError } from './pid-lock.js';
export type { PidLockHandle, PidLockPayload } from './pid-lock.js';

export { installCrashHandlers } from './crash-handlers.js';
