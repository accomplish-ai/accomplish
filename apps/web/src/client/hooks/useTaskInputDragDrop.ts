import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_FILES, MAX_FILE_SIZE, processFileAttachments } from '@/lib/fileUtils';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core';

interface UseTaskInputDragDropOptions {
  attachments: FileAttachmentInfo[];
  onAttachmentsChange?: (attachments: FileAttachmentInfo[]) => void;
  isInputDisabled: boolean;
}

export interface UseTaskInputDragDropReturn {
  isDragOver: boolean;
  attachmentError: string | null;
  addFiles: (fileList: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  MAX_FILES: number;
  MAX_FILE_SIZE: number;
}

export function useTaskInputDragDrop({
  attachments,
  onAttachmentsChange,
  isInputDisabled,
}: UseTaskInputDragDropOptions): UseTaskInputDragDropReturn {
  const { t } = useTranslation('home');
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

  return {
    isDragOver,
    attachmentError,
    addFiles,
    removeAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    MAX_FILES,
    MAX_FILE_SIZE,
  };
}
