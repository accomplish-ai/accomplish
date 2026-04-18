import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { getDaemonClient } from '../../../daemon-bootstrap';
import { isE2ESkipAuthEnabled } from '../utils';

export function registerOnboardingHandlers(handle: IpcHandler): void {
  // Milestone 3 sub-chunk 3c: onboarding-state get/set + task-count
  // heuristic all route through the daemon. The `onboarding:complete`
  // handler's "auto-complete if user already has tasks" branch used to
  // call `storage.getTasks()` — now `task.list()` via RPC. We pass no
  // `workspaceId` (undefined) so the daemon returns tasks across all
  // workspaces, matching pre-3c behavior.
  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    const client = getDaemonClient();
    const snap = await client.call('settings.getAll');
    if (snap.app.onboardingComplete) {
      return true;
    }

    const tasks = await client.call('task.list', {});
    if (tasks.length > 0) {
      await client.call('settings.setOnboardingComplete', { complete: true });
      return true;
    }

    return false;
  });

  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    if (typeof complete !== 'boolean') {
      throw new Error('complete must be a boolean');
    }
    await getDaemonClient().call('settings.setOnboardingComplete', { complete });
  });
}
