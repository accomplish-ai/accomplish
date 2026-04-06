import { useCallback } from 'react';
import { hasAnyReadyProvider, getOAuthProviderDisplayName } from '@accomplish_ai/agent-core/common';
import type { useExecutionCore } from './useExecutionCore';

type CoreState = ReturnType<typeof useExecutionCore>;

/**
 * Handles pause/resume/auth actions for the execution page.
 */
export function useExecutionPauseActions(
  s: CoreState,
  accomplish: CoreState['accomplish'],
  t: CoreState['t'],
) {
  const resumePausedTask = useCallback(
    async (message: string, _bypassAuthPauseQueue: boolean): Promise<boolean> => {
      const isE2EMode = await accomplish.isE2EMode();
      if (!isE2EMode) {
        const settings = await accomplish.getProviderSettings();
        if (!hasAnyReadyProvider(settings)) {
          s.setPendingFollowUp(message);
          s.setSettingsInitialTab('providers');
          s.setShowSettingsDialog(true);
          return false;
        }
      }
      return await s.sendFollowUp(message, []);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s is a stable hook result; individual actions are listed
    [
      accomplish,
      s.setPendingFollowUp,
      s.setSettingsInitialTab,
      s.setShowSettingsDialog,
      s.sendFollowUp,
    ],
  );

  const handleContinue = async () => {
    return await resumePausedTask('continue', s.isAuthPause);
  };

  const { pauseAction, setTaskActionError, setIsTaskActionRunning } = s;

  const handlePauseAction = useCallback(async () => {
    if (!pauseAction || pauseAction.type !== 'oauth-connect') {
      return;
    }
    const providerName = getOAuthProviderDisplayName(pauseAction.providerId);
    setTaskActionError(null);
    setIsTaskActionRunning(true);
    try {
      const status = await accomplish.getSlackMcpOauthStatus();
      if (status.pendingAuthorization) {
        await accomplish.logoutSlackMcp();
      }
      if (!status.connected) {
        await accomplish.loginSlackMcp();
      }
      const refreshed = await accomplish.getSlackMcpOauthStatus();
      if (!refreshed.connected) {
        throw new Error(t('questionPrompt.oauthStillDisconnected', { provider: providerName }));
      }
      await resumePausedTask(pauseAction.successText ?? `${providerName} is connected.`, true);
    } catch (error) {
      setTaskActionError(
        error instanceof Error
          ? error.message
          : t('questionPrompt.oauthFailed', { provider: providerName }),
      );
    } finally {
      setIsTaskActionRunning(false);
    }
  }, [accomplish, t, resumePausedTask, pauseAction, setTaskActionError, setIsTaskActionRunning]);

  const handleTaskAction = s.isConnectorAuthPause ? handlePauseAction : handleContinue;

  return { handleContinue, handlePauseAction, handleTaskAction, resumePausedTask };
}
