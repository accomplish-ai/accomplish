/**
 * Analytics IPC handlers — bridges renderer analytics calls to main process event helpers.
 *
 * The renderer calls window.accomplish.analytics.trackXxx(...) which invokes
 * ipcRenderer.invoke('analytics:xxx', ...) → handled here → calls event helpers.
 */

import type { IpcMainInvokeEvent } from 'electron';
import { handle } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';
import { isAnalyticsEnabled } from '../../config/build-config';
import type { TaskErrorCategory } from '../../analytics/types';
import {
  trackEvent,
  trackAppClose,
  trackAppBackgrounded,
  trackAppForegrounded,
  trackPageView,
  trackSubmitTask,
  trackNewTask,
  trackOpenSettings,
  trackSaveApiKey,
  trackSelectProvider,
  trackSelectModel,
  trackToggleDebugMode,
  trackTaskStart,
  trackTaskComplete,
  trackTaskError,
  trackPermissionRequested,
  trackPermissionResponse,
  trackToolUsed,
  trackUserInteraction,
  trackModelSelectionStep,
  trackModelSelectionComplete,
  trackModelSelectionAbandoned,
  trackHistoryViewed,
  trackTaskFromHistory,
  trackHistoryCleared,
  trackTaskDetailsExpanded,
  trackOutputCopied,
  trackProviderDisconnected,
  trackHelpLinkClicked,
  trackSkillAction,
  trackSaveVoiceApiKey,
  trackExportLogs,
  trackThreadExported,
  trackTaskLauncherAction,
  trackTaskFeedback,
  trackStopAgent,
  trackProviderBoxClicked,
} from '../../analytics';

/**
 * Look up the currently selected model + provider via the daemon.
 * Used by task-lifecycle analytics events to attach model context.
 *
 * Milestone 5 of the daemon-only-SQLite migration: pre-M5 this ran a
 * raw `SELECT ... FROM provider_configs WHERE is_selected = 1` against
 * main's in-process DB handle. That handle is gone — now we go through
 * `provider.getSettings`, pull the active provider id, and read its
 * `selectedModelId`. Returns an empty object on RPC error so analytics
 * events never block on a slow/broken daemon.
 */
async function getSelectedModelContext(): Promise<{
  model?: string;
  provider?: string;
}> {
  try {
    const settings = await getDaemonClient().call('provider.getSettings');
    const activeId = settings.activeProviderId;
    if (!activeId) {
      return {};
    }
    const active = settings.connectedProviders[activeId];
    return {
      provider: activeId,
      model: active?.selectedModelId ?? undefined,
    };
  } catch {
    return {};
  }
}

