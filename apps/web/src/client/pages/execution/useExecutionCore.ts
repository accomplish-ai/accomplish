import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { createLogger } from '../../lib/logger';
import { useTaskStore } from '../../stores/taskStore';
import { getAccomplish } from '../../lib/accomplish';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { useSlashCommand } from '../../hooks/useSlashCommand';
import type { DebugLogEntry } from '../../components/execution/DebugPanel';
import { useExecutionAttachments } from './useExecutionAttachments';
import { useExecutionEvents } from './useExecutionEvents';

const logger = createLogger('Execution');

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

/** Core state and effects for the execution page. */
export function useExecutionCore() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const { t } = useTranslation('execution');
  const { t: tCommon } = useTranslation('common');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bugSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpeechFollowUpRef = useRef<string | null>(null);

  const [followUp, setFollowUp] = useState('');
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentToolInput, setCurrentToolInput] = useState<unknown>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [bugReporting, setBugReporting] = useState(false);
  const [bugReportSaved, setBugReportSaved] = useState(false);
  const [repeatingTask, setRepeatingTask] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors'
  >('providers');
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [isTaskActionRunning, setIsTaskActionRunning] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);

  const {
    currentTask,
    loadTaskById,
    isLoading,
    error,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    permissionRequests,
    respondToPermission,
    sendFollowUp,
    interruptTask,
    setupProgress,
    setupProgressTaskId,
    setupDownloadStep,
    startupStage,
    startupStageTaskId,
    clearStartupStage,
    todos,
    todosTaskId,
  } = useTaskStore();

  const attachmentState = useExecutionAttachments(accomplish);

  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      setFollowUp((prev) => {
        const newValue = prev.trim() ? `${prev} ${text}` : text;
        pendingSpeechFollowUpRef.current = newValue.trim() ? newValue : null;
        return newValue;
      });
      setTimeout(() => {
        followUpInputRef.current?.focus();
      }, 0);
    },
    onError: () => {},
  });

  const slashCommand = useSlashCommand({
    value: followUp,
    textareaRef: followUpInputRef,
    onChange: setFollowUp,
  });

  const scrollToBottom = useMemo(
    () =>
      debounce(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100),
    [],
  );

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 150;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    accomplish
      .getDebugMode()
      .then(setDebugModeEnabled)
      .catch((err) => {
        logger.error('Failed to get debug mode:', err);
      });
    const unsub = accomplish.onDebugModeChange?.(({ enabled }) => {
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

  useExecutionEvents({
    id,
    accomplish,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    setCurrentTool,
    setCurrentToolInput,
    clearStartupStage,
    setDebugLogs,
    loadTaskById,
  });

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [currentTask?.messages?.length, scrollToBottom, isAtBottom]);

  const permissionRequest = (id ? permissionRequests[id] : undefined) ?? null;
  const isComplete = ['completed', 'failed', 'cancelled', 'interrupted'].includes(
    currentTask?.status ?? '',
  );
  const hasSession = currentTask?.sessionId || currentTask?.result?.sessionId;
  const isAuthPause = currentTask?.result?.pauseReason === 'auth';
  const pauseAction = currentTask?.result?.pauseAction;
  const canFollowUp = isComplete && (hasSession || currentTask?.status === 'interrupted');
  const isConnectorAuthPause =
    currentTask?.status === 'completed' && isAuthPause && pauseAction?.type === 'oauth-connect';
  let taskActionLabel: string;
  if (currentTask?.status === 'interrupted') {
    taskActionLabel = tCommon('buttons.continue');
  } else if (isConnectorAuthPause) {
    taskActionLabel = pauseAction!.label;
  } else {
    taskActionLabel = tCommon('buttons.doneContinue');
  }
  const taskActionPendingLabel = isConnectorAuthPause ? pauseAction!.pendingLabel : undefined;
  const isFollowUpOverLimit = followUp.length > PROMPT_DEFAULT_MAX_LENGTH;

  return {
    id,
    navigate,
    accomplish,
    t,
    tCommon,
    messagesEndRef,
    followUpInputRef,
    scrollContainerRef,
    bugSavedTimerRef,
    pendingSpeechFollowUpRef,
    followUp,
    setFollowUp,
    currentTool,
    setCurrentTool,
    currentToolInput,
    setCurrentToolInput,
    debugLogs,
    setDebugLogs,
    debugModeEnabled,
    bugReporting,
    setBugReporting,
    bugReportSaved,
    setBugReportSaved,
    repeatingTask,
    setRepeatingTask,
    showSettingsDialog,
    setShowSettingsDialog,
    settingsInitialTab,
    setSettingsInitialTab,
    taskActionError,
    setTaskActionError,
    isTaskActionRunning,
    setIsTaskActionRunning,
    pendingFollowUp,
    setPendingFollowUp,
    isAtBottom,
    elapsedTime,
    currentTask,
    loadTaskById,
    isLoading,
    error,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    permissionRequests,
    respondToPermission,
    sendFollowUp,
    interruptTask,
    setupProgress,
    setupProgressTaskId,
    setupDownloadStep,
    startupStage,
    startupStageTaskId,
    clearStartupStage,
    todos,
    todosTaskId,
    ...attachmentState,
    speechInput,
    slashCommand,
    scrollToBottom,
    handleScroll,
    permissionRequest,
    isComplete,
    hasSession,
    isAuthPause,
    pauseAction,
    canFollowUp,
    isConnectorAuthPause,
    taskActionLabel,
    taskActionPendingLabel,
    isFollowUpOverLimit,
  };
}
