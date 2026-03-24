import type { IpcMainInvokeEvent } from 'electron';
import type { IpcHandler } from '../../types';
import { getStorage } from '../../../store/storage';
import { isE2ESkipAuthEnabled } from '../utils';

export function registerOnboardingHandlers(handle: IpcHandler): void {
  const storage = getStorage();

  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    if (isE2ESkipAuthEnabled()) {
      return true;
    }

    if (storage.getOnboardingComplete()) {
      return true;
    }

    const tasks = storage.getTasks();
    if (tasks.length > 0) {
      storage.setOnboardingComplete(true);
      return true;
    }

    return false;
  });

  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    if (typeof complete !== 'boolean') {
      throw new Error('complete must be a boolean');
    }
    storage.setOnboardingComplete(complete);
  });
}
