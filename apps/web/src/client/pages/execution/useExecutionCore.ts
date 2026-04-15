import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useTaskStore } from '../../stores/taskStore';
import { getAccomplish } from '../../lib/accomplish';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { useSlashCommand } from '../../hooks/useSlashCommand';
import { useExecutionAttachments } from './useExecutionAttachments';
import { useExecutionEvents } from './useExecutionEvents';
import { useExecutionScroll } from './useExecutionScroll';
import { useExecutionDebugState } from './useExecutionDebugState';

/** Core state and effects for the execution page. */
export function useExecutionCore() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const { t } = useTranslation('execution');
  const { t: tCommon } = useTranslation('common');

  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const pendingSpeechFollowUpRef = useRef<string | null>(null);

  const [followUp, setFollowUp] = useState('');
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentToolInput, setCurrentToolInput] = useState<unknown>(null);
  const [repeatingTask, setRepeatingTask] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'integrations'
  >('providers');
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [isTaskActionRunning, setIsTaskActionRunning] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);

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

  const scroll = useExecutionScroll();

  const debug = useExecutionDebugState({
    accomplish,
    startupStageTaskId,
    startupStage,
    id,
    currentTool,
  });

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
    setDebugLogs: debug.setDebugLogs,
    loadTaskById,
  });

  useEffect(() => {
    if (scroll.isAtBottom) {
      scroll.scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll object reference changes on every render; individual properties are stable
  }, [currentTask?.id, currentTask?.messages?.length, scroll.scrollToBottom, scroll.isAtBottom]);

  const permissionRequest = (id ? permissionRequests[id] : undefined) ?? null;
  const isComplete = ['completed', 'failed', 'cancelled', 'interrupted'].includes(
    currentTask?.status ?? '',
  );
  const hasSession = currentTask?.sessionId || currentTask?.result?.sessionId;
  const result = currentTask?.result;
  const isAuthPause = result && 'pauseReason' in result && result.pauseReason === 'oauth';
  const pauseAction = result && 'pauseAction' in result ? result.pauseAction : undefined;
  const canFollowUp = isComplete && (hasSession || currentTask?.status === 'interrupted');
  const isConnectorAuthPause: boolean = !!(
    currentTask?.status === 'completed' &&
    isAuthPause &&
    pauseAction?.type === 'oauth-connect'
  );
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
    followUpInputRef,
    pendingSpeechFollowUpRef,
    followUp,
    setFollowUp,
    currentTool,
    setCurrentTool,
    currentToolInput,
    setCurrentToolInput,
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
    // scroll
    ...scroll,
    // debug
    ...debug,
  };
}
