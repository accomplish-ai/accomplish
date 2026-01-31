'use client';

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle } from 'lucide-react';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  /**
   * Called when user clicks mic button while voice input is not configured
   * (to open settings dialog)
   */
  onOpenSpeechSettings?: () => void;
  /**
   * Automatically submit after a successful transcription.
   */
  autoSubmitOnTranscription?: boolean;
}

export default function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  autoSubmitOnTranscription = true,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();

  // Speech input hook
  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      // Append transcribed text to existing input
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);

      if (autoSubmitOnTranscription && newValue.trim()) {
        pendingAutoSubmitRef.current = newValue;
      }

      // Auto-focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    onError: (error) => {
      console.error('[Speech] Error:', error.message);
      // Error is stored in speechInput.error state
    },
  });

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-submit once the parent value reflects the transcription.
  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isDisabled, onSubmit, value]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Error message */}
      {speechInput.error && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">
            {speechInput.error.message}
            {speechInput.error.code === 'EMPTY_RESULT' && (
              <button
                onClick={() => speechInput.retry()}
                className="ml-2 underline hover:no-underline"
                type="button"
              >
                {t('buttons.retry')}
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Input container */}
      <div className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        {/* Text input */}
        <textarea
          data-testid="task-input-textarea"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled || speechInput.isRecording}
          rows={1}
          className={`max-h-[200px] flex-1 resize-none bg-transparent text-foreground placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${large ? 'text-[20px]' : 'text-sm'}`}
        />

        {/* Speech Input Button */}
        <SpeechInputButton
          isRecording={speechInput.isRecording}
          isTranscribing={speechInput.isTranscribing}
          recordingDuration={speechInput.recordingDuration}
          error={speechInput.error}
          isConfigured={speechInput.isConfigured}
          disabled={isDisabled}
          onStartRecording={() => speechInput.startRecording()}
          onStopRecording={() => speechInput.stopRecording()}
          onCancel={() => speechInput.cancelRecording()}
          onRetry={() => speechInput.retry()}
          onOpenSettings={onOpenSpeechSettings}
          size="md"
        />

        {/* Submit button */}
        <button
          data-testid="task-input-submit"
          type="button"
          onClick={() => {
            accomplish.logEvent({
              level: 'info',
              message: 'Task input submit clicked',
              context: { prompt: value },
            });
            onSubmit();
          }}
          disabled={!value.trim() || isDisabled || speechInput.isRecording}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 ease-accomplish hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          title={t('buttons.submit')}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CornerDownLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
