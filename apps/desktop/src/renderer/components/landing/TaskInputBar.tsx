'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle, X } from 'lucide-react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';
import { cn } from '@/lib/utils';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'csv', 'log', 'env', 'sh', 'bash', 'zsh',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'text' | 'document' | 'other';
  content?: string;
  size: number;
}

function getFileType(name: string): FileAttachment['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return 'text';
  }
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
    return 'document';
  }
  return 'other';
}

function getFilePath(file: File): string {
  return (file as File & { path?: string }).path ?? file.name;
}

export function buildPromptWithAttachments(prompt: string, attachments: FileAttachment[]): string {
  if (attachments.length === 0) {
    return prompt;
  }
  const parts: string[] = [prompt.trim()];
  for (const att of attachments) {
    if (att.type === 'text' && att.content) {
      parts.push(`\n\n[Contents of ${att.name}]\n${att.content}`);
    } else {
      parts.push(`\n\n[Attached file: ${att.name} at ${att.path}]`);
    }
  }
  return parts.join('');
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (overrides?: { prompt?: string }) => void;
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
  onOpenSettings?: (tab: 'providers' | 'voice' | 'skills' | 'connectors') => void;
  /**
   * Called when user wants to open settings to change model
   */
  onOpenModelSettings?: () => void;
  /**
   * Hide model indicator when no model is selected (instead of showing warning)
   */
  hideModelWhenNoModel?: boolean;
  /**
   * Automatically submit after a successful transcription.
   */
  autoSubmitOnTranscription?: boolean;
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
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const basePrompt = value.trim();
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const effectivePrompt = attachments.length > 0 ? buildPromptWithAttachments(value, attachments) : value;
  const isOverLimit = effectivePrompt.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = !!basePrompt && !isDisabled && !isOverLimit;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();

  const processFiles = useCallback(async (files: File[]): Promise<{ valid: FileAttachment[]; errors: string[] }> => {
    const valid: FileAttachment[] = [];
    const errors: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const path = getFilePath(file);
      const type = getFileType(file.name);
      let content: string | undefined;
      if (type === 'text') {
        try {
          content = await file.text();
        } catch {
          errors.push(`Could not read ${file.name}`);
          continue;
        }
      }
      valid.push({
        id: `${path}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        path,
        type,
        content,
        size: file.size,
      });
    }
    return { valid, errors };
  }, []);

  // Speech input hook (must be before handleDrop/handleDragOver which use speechInput.isRecording)
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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (isDisabled || speechInput.isRecording) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const currentCount = attachments.length;
      const remaining = MAX_ATTACHMENTS - currentCount;
      const toProcess = files.slice(0, remaining);
      const countLimitError =
        files.length > remaining
          ? `Maximum ${MAX_ATTACHMENTS} files. Only first ${remaining} added.`
          : null;
      const { valid: newAttachments, errors: processErrors } = await processFiles(toProcess);
      const allErrors = [countLimitError, processErrors.length > 0 ? processErrors.join('; ') : null]
        .filter(Boolean)
        .join('; ');
      setAttachmentError(allErrors || null);
      setAttachments((prev) => {
        const combined = [...prev, ...newAttachments];
        return combined.slice(0, MAX_ATTACHMENTS);
      });
    },
    [attachments.length, isDisabled, processFiles, speechInput.isRecording]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDisabled && !speechInput.isRecording && e.dataTransfer.types.includes('Files')) {
        setDragOver(true);
      }
    },
    [isDisabled, speechInput.isRecording]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setAttachmentError(null);
  }, []);

  const doSubmit = useCallback(() => {
    const enriched = attachments.length > 0 ? buildPromptWithAttachments(value, attachments) : undefined;
    onSubmit(enriched ? { prompt: enriched } : undefined);
    setAttachments([]);
    setAttachmentError(null);
  }, [attachments, onSubmit, value]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-submit once the parent value reflects the transcription.
  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      doSubmit();
    }
  }, [autoSubmitOnTranscription, doSubmit, isDisabled, isOverLimit, value]);

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
      if (canSubmit) {
        doSubmit();
      }
    }
  };

  const handleSubmitClick = () => {
    accomplish.logEvent({
      level: 'info',
      message: 'Task input submit clicked',
      context: { prompt: value },
    });
    doSubmit();
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

      {/* Attachment error */}
      {attachmentError && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">{attachmentError}</AlertDescription>
        </Alert>
      )}

      {/* Input container - two rows: textarea top, toolbar bottom */}
      <div
        data-testid="task-input-drop-zone"
        className={cn(
          'rounded-xl border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          dragOver ? 'border-dashed border-2 border-primary' : 'border-border'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* File attachment chips */}
        {attachments.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                data-testid={`attachment-chip-${att.name}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-sm text-foreground"
              >
                <span className="truncate max-w-[120px]" title={att.name}>
                  {att.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${att.name}`}
                  onClick={() => removeAttachment(att.id)}
                  className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea area */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled || speechInput.isRecording}
            rows={1}
            className="w-full max-h-[160px] resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Toolbar - fixed at bottom */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          {/* Plus Menu on left */}
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            disabled={isDisabled || speechInput.isRecording}
          />

          {/* Right side controls */}
          <div className="flex items-center gap-2">
          {/* Model Indicator */}
          {onOpenModelSettings && (
            <ModelIndicator
              isRunning={false}
              onOpenSettings={onOpenModelSettings}
              hideWhenNoModel={hideModelWhenNoModel}
            />
          )}

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                data-testid="task-input-submit"
                type="button"
                aria-label="Submit"
                onClick={handleSubmitClick}
                disabled={!canSubmit || speechInput.isRecording}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 ease-accomplish hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CornerDownLeft className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{isOverLimit ? 'Message is too long' : !value.trim() ? 'Enter a message' : 'Submit'}</span>
            </TooltipContent>
          </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
