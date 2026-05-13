import { useEffect } from 'react';
import type { useExecutionCore } from './useExecutionCore';

type CoreState = ReturnType<typeof useExecutionCore>;

/**
 * Side-effect hooks for the execution page.
 * Handles auth/pause cleanup, follow-up focus, and keyboard shortcuts.
 */
export function useExecutionEffects(s: CoreState, accomplish: CoreState['accomplish']) {
  const currentTaskId = s.currentTask?.id;
  const currentTaskStatus = s.currentTask?.status;
  const currentTaskResult = s.currentTask?.result;
  const pauseReason =
    currentTaskResult && 'pauseReason' in currentTaskResult
      ? currentTaskResult.pauseReason
      : undefined;
  const pauseAction =
    currentTaskResult && 'pauseAction' in currentTaskResult
      ? currentTaskResult.pauseAction
      : undefined;
  const pauseActionType = pauseAction?.type;
  const pauseActionProviderId =
    pauseActionType === 'oauth-connect' ? pauseAction.providerId : undefined;

  useEffect(() => {
    s.setTaskActionError(null);
    s.setIsTaskActionRunning(false);
    if (
      currentTaskStatus === 'completed' &&
      pauseReason === 'oauth' &&
      pauseActionType === 'oauth-connect'
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
    currentTaskId,
    currentTaskStatus,
    pauseReason,
    pauseAction,
    pauseActionProviderId,
    pauseActionType,
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
