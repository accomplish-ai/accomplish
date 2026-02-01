import {
  trackEvent,
  incrementTaskCount,
  getSessionTaskCount,
  getSessionDuration,
  isFirstTaskCompleted,
  markFirstTaskCompleted,
} from './service';

// =============================================================================
// Navigation Events
// =============================================================================

export function trackPageView(pagePath: string, pageTitle?: string): void {
  trackEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle,
    event_category: 'navigation',
  });
}

// =============================================================================
// Engagement Events
// =============================================================================

export function trackSubmitTask(): void {
  trackEvent('submit_task', {
    event_category: 'engagement',
  });
}

export function trackNewTask(): void {
  trackEvent('new_task', {
    event_category: 'engagement',
  });
}

export function trackOpenSettings(): void {
  trackEvent('open_settings', {
    event_category: 'engagement',
  });
}

// =============================================================================
// Settings Events
// =============================================================================

export function trackSaveApiKey(provider: string): void {
  trackEvent('save_api_key', {
    event_category: 'settings',
    provider,
  });
}

export function trackSelectProvider(provider: string): void {
  trackEvent('select_provider', {
    event_category: 'settings',
    provider,
  });
}

export function trackSelectModel(model: string): void {
  trackEvent('select_model', {
    event_category: 'settings',
    model,
  });
}

export function trackToggleDebugMode(enabled: boolean): void {
  trackEvent('toggle_debug_mode', {
    event_category: 'settings',
    enabled,
  });
}

// =============================================================================
// Update Events
// =============================================================================

export function trackUpdateCheck(): void {
  trackEvent('update_check', {
    event_category: 'updates',
  });
}

export function trackUpdateAvailable(currentVersion: string, newVersion: string): void {
  trackEvent('update_available', {
    event_category: 'updates',
    current_version: currentVersion,
    new_version: newVersion,
  });
}

export function trackUpdateNotAvailable(version: string): void {
  trackEvent('update_not_available', {
    event_category: 'updates',
    version,
  });
}

export function trackUpdateDownloadStart(newVersion: string): void {
  trackEvent('update_download_start', {
    event_category: 'updates',
    new_version: newVersion,
  });
}

export function trackUpdateDownloadComplete(newVersion: string): void {
  trackEvent('update_download_complete', {
    event_category: 'updates',
    new_version: newVersion,
  });
}

export function trackUpdateInstallStart(newVersion: string): void {
  trackEvent('update_install_start', {
    event_category: 'updates',
    new_version: newVersion,
  });
}

export function trackUpdateFailed(version: string, errorType: string, errorMessage: string): void {
  trackEvent('update_failed', {
    event_category: 'updates',
    version,
    error_type: errorType,
    error_message: errorMessage,
  });
}

// =============================================================================
// Task Lifecycle Events (NEW)
// =============================================================================

export function trackTaskStart(): void {
  incrementTaskCount();
  trackEvent('task_start', {
    event_category: 'task_lifecycle',
  });
}

export function trackTaskComplete(durationSeconds: number, hadErrors: boolean): void {
  trackEvent('task_complete', {
    event_category: 'task_lifecycle',
    duration_seconds: durationSeconds,
    had_errors: hadErrors,
  });

  // Track first task completion (activation metric)
  if (!isFirstTaskCompleted()) {
    markFirstTaskCompleted();
    trackEvent('first_task_complete', {
      event_category: 'activation',
    });
  }
}

export function trackTaskCancel(durationBeforeCancel: number): void {
  trackEvent('task_cancel', {
    event_category: 'task_lifecycle',
    duration_before_cancel: durationBeforeCancel,
  });
}

export function trackTaskError(errorType: string): void {
  trackEvent('task_error', {
    event_category: 'task_lifecycle',
    error_type: errorType,
  });
}

export function trackPermissionRequested(permissionType: string): void {
  trackEvent('permission_requested', {
    event_category: 'task_lifecycle',
    permission_type: permissionType,
  });
}

export function trackPermissionResponse(permissionType: string, granted: boolean): void {
  trackEvent('permission_response', {
    event_category: 'task_lifecycle',
    permission_type: permissionType,
    granted,
  });
}

// =============================================================================
// Session Events (NEW)
// =============================================================================

export function trackSessionEnd(): void {
  trackEvent('session_end', {
    event_category: 'session',
    duration_seconds: getSessionDuration(),
    task_count: getSessionTaskCount(),
  });
}

export function trackAppBackgrounded(): void {
  trackEvent('app_backgrounded', {
    event_category: 'session',
  });
}

export function trackAppForegrounded(): void {
  trackEvent('app_foregrounded', {
    event_category: 'session',
  });
}

// =============================================================================
// Onboarding Events (NEW)
// =============================================================================

export function trackOnboardingStep(step: string): void {
  trackEvent('onboarding_step', {
    event_category: 'onboarding',
    step,
  });
}

export function trackOnboardingComplete(provider: string): void {
  trackEvent('onboarding_complete', {
    event_category: 'onboarding',
    provider,
  });
}

export function trackOnboardingAbandoned(lastStep: string): void {
  trackEvent('onboarding_abandoned', {
    event_category: 'onboarding',
    last_step: lastStep,
  });
}

// =============================================================================
// Feature Usage Events (NEW)
// =============================================================================

export function trackHistoryViewed(): void {
  trackEvent('history_viewed', {
    event_category: 'feature_usage',
  });
}

export function trackTaskFromHistory(): void {
  trackEvent('task_from_history', {
    event_category: 'feature_usage',
  });
}

export function trackHistoryCleared(): void {
  trackEvent('history_cleared', {
    event_category: 'feature_usage',
  });
}

export function trackTaskDetailsExpanded(): void {
  trackEvent('task_details_expanded', {
    event_category: 'feature_usage',
  });
}

export function trackOutputCopied(): void {
  trackEvent('output_copied', {
    event_category: 'feature_usage',
  });
}
