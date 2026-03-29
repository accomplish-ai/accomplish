import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core';
import { MAX_FILES, processFileAttachments } from '@/lib/fileUtils';

interface UsePromptAttachmentsParams {
  setPrompt: Dispatch<SetStateAction<string>>;
}

interface UsePromptAttachmentsResult {
  attachments: FileAttachmentInfo[];
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
  const [attachments, setAttachments] = useState<FileAttachmentInfo[]>([]);

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
      const accepted = processFileAttachments(fileList, attachments.length);
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
    },
    [attachments.length],
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
    setAttachments,
    buildPromptWithAttachments,
    handleExampleClick,
    handleSkillSelect,
    handleAttachFiles,
    addFiles,
    MAX_FILES,
  };
}
