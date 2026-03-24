/**
 * Daemon In-Process
 *
 * In-process fallback: boots DaemonServer + DaemonClient within the Electron main process.
 */

import {
  DaemonServer,
  DaemonClient,
  createInProcessTransportPair,
} from '@accomplish_ai/agent-core';
import type { TaskManagerAPI, StorageAPI } from '@accomplish_ai/agent-core';
import { getLogCollector } from '../logging';
import { setServer, setClient, setMode } from './daemon-lifecycle';
import { registerInProcessHandlers } from './daemon-inprocess-handlers';

export { registerInProcessHandlers } from './daemon-inprocess-handlers';

/**
 * Boot in-process mode (no child process). This is the Step 2 fallback.
 */
export function bootstrapInProcess(taskManager: TaskManagerAPI, storage: StorageAPI): DaemonClient {
  const { serverTransport, clientTransport } = createInProcessTransportPair();

  const srv = new DaemonServer({ transport: serverTransport });
  setServer(srv);
  registerInProcessHandlers(srv, taskManager, storage);

  const cli = new DaemonClient({ transport: clientTransport });
  setClient(cli);
  setMode('in-process');
  getLogCollector().logEnv('INFO', '[DaemonBootstrap] Running in in-process mode');
  return cli;
}
