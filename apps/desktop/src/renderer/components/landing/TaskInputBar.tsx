'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle } from 'lucide-react';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';
import { FileChipsRow } from '../ui/file-attachments';
import { cn } from '@/lib/utils';
import type { AttachedFile } from '../ui/file-attachments';
import { getFileType, generateFileId } from '../../lib/file-utils';

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
   * Called when user wants to open settings (e.g., from "Manage Skills")
   */
  onOpenSettings?: (tab: 'providers' | 'voice' | 'skills') => void;
  /**
   * Automatically submit after a successful transcription.
   */
  autoSubmitOnTranscription?: boolean;
  /**
   * Currently attached files
   */
  attachedFiles?: AttachedFile[];
  /**
   * Called when attached files change (add/remove)
   */
  onFilesChange?: (files: AttachedFile[]) => void;
}

export default function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenSettings,
  autoSubmitOnTranscription = true,
  attachedFiles = [],
  onFilesChange,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();
  const [isDragging, setIsDragging] = useState(false);

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

  const handleSkillSelect = (command: string) => {
    // Prepend command to input with space
    const newValue = `${command} ${value}`.trim();
    onChange(newValue);
    // Focus textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const MAX_FILES = 10;

  const handleFilesSelected = useCallback(
    (paths: string[]) => {
      if (!onFilesChange) return;

      const newFiles: AttachedFile[] = paths
        .filter((p) => !attachedFiles.some((f) => f.path === p)) // no duplicates
        .slice(0, MAX_FILES - attachedFiles.length) // respect limit
        .map((p) => ({
          id: generateFileId(),
          path: p,
          name: p.split('/').pop() || p.split('\\').pop() || p,
          type: getFileType(p),
        }));

      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles]);
      }
    },
    [attachedFiles, onFilesChange]
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      if (!onFilesChange) return;
      onFilesChange(attachedFiles.filter((f) => f.id !== id));
    },
    [attachedFiles, onFilesChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the container (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      // In Electron, File objects have a .path property with the full path
      const paths = files
        .filter((f) => (f as File & { path?: string }).path)
        .map((f) => (f as File & { path?: string }).path as string);

      if (paths.length > 0) {
        handleFilesSelected(paths);
      }
    },
    [handleFilesSelected]
  );

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
                Retry
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Input container */}
      <div
        className={cn(
          'relative flex flex-col gap-2 rounded-xl border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          isDragging
            ? 'border-dashed border-2 border-primary bg-primary/5'
            : 'border-border'
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* File chips row - show above input when files attached */}
        {attachedFiles.length > 0 && (
          <FileChipsRow files={attachedFiles} onRemove={handleRemoveFile} />
        )}

        {/* Input row */}
        <div className="flex items-center gap-2">
          {/* Plus Menu */}
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            onFilesSelected={handleFilesSelected}
            disabled={isDisabled || speechInput.isRecording}
          />

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
            title="Submit"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CornerDownLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
