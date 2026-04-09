import { useEffect, useCallback } from 'react';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { createLogger } from '../../lib/logger';
import type { useExecutionCore } from './useExecutionCore';
import { useExecutionEffects } from './useExecutionEffects';
import { useExecutionPauseActions } from './useExecutionPauseActions';

const logger = createLogger('ExecutionActions');

type CoreState = ReturnType<typeof useExecutionCore>;

/** Action callbacks for the execution page. Derived from core state. */
export function useExecutionActions(s: CoreState) {
  const { id, navigate, accomplish } = s;

  useExecutionEffects(s, accomplish);

  const { handleContinue, handlePauseAction, handleTaskAction } = useExecutionPauseActions(s);

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
