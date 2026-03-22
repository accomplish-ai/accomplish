/**
 * useBrowserPreview — State management and IPC event hook for BrowserPreview.
 *
 * Encapsulates:
 *  - Frame / URL / status / error state
 *  - Visibility-based pause logic
 *  - Auto-start on browser_* tool detection
 *  - IPC subscription to browser:frame, browser:navigate, browser:status events
 *
 * Extracted from BrowserPreview as part of ENG-982 refactor.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ViewStatus } from './StatusBadge';

interface UseBrowserPreviewOptions {
  taskId: string;
  currentTool?: string | null;
}

interface UseBrowserPreviewResult {
  frameData: string | null;
  currentUrl: string;
  status: ViewStatus;
  error: string | undefined;
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  imgRef: React.RefObject<HTMLImageElement>;
}

export function useBrowserPreview({
  taskId,
  currentTool,
}: UseBrowserPreviewOptions): UseBrowserPreviewResult {
  const imgRef = useRef<HTMLImageElement>(null);
  const isPausedRef = useRef(false);
  const screencastStartedRef = useRef(false);
  const isCollapsedRef = useRef(false);
  const statusRef = useRef<ViewStatus>('idle');

  const [frameData, setFrameData] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [status, setStatus] = useState<ViewStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Reset all preview state when taskId changes to avoid stale guard/frame bleed
  useEffect(() => {
    screencastStartedRef.current = false;
    statusRef.current = 'idle';
    setFrameData(null);
    setCurrentUrl('');
    setStatus('idle');
    setError(undefined);
    setIsCollapsed(false);
  }, [taskId]);

  // Sync isCollapsedRef with isCollapsed state so handleFrame can skip updates when collapsed
  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  // Pause frame updates when the tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isPausedRef.current = document.hidden;
    };
    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Auto-start screencast when a browser_* tool becomes active
  // Contributed by dhruvawani17 (PR #489)
  useEffect(() => {
    if (!currentTool) {
      return;
    }
    const isBrowserTool =
      currentTool.startsWith('browser_') && currentTool !== 'browser_screencast';
    if (!isBrowserTool || screencastStartedRef.current) {
      return;
    }

    const api = window.accomplish;
    if (!api?.startBrowserPreview) {
      return;
    }

    let cancelled = false;
    screencastStartedRef.current = true;
    statusRef.current = 'starting';
    setStatus('starting');

    api.startBrowserPreview(taskId).catch(() => {
      if (cancelled) {
        return;
      }
      // Dev-browser server may not be ready yet — reset so we can retry on next tool call
      screencastStartedRef.current = false;
      statusRef.current = 'idle';
      setFrameData(null);
      setCurrentUrl('');
      setError(undefined);
      setStatus('idle');
    });

    return () => {
      cancelled = true;
    };
  }, [currentTool, taskId]);

  // Subscribe to IPC events from the main process
  const handleFrame = useCallback(
    (event: { taskId: string; pageName: string; frame: string; timestamp: number }) => {
      if (event.taskId !== taskId) {
        return;
      }
      if (isPausedRef.current || isCollapsedRef.current) {
        return;
      }
      if (statusRef.current === 'streaming') {
        // Avoid re-render: write directly to the img element for subsequent frames
        if (imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${event.frame}`;
        }
      } else {
        setFrameData(event.frame);
        if (imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${event.frame}`;
        }
        statusRef.current = 'streaming';
        setStatus('streaming');
      }
    },
    [taskId],
  );

  const handleNavigate = useCallback(
    (event: { taskId: string; pageName: string; url: string }) => {
      if (event.taskId !== taskId) {
        return;
      }
      setCurrentUrl(event.url);
    },
    [taskId],
  );

  const handleStatus = useCallback(
    (event: { taskId: string; pageName: string; status: string; message?: string }) => {
      if (event.taskId !== taskId) {
        return;
      }
      if (event.status === 'stopped') {
        screencastStartedRef.current = false;
        statusRef.current = 'idle';
        setFrameData(null);
        setCurrentUrl('');
        setError(undefined);
        setStatus('idle');
        return;
      }
      if (event.status === 'error') {
        screencastStartedRef.current = false;
      }
      statusRef.current = event.status as ViewStatus;
      setStatus(event.status as ViewStatus);
      if (event.message) {
        setError(event.message);
      } else {
        setError(undefined);
      }
    },
    [taskId],
  );

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
      // Stop preview when component unmounts
      api.stopBrowserPreview?.(taskId).catch(() => {});
    };
  }, [taskId, handleFrame, handleNavigate, handleStatus]);

  return {
    frameData,
    currentUrl,
    status,
    error,
    isCollapsed,
    setIsCollapsed,
    imgRef,
  };
}
