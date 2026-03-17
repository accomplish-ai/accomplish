'use client';

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import {
  ArrowUp,
  WarningCircle,
  X,
  FileText,
  Image,
  Code,
  File,
  FilePdf,
} from '@phosphor-icons/react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useTypingPlaceholder } from '@/hooks/useTypingPlaceholder';
import { SpeechInputButton } from '@/components/ui/SpeechInputButton';
import { ModelIndicator } from '@/components/ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { MAX_FILES, MAX_FILE_SIZE, formatFileSize, processFileAttachments } from '@/lib/fileUtils';

function FileTypeIcon({
  type,
  className,
}: {
  type: FileAttachmentInfo['type'];
  className?: string;
}) {
  switch (type) {
    case 'image':
      return <Image className={className} />;
    case 'text':
      return <FileText className={className} />;
    case 'code':
      return <Code className={className} />;
    case 'pdf':
      return <FilePdf className={className} />;
    default:
      return <File className={className} />;
  }
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  typingPlaceholder?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  onOpenSpeechSettings?: () => void;
  onOpenModelSettings?: () => void;
  hideModelWhenNoModel?: boolean;
  autoSubmitOnTranscription?: boolean;
  toolbarLeft?: ReactNode;
  attachments?: FileAttachmentInfo[];
  onAttachmentsChange?: (attachments: FileAttachmentInfo[]) => void;
}

export function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  typingPlaceholder = false,
  isLoading = false,
  disabled = false,
  large: _large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
  toolbarLeft,
  attachments = [],
  onAttachmentsChange,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');
  const isInputDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = (!!value.trim() || attachments.length > 0) && !disabled && !isOverLimit;
  const isSubmitDisabled = !isLoading && (!canSubmit || isInputDisabled);
  const submitLabel = isLoading ? t('buttons.stop') : t('buttons.submit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animatedPlaceholder = useTypingPlaceholder({
    enabled: typingPlaceholder && !value,
    text: placeholder,
  });
  const effectivePlaceholder = typingPlaceholder && !value ? animatedPlaceholder : placeholder;
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (!onAttachmentsChange) {
        return;
      }

      setAttachmentError(null);
      const accepted = processFileAttachments(fileList, attachments.length, {
        onOversize: (name, limit) =>
          setAttachmentError(t('plusMenu.fileTooLarge', { name, limit })),
        onOverLimit: (_count, max) => setAttachmentError(t('plusMenu.tooManyFiles', { max })),
      });
      if (accepted.length > 0) {
        onAttachmentsChange([...attachments, ...accepted]);
      }
    },
    [attachments, onAttachmentsChange, t],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      if (onAttachmentsChange) {
        onAttachmentsChange(attachments.filter((a) => a.id !== id));
      }
    },
    [attachments, onAttachmentsChange],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      if (e.dataTransfer.types.includes('Files') && !isInputDisabled) {
        setIsDragOver(true);
      }
    },
    [isInputDisabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      if (isInputDisabled || !e.dataTransfer.files.length) {
        return;
      }

      addFiles(e.dataTransfer.files);
    },
    [isInputDisabled, addFiles],
  );

  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);

      if (autoSubmitOnTranscription && newValue.trim()) {
        pendingAutoSubmitRef.current = newValue;
      }

      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    onError: (error) => {
      console.error('[Speech] Error:', error.message);
    },
  });

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

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
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit && !speechInput.isRecording && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      {speechInput.error && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <WarningCircle className="h-4 w-4" />
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

      <div
        className={cn(
          'rounded-[12px] border bg-popover/70 transition-all duration-200 ease-accomplish cursor-text focus-within:border-muted-foreground/40',
          isDragOver
            ? 'border-primary border-dashed ring-1 ring-primary bg-primary/5'
            : 'border-border',
        )}
        onClick={() => !isDragOver && textareaRef.current?.focus()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="px-4 py-3 text-center text-sm text-primary font-medium">
            {t('plusMenu.dropFilesHere')}{' '}
            <span className="text-muted-foreground font-normal">
              {t('plusMenu.dropFilesHint', { max: MAX_FILES, size: MAX_FILE_SIZE / 1024 / 1024 })}
            </span>
          </div>
        )}

        {!isDragOver && (
          <div className="px-4 pt-3 pb-1">
            <textarea
              data-testid="task-input-textarea"
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={effectivePlaceholder}
              disabled={isInputDisabled || speechInput.isRecording}
              rows={3}
              className="w-full min-h-[60px] max-h-[200px] resize-none overflow-y-auto bg-transparent text-[16px] leading-relaxed tracking-[-0.015em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}

        {attachmentError && (
          <div className="px-4 py-1.5 text-xs text-destructive flex items-center gap-1.5">
            <WarningCircle className="h-3 w-3 shrink-0" />
            {attachmentError}
          </div>
        )}

        {attachments.length > 0 && !isDragOver && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 rounded-md bg-muted/50 border border-border/50 px-2 py-1 text-xs text-muted-foreground group"
              >
                <FileTypeIcon type={file.type} className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[120px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-muted-foreground/50">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  className="ml-0.5 rounded-sm opacity-50 hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex h-[36px] items-center justify-between pl-3 pr-2 mb-2">
          <div className="flex items-center">{toolbarLeft}</div>

          <div className="flex items-center gap-3">
            {onOpenModelSettings && (
              <ModelIndicator
                isRunning={false}
                onOpenSettings={onOpenModelSettings}
                hideWhenNoModel={hideModelWhenNoModel}
              />
            )}

            <SpeechInputButton
              isRecording={speechInput.isRecording}
              isTranscribing={speechInput.isTranscribing}
              recordingDuration={speechInput.recordingDuration}
              error={speechInput.error}
              isConfigured={speechInput.isConfigured}
              disabled={isInputDisabled}
              onStartRecording={() => speechInput.startRecording()}
              onStopRecording={() => speechInput.stopRecording()}
              onCancel={() => speechInput.cancelRecording()}
              onRetry={() => speechInput.retry()}
              onOpenSettings={onOpenSpeechSettings}
              size="md"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="task-input-submit"
                  type="button"
                  aria-label={submitLabel}
                  title={submitLabel}
                  onClick={() => {
                    accomplish.logEvent({
                      level: 'info',
                      message: 'Task input submit clicked',
                      context: { prompt: value },
                    });
                    onSubmit();
                  }}
                  disabled={isSubmitDisabled || speechInput.isRecording}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish ${
                    isLoading
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : isSubmitDisabled || speechInput.isRecording
                        ? 'bg-muted text-muted-foreground/60'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isLoading ? (
                    <span className="block h-[10px] w-[10px] rounded-[1.5px] bg-destructive-foreground" />
                  ) : (
                    <ArrowUp className="h-4 w-4" weight="bold" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {isOverLimit
                    ? t('buttons.messageTooLong')
                    : !value.trim() && attachments.length === 0
                      ? t('buttons.enterMessage')
                      : submitLabel}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
