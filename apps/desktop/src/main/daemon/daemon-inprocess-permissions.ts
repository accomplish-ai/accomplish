/**
 * Daemon In-Process Permission Handlers
 *
 * Registers permission.respond RPC handler on the in-process DaemonServer.
 */

import {
  DaemonServer,
  isFilePermissionRequest,
  isQuestionRequest,
} from '@accomplish_ai/agent-core';
import type { TaskManagerAPI, PermissionResponse } from '@accomplish_ai/agent-core';
import { resolvePermission, resolveQuestion } from '../permission-api';
import { getLogCollector } from '../logging';

/**
 * Register the permission.respond handler.
 */
export function registerPermissionHandlers(srv: DaemonServer, taskManager: TaskManagerAPI): void {
  srv.registerMethod('permission.respond', async (params) => {
    const { response } = params;
    const { taskId, decision, requestId, selectedOptions, customText } =
      response as PermissionResponse;

    if (requestId) {
      if (isFilePermissionRequest(requestId)) {
        const allowed = decision === 'allow';
        const resolved = resolvePermission(requestId, allowed);
        if (resolved) return;
        getLogCollector().logEnv(
          'WARN',
          `[DaemonBootstrap] No pending file permission request for id: ${requestId}`,
        );
        return;
      }

      if (isQuestionRequest(requestId)) {
        const denied = decision === 'deny';
        const resolved = resolveQuestion(requestId, { selectedOptions, customText, denied });
        if (resolved) return;
        getLogCollector().logEnv(
          'WARN',
          `[DaemonBootstrap] No pending question request for id: ${requestId}`,
        );
        return;
      }

      getLogCollector().logEnv(
        'WARN',
        `[DaemonBootstrap] Unknown requestId format in permission.respond`,
        { requestId },
      );
      return;
    }

    if (!taskManager.hasActiveTask(taskId)) {
      getLogCollector().logEnv('WARN', `[DaemonBootstrap] Permission response for inactive task`, {
        taskId,
      });
      return;
    }

    if (decision === 'allow') {
      const message = customText ?? selectedOptions?.join(', ') ?? 'yes';
      await taskManager.sendResponse(taskId, message);
    } else {
      await taskManager.sendResponse(taskId, 'no');
    }
  });
}
