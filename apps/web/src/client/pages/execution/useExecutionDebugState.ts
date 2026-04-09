import { useState, useRef, useEffect } from 'react';
import { createLogger } from '../../lib/logger';
import type { DebugLogEntry } from '../../components/execution/DebugPanel';

const logger = createLogger('Execution');

interface UseExecutionDebugStateOptions {
  accomplish: ReturnType<typeof import('../../lib/accomplish').getAccomplish>;
  startupStageTaskId: string | null | undefined;
  startupStage: { startTime: number; stage: string; message?: string } | null | undefined;
  id: string | undefined;
  currentTool: string | null;
}

/** Manages debug mode, bug report state, and elapsed time for the execution page. */
export function useExecutionDebugState({
  accomplish,
  startupStageTaskId,
  startupStage,
  id,
  currentTool,
}: UseExecutionDebugStateOptions) {
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [bugReporting, setBugReporting] = useState(false);
  const [bugReportSaved, setBugReportSaved] = useState(false);
  const bugSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    accomplish
      .getDebugMode()
      .then(setDebugModeEnabled)
      .catch((err: unknown) => {
        logger.error('Failed to get debug mode:', err);
      });
    const unsub = accomplish.onDebugModeChange?.(({ enabled }: { enabled: boolean }) => {
      setDebugModeEnabled(enabled);
    });
    return () => {
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isShowing = startupStageTaskId === id && startupStage && !currentTool;
    if (!isShowing) {
      setElapsedTime(0);
      return;
    }
    const calc = () => Math.floor((Date.now() - startupStage.startTime) / 1000);
    setElapsedTime(calc());
    const interval = setInterval(() => {
      setElapsedTime(calc());
    }, 1000);
    return () => clearInterval(interval);
  }, [startupStageTaskId, startupStage, id, currentTool]);

  useEffect(() => {
    return () => {
      if (bugSavedTimerRef.current) {
        clearTimeout(bugSavedTimerRef.current);
        bugSavedTimerRef.current = null;
      }
    };
  }, []);

  return {
    debugLogs,
    setDebugLogs,
    debugModeEnabled,
    bugReporting,
    setBugReporting,
    bugReportSaved,
    setBugReportSaved,
    bugSavedTimerRef,
    elapsedTime,
  };
}
