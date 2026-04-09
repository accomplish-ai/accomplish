'use client';

import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { WarningCircle } from '@phosphor-icons/react';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { TaskInputAttachmentList } from './TaskInputAttachmentList';
import { TaskInputTextarea } from './TaskInputTextarea';
import { TaskInputToolbar } from './TaskInputToolbar';
import { useTaskInputBar } from './useTaskInputBar';

export { FileTypeIcon } from './FileTypeIcon';

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
  attachmentError?: string | null;
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
  attachmentError: externalAttachmentError = null,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');

  const {
    textareaRef,
    effectivePlaceholder,
    isInputDisabled,
    isOverLimit,
    isSubmitDisabled,
    attachmentError,
    slashCommand,
    speechInput,
    behavior,
    isDragOver,
    removeAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    MAX_FILES,
    MAX_FILE_SIZE,
  } = useTaskInputBar({
    value,
    onChange,
    onSubmit,
    placeholder,
    typingPlaceholder,
    isLoading,
    disabled,
    autoFocus,
    autoSubmitOnTranscription,
    attachments,
    onAttachmentsChange,
    externalAttachmentError,
  });

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
          <TaskInputTextarea
            textareaRef={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={behavior.handleKeyDown}
            placeholder={effectivePlaceholder}
            disabled={isInputDisabled}
            isRecording={speechInput.isRecording}
            slashCommand={slashCommand}
          />
        )}

        <TaskInputAttachmentList
          attachments={isDragOver ? [] : attachments}
          attachmentError={attachmentError}
          onRemove={removeAttachment}
        />

        <TaskInputToolbar
          toolbarLeft={toolbarLeft}
          onOpenModelSettings={onOpenModelSettings}
          hideModelWhenNoModel={hideModelWhenNoModel}
          speechInput={speechInput}
          onOpenSpeechSettings={onOpenSpeechSettings}
          isSubmitDisabled={isSubmitDisabled}
          isLoading={isLoading}
          isInputDisabled={isInputDisabled}
          slashCommandOpen={slashCommand.state.isOpen}
          onSubmit={onSubmit}
          isRecording={speechInput.isRecording}
          value={value}
          isOverLimit={isOverLimit}
          attachmentsCount={attachments.length}
        />
      </div>
    </div>
  );
}
