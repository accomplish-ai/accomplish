import { useEffect } from 'react';
import type { useExecutionCore } from './useExecutionCore';

type CoreState = ReturnType<typeof useExecutionCore>;

/**
 * Side-effect hooks for the execution page.
 * Handles auth/pause cleanup, follow-up focus, and keyboard shortcuts.
 */
export function useExecutionEffects(s: CoreState, accomplish: CoreState['accomplish']) {
  useEffect(() => {
    s.setTaskActionError(null);
    s.setIsTaskActionRunning(false);
    const result = s.currentTask?.result;
    const action = result && 'pauseAction' in result ? result.pauseAction : undefined;
    if (
      s.currentTask?.status === 'completed' &&
      result &&
      'pauseReason' in result &&
      result.pauseReason === 'oauth' &&
      action?.type === 'oauth-connect'
    ) {
      let stale = false;
      accomplish
        .getSlackMcpOauthStatus()
        .then((status) => {
          if (!stale && status.pendingAuthorization) {
            void accomplish.logoutSlackMcp();
          }
        })
        .catch(() => {
          // ignore errors from oauth status check
        });
      return () => {
        stale = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s.setTaskActionError/setIsTaskActionRunning are stable store actions
  }, [
    accomplish,
    s.currentTask?.id,
    s.currentTask?.status,
    s.currentTask?.result && 'pauseReason' in s.currentTask.result
      ? s.currentTask.result.pauseReason
      : undefined,
    s.currentTask?.result && 'pauseAction' in s.currentTask.result
      ? s.currentTask.result.pauseAction
      : undefined,
    s.currentTask?.result && 'pauseAction' in s.currentTask.result
      ? s.currentTask.result.pauseAction?.type
      : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- providerId only exists on oauth-connect variant; narrowing inside deps array is intentional
    s.currentTask?.result &&
    'pauseAction' in s.currentTask.result &&
    s.currentTask.result.pauseAction?.type === 'oauth-connect'
      ? s.currentTask.result.pauseAction?.providerId
      : undefined,
  ]);

  useEffect(() => {
    if (s.canFollowUp) {
      s.followUpInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- followUpInputRef is a stable ref
  }, [s.canFollowUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        return;
      }
      if (
        e.key === 'Escape' &&
        s.currentTask?.status === 'running' &&
        !s.isComplete &&
        !s.permissionRequest &&
        !s.showSettingsDialog
      ) {
        e.preventDefault();
        s.interruptTask();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s is a stable hook result reference
  }, [s.currentTask, s.isComplete, s.permissionRequest, s.showSettingsDialog, s.interruptTask]);
}
