import {
  useRef,
  useEffect,
  useCallback,
  type RefObject,
  type MutableRefObject,
  type KeyboardEvent,
} from 'react';

interface SlashCommandHandle {
  handleKeyDown: (e: KeyboardEvent) => boolean;
}

interface UseTaskInputBehaviorOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  isInputDisabled: boolean;
  isOverLimit: boolean;
  autoFocus: boolean;
  autoSubmitOnTranscription: boolean;
  canSubmit: boolean;
  isLoading: boolean;
  isRecording: boolean;
  slashCommand: SlashCommandHandle;
  onSubmit: () => void;
  /** Optional external ref for pending auto-submit value (avoids circular dependency). */
  pendingAutoSubmitRef?: MutableRefObject<string | null>;
}

export function useTaskInputBehavior({
  textareaRef,
  value,
  isInputDisabled,
  isOverLimit,
  autoFocus,
  autoSubmitOnTranscription,
  canSubmit,
  isLoading,
  isRecording,
  slashCommand,
  onSubmit,
  pendingAutoSubmitRef: externalPendingAutoSubmitRef,
}: UseTaskInputBehaviorOptions) {
  const internalPendingAutoSubmitRef = useRef<string | null>(null);
  const pendingAutoSubmitRef = externalPendingAutoSubmitRef ?? internalPendingAutoSubmitRef;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus, textareaRef]);

  useEffect(() => {
    if (!autoSubmitOnTranscription || isInputDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isInputDisabled, isOverLimit, onSubmit, value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value, textareaRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (slashCommand.handleKeyDown(e)) {
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit && !isRecording && !isLoading) {
          onSubmit();
        }
      }
    },
    [slashCommand, canSubmit, isRecording, isLoading, onSubmit],
  );

  return { pendingAutoSubmitRef, handleKeyDown };
}
