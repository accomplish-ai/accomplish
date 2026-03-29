import { useEffect, useCallback } from 'react';
import { hasAnyReadyProvider, getOAuthProviderDisplayName } from '@accomplish_ai/agent-core/common';
import { createLogger } from '../../lib/logger';
import type { useExecutionCore } from './useExecutionCore';

const logger = createLogger('ExecutionActions');

type CoreState = ReturnType<typeof useExecutionCore>;

/** Action callbacks for the execution page. Derived from core state. */
export function useExecutionActions(s: CoreState) {
  const { id, navigate, accomplish, t } = s;

  useEffect(() => {
    s.setTaskActionError(null);
    s.setIsTaskActionRunning(false);
    const action = s.currentTask?.result?.pauseAction;
    if (
      s.currentTask?.status === 'completed' &&
      s.currentTask?.result?.pauseReason === 'auth' &&
      action?.type === 'oauth-connect'
    ) {
      void accomplish.getSlackMcpOauthStatus().then((status) => {
        if (status.pendingAuthorization) {
          void accomplish.logoutSlackMcp();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s.setTaskActionError/setIsTaskActionRunning are stable store actions
  }, [
    accomplish,
    s.currentTask?.id,
    s.currentTask?.status,
    s.currentTask?.result?.pauseReason,
    s.currentTask?.result?.pauseAction,
    s.currentTask?.result?.pauseAction?.type,
    s.currentTask?.result?.pauseAction?.providerId,
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
      await s.sendFollowUp(message, []);
      return true;
    },
    [accomplish, s.setPendingFollowUp, s.setSettingsInitialTab, s.setShowSettingsDialog, s.sendFollowUp],
  );

  const handleFollowUp = useCallback(async () => {
    if (!s.followUp.trim() && s.attachments.length === 0) {
      return;
    }
    if (s.followUp.length > 0 && s.isFollowUpOverLimit) {
      return;
    }
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        s.setPendingFollowUp(s.followUp);
        s.setSettingsInitialTab('providers');
        s.setShowSettingsDialog(true);
        return;
      }
    }
    const ok = await s.sendFollowUp(s.followUp, s.attachments);
    if (ok) {
      s.setFollowUp('');
      s.setAttachments([]);
    }
  }, [accomplish, s]);

  useEffect(() => {
    if (!s.pendingSpeechFollowUpRef.current) {
      return;
    }
    if (!s.canFollowUp || s.isLoading) {
      return;
    }
    if (s.followUp !== s.pendingSpeechFollowUpRef.current) {
      return;
    }
    s.pendingSpeechFollowUpRef.current = null;
    void handleFollowUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.canFollowUp, s.followUp, s.isLoading, handleFollowUp]);

  const handleSettingsDialogClose = (open: boolean) => {
    s.setShowSettingsDialog(open);
    if (!open) {
      s.setPendingFollowUp(null);
      s.setSettingsInitialTab('providers');
    }
  };

  const handleApiKeySaved = async () => {
    s.setShowSettingsDialog(false);
    if (s.pendingFollowUp) {
      const ok = await s.sendFollowUp(s.pendingFollowUp, s.attachments);
      if (ok) {
        s.setFollowUp('');
        s.setPendingFollowUp(null);
        s.setAttachments([]);
      }
    }
  };

  const handleContinue = async () => {
    await resumePausedTask('continue', s.isAuthPause);
  };

  const handlePauseAction = useCallback(async () => {
    if (!s.pauseAction || s.pauseAction.type !== 'oauth-connect') {
      return;
    }
    const providerName = getOAuthProviderDisplayName(s.pauseAction.providerId);
    s.setTaskActionError(null);
    s.setIsTaskActionRunning(true);
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
      await resumePausedTask(s.pauseAction.successText ?? `${providerName} is connected.`, true);
    } catch (error) {
      s.setTaskActionError(
        error instanceof Error
          ? error.message
          : t('questionPrompt.oauthFailed', { provider: providerName }),
      );
    } finally {
      s.setIsTaskActionRunning(false);
    }
  }, [accomplish, s, t, resumePausedTask]);

  const handleTaskAction = s.isConnectorAuthPause ? handlePauseAction : handleContinue;

  const handlePermissionResponse = async (
    allowed: boolean,
    selectedOpts?: string[],
    customText?: string,
  ) => {
    if (!s.permissionRequest || !s.currentTask) {
      return;
    }
    await s.respondToPermission({
      requestId: s.permissionRequest.id,
      taskId: s.permissionRequest.taskId,
      decision: allowed ? 'allow' : 'deny',
      selectedOptions: selectedOpts,
      customText: customText,
    });
    if (!allowed && s.permissionRequest.type === 'question') {
      s.interruptTask();
    }
  };

  const handleBugReport = useCallback(async () => {
    if (!s.currentTask || !id) {
      return;
    }
    s.setBugReporting(true);
    try {
      const [screenshotResult, axtreeResult] = await Promise.all([
        accomplish.captureScreenshot(),
        accomplish.captureAxtree(),
      ]);
      const result = await accomplish.generateBugReport({
        taskId: s.currentTask.id,
        taskPrompt: s.currentTask.prompt,
        taskStatus: s.currentTask.status,
        taskCreatedAt: s.currentTask.createdAt,
        taskCompletedAt: s.currentTask.completedAt,
        messages: s.currentTask.messages as unknown[],
        debugLogs: s.debugLogs as unknown[],
        screenshot: screenshotResult.success ? screenshotResult.data : undefined,
        axtree: axtreeResult.success ? axtreeResult.data : undefined,
      });
      if (result.success) {
        s.setBugReportSaved(true);
        if (s.bugSavedTimerRef.current) {
          clearTimeout(s.bugSavedTimerRef.current);
        }
        s.bugSavedTimerRef.current = setTimeout(() => {
          s.setBugReportSaved(false);
          s.bugSavedTimerRef.current = null;
        }, 2500);
      }
    } catch (err) {
      logger.error('Bug report failed:', err);
    } finally {
      s.setBugReporting(false);
    }
  }, [accomplish, s, id]);

  const handleRepeatTask = useCallback(async () => {
    if (!s.currentTask) {
      return;
    }
    if (
      ['pending', 'queued', 'running', 'waiting_permission', 'waiting'].includes(
        s.currentTask.status,
      )
    ) {
      return;
    }
    s.setRepeatingTask(true);
    try {
      const newTask = await accomplish.startTask({ prompt: s.currentTask.prompt });
      navigate(`/execution/${newTask.id}`);
    } catch (err) {
      logger.error('Failed to repeat task:', err);
    } finally {
      s.setRepeatingTask(false);
    }
  }, [accomplish, s, navigate]);

  const handleOpenSpeechSettings = useCallback(() => {
    s.setSettingsInitialTab('voice');
    s.setShowSettingsDialog(true);
  }, [s]);
  const handleOpenModelSettings = useCallback(() => {
    s.setSettingsInitialTab('providers');
    s.setShowSettingsDialog(true);
  }, [s]);

  return {
    handleFollowUp,
    handleSettingsDialogClose,
    handleApiKeySaved,
    handleContinue,
    handlePauseAction,
    handleTaskAction,
    handlePermissionResponse,
    handleBugReport,
    handleRepeatTask,
    handleOpenSpeechSettings,
    handleOpenModelSettings,
  };
}
