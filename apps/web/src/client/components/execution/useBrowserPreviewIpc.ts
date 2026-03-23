/**
 * useBrowserPreviewIpc — IPC subscription sub-hook for useBrowserPreview.
 *
 * Handles subscribing/unsubscribing to browser:frame, browser:navigate, and
 * browser:status events from the main process, and stops the preview stream
 * when taskId changes or the component unmounts.
 *
 * Extracted from useBrowserPreview.ts to keep file size under 200 lines.
 */

import { useEffect } from 'react';
import type { ViewStatus } from './StatusBadge';

interface UseBrowserPreviewIpcOptions {
  taskId: string;
  handleFrame: (event: {
    taskId: string;
    pageName: string;
    frame: string;
    timestamp: number;
  }) => void;
  handleNavigate: (event: { taskId: string; pageName: string; url: string }) => void;
  handleStatus: (event: {
    taskId: string;
    pageName: string;
    status: string;
    message?: string;
  }) => void;
}

/**
 * Subscribes to IPC events (frame / navigate / status) and cleans up on unmount.
 * Also stops the browser preview stream when taskId changes or component unmounts.
 */
export function useBrowserPreviewIpc({
  taskId,
  handleFrame,
  handleNavigate,
  handleStatus,
}: UseBrowserPreviewIpcOptions): void {
  // Register IPC listeners — re-run when any handler reference changes (e.g. pageName change).
  useEffect(() => {
    const api = window.accomplish;
    if (!api) {
      return;
    }

    const cleanups: (() => void)[] = [];

    if (api.onBrowserFrame) {
      cleanups.push(api.onBrowserFrame(handleFrame));
    }
    if (api.onBrowserNavigate) {
      cleanups.push(api.onBrowserNavigate(handleNavigate));
    }
    if (api.onBrowserStatus) {
      cleanups.push(api.onBrowserStatus(handleStatus));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [taskId, handleFrame, handleNavigate, handleStatus]);

  // Stop the browser preview only when taskId changes or the component unmounts,
  // not when the IPC listener callbacks are rebound (e.g. on pageName change).
  useEffect(() => {
    const api = window.accomplish;
    return () => {
      api?.stopBrowserPreview?.(taskId).catch(() => {});
    };
  }, [taskId]);
}

// Re-export ViewStatus so callers don't need an extra import
export type { ViewStatus };
