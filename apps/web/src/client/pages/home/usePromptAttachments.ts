import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core';
import { MAX_FILES, processFileAttachments } from '@/lib/fileUtils';

interface UsePromptAttachmentsParams {
  setPrompt: Dispatch<SetStateAction<string>>;
}

interface UsePromptAttachmentsResult {
  attachments: FileAttachmentInfo[];
  attachmentError: string | null;
  setAttachments: Dispatch<SetStateAction<FileAttachmentInfo[]>>;
  buildPromptWithAttachments: (basePrompt: string, files: FileAttachmentInfo[]) => string;
  handleExampleClick: (examplePrompt: string) => void;
  handleSkillSelect: (command: string) => void;
  handleAttachFiles: () => void;
  addFiles: (fileList: FileList | File[]) => void;
  MAX_FILES: number;
}

export function usePromptAttachments({
  setPrompt,
}: UsePromptAttachmentsParams): UsePromptAttachmentsResult {
  const { t } = useTranslation('home');
  const [attachments, setAttachments] = useState<FileAttachmentInfo[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const focusPromptTextarea = useCallback(() => {
    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('[data-testid="task-input-textarea"]')?.focus();
    }, 0);
  }, []);

  const buildPromptWithAttachments = useCallback(
    (basePrompt: string, files: FileAttachmentInfo[]): string => {
      if (files.length === 0) {
        return basePrompt;
      }
      const fileRefs = files.map((file) => {
        if (file.type === 'image') {
          return `[Attached image: ${file.path}]`;
        }
        return `[Attached file: ${file.path}]`;
      });
      return `${basePrompt}\n\nAttached files:\n${fileRefs.join('\n')}`;
    },
    [],
  );

  const handleExampleClick = useCallback(
    (examplePrompt: string) => {
      setPrompt(examplePrompt);
      focusPromptTextarea();
    },
    [focusPromptTextarea, setPrompt],
  );

  const handleSkillSelect = useCallback(
    (command: string) => {
      setPrompt((prev) => `${command} ${prev}`.trim());
      focusPromptTextarea();
    },
    [focusPromptTextarea, setPrompt],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setAttachmentError(null);
      const accepted = processFileAttachments(fileList, attachments.length, {
        onOversize: (name, limit) =>
          setAttachmentError(t('plusMenu.fileTooLarge', { name, limit })),
        onOverLimit: (_count, max) => setAttachmentError(t('plusMenu.tooManyFiles', { max })),
      });
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
    },
    [attachments.length, t],
  );

  const handleAttachFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) {
        addFiles(input.files);
      }
      input.remove();
    };
    input.click();
  }, [addFiles]);

  return {
    attachments,
    attachmentError,
    setAttachments,
    buildPromptWithAttachments,
    handleExampleClick,
    handleSkillSelect,
    handleAttachFiles,
    addFiles,
    MAX_FILES,
  };
}