export function registerAnalyticsHandlers(): void {
  const analyticsEnabled = isAnalyticsEnabled();

  // When analytics is disabled, register no-op handlers so the renderer's
  // ipcRenderer.invoke() calls don't produce "No handler registered" errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ha(channel: string, fn: (event: any, ...args: any[]) => Promise<unknown>): void {
    handle(channel, analyticsEnabled ? fn : async () => {});
  }

  // Generic event tracking
  ha(
    'analytics:track',
    async (
      _event: IpcMainInvokeEvent,
      eventName: string,
      params?: Record<string, string | number | boolean>,
    ) => {
      trackEvent(eventName, params);
    },
  );

  // Navigation
  ha(
    'analytics:page-view',
    async (_event: IpcMainInvokeEvent, pagePath: string, pageTitle?: string) => {
      trackPageView(pagePath, pageTitle);
    },
  );

  // Engagement
  ha('analytics:submit-task', async () => {
    const { model, provider } = await getSelectedModelContext();
    trackSubmitTask(model, provider);
  });

  ha('analytics:new-task', async () => {
    trackNewTask();
  });

  ha('analytics:open-settings', async () => {
    trackOpenSettings();
  });

  // Settings
  ha(
    'analytics:save-api-key',
    async (
      _event: IpcMainInvokeEvent,
      provider: string,
      success: boolean,
      connectionMethod?: string,
    ) => {
      trackSaveApiKey(provider, success, connectionMethod);
    },
  );

  ha('analytics:select-provider', async (_event: IpcMainInvokeEvent, provider: string) => {
    trackSelectProvider(provider);
  });

  ha(
    'analytics:select-model',
    async (_event: IpcMainInvokeEvent, model: string, provider?: string) => {
      trackSelectModel(model, provider);
    },
  );

  ha('analytics:toggle-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    trackToggleDebugMode(enabled);
  });

  // Task Lifecycle (from renderer — e.g., when renderer knows task state)
  ha(
    'analytics:task-start',
    async (_event: IpcMainInvokeEvent, taskId: string, sessionId: string, taskType: string) => {
      const { model, provider } = await getSelectedModelContext();
      trackTaskStart({ taskId, sessionId, taskType }, model, provider);
    },
  );

  ha(
    'analytics:task-complete',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      hadErrors: boolean,
    ) => {
      const { model, provider } = await getSelectedModelContext();
      trackTaskComplete(
        { taskId, sessionId, taskType },
        durationMs,
        totalSteps,
        hadErrors,
        model,
        undefined,
        undefined,
        provider,
      );
    },
  );

  ha(
    'analytics:task-error',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      durationMs: number,
      totalSteps: number,
      errorType: string,
    ) => {
      const { model, provider } = await getSelectedModelContext();
      trackTaskError(
        { taskId, sessionId, taskType },
        durationMs,
        totalSteps,
        errorType as TaskErrorCategory,
        model,
        undefined,
        undefined,
        provider,
      );
    },
  );

  ha(
    'analytics:permission-requested',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
    ) => {
      trackPermissionRequested({ taskId, sessionId, taskType }, permissionType);
    },
  );

  ha(
    'analytics:permission-response',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      permissionType: string,
      granted: boolean,
    ) => {
      trackPermissionResponse({ taskId, sessionId, taskType }, permissionType, granted);
    },
  );

  ha(
    'analytics:tool-used',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      toolName: string,
    ) => {
      trackToolUsed({ taskId, sessionId, taskType }, toolName);
    },
  );

  ha(
    'analytics:user-interaction',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      taskType: string,
      interactionType: string,
      usedSuggestion: boolean,
    ) => {
      trackUserInteraction({ taskId, sessionId, taskType }, interactionType, usedSuggestion);
    },
  );

  // Session
  ha('analytics:app-close', async () => {
    await trackAppClose();
  });

  ha('analytics:app-backgrounded', async () => {
    trackAppBackgrounded();
  });

  ha('analytics:app-foregrounded', async () => {
    trackAppForegrounded();
  });

  // Model Selection
  ha(
    'analytics:model-selection-step',
    async (
      _event: IpcMainInvokeEvent,
      step: string,
      isOnboarding: boolean,
      provider?: string,
      model?: string,
    ) => {
      trackModelSelectionStep(step, isOnboarding, provider, model);
    },
  );

  ha(
    'analytics:model-selection-complete',
    async (_event: IpcMainInvokeEvent, provider: string, isOnboarding: boolean, model?: string) => {
      trackModelSelectionComplete(provider, isOnboarding, model);
    },
  );

  ha(
    'analytics:model-selection-abandoned',
    async (_event: IpcMainInvokeEvent, lastStep: string, isOnboarding: boolean) => {
      trackModelSelectionAbandoned(lastStep, isOnboarding);
    },
  );

  // Feature Usage
  ha('analytics:history-viewed', async () => {
    trackHistoryViewed();
  });
  ha('analytics:task-from-history', async () => {
    trackTaskFromHistory();
  });
  ha('analytics:history-cleared', async () => {
    trackHistoryCleared();
  });
  ha('analytics:task-details-expanded', async () => {
    trackTaskDetailsExpanded();
  });
  ha('analytics:output-copied', async () => {
    trackOutputCopied();
  });

  // Provider Lifecycle
  ha('analytics:provider-disconnected', async (_event: IpcMainInvokeEvent, provider: string) => {
    trackProviderDisconnected(provider);
  });

  ha('analytics:help-link-clicked', async (_event: IpcMainInvokeEvent, provider: string) => {
    trackHelpLinkClicked(provider);
  });

  // Skills
  ha(
    'analytics:skill-action',
    async (
      _event: IpcMainInvokeEvent,
      params: {
        action: string;
        skill_name?: string;
        enabled?: boolean;
        filter?: string;
        source?: string;
      },
    ) => {
      trackSkillAction(params);
    },
  );

  // Voice
  ha('analytics:save-voice-api-key', async (_event: IpcMainInvokeEvent, success: boolean) => {
    trackSaveVoiceApiKey(success);
  });

  // Debug
  ha('analytics:export-logs', async () => {
    trackExportLogs();
  });
  ha('analytics:thread-exported', async () => {
    trackThreadExported();
  });

  // Task Launcher
  ha('analytics:task-launcher-action', async (_event: IpcMainInvokeEvent, action: string) => {
    trackTaskLauncherAction(action);
  });

  // Task Feedback
  ha(
    'analytics:task-feedback',
    async (
      _event: IpcMainInvokeEvent,
      taskId: string,
      sessionId: string,
      rating: string,
      taskStatus: string,
      feedbackStage: string,
      feedbackReason?: string,
      feedbackText?: string,
    ) => {
      trackTaskFeedback(
        taskId,
        sessionId,
        rating,
        taskStatus,
        feedbackStage,
        undefined,
        undefined,
        feedbackReason,
        feedbackText,
      );
    },
  );

  // Agent Control
  ha(
    'analytics:stop-agent',
    async (_event: IpcMainInvokeEvent, taskId: string, sessionId: string) => {
      trackStopAgent(taskId, sessionId);
    },
  );

  // Provider Box
  ha(
    'analytics:provider-box-clicked',
    async (
      _event: IpcMainInvokeEvent,
      params: { provider_id: string; is_connected: boolean; is_onboarding: boolean },
    ) => {
      trackProviderBoxClicked(params);
    },
  );
}
