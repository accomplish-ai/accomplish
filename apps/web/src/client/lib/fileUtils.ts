import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';

export const MAX_FILES = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function getFileType(name: string): FileAttachmentInfo['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (
    ['txt', 'md', 'csv', 'log', 'xml', 'html', 'yml', 'yaml', 'toml', 'ini', 'cfg'].includes(ext)
  ) {
    return 'text';
  }
  if (
    [
      'js',
      'jsx',
      'ts',
      'tsx',
      'py',
      'rb',
      'go',
      'rs',
      'java',
      'c',
      'cpp',
      'h',
      'hpp',
      'cs',
      'swift',
      'kt',
      'sh',
      'bash',
      'zsh',
      'json',
      'css',
      'scss',
      'less',
      'sql',
      'r',
      'lua',
      'php',
      'pl',
      'ex',
      'exs',
      'hs',
      'ml',
      'scala',
      'clj',
    ].includes(ext)
  ) {
    return 'code';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  return 'other';
}

export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FileAttachmentCallbacks {
  onOversize?: (name: string, limit: string) => void;
  onOverLimit?: (count: number, max: number) => void;
}

/**
 * Validates and converts a FileList/File[] into FileAttachmentInfo entries.
 * Calls optional callbacks for skipped files (caller can show toasts/alerts).
 * Returns the accepted attachments to be added.
 */
export function processFileAttachments(
  fileList: FileList | File[],
  currentCount: number,
  callbacks?: FileAttachmentCallbacks,
): FileAttachmentInfo[] {
  const files = Array.from(fileList);
  const remaining = MAX_FILES - currentCount;

  if (remaining <= 0) {
    callbacks?.onOverLimit?.(0, MAX_FILES);
    return [];
  }

  const accepted: FileAttachmentInfo[] = [];
  const skippedOversize: string[] = [];
  let skippedOverLimit = 0;

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      skippedOversize.push(file.name);
      continue;
    }
    if (accepted.length >= remaining) {
      skippedOverLimit++;
      continue;
    }
    accepted.push({
      id: generateFileId(),
      name: file.name,
      path: (file as File & { path?: string }).path || file.name,
      type: getFileType(file.name),
      size: file.size,
    });
  }

  for (const name of skippedOversize) {
    callbacks?.onOversize?.(name, formatFileSize(MAX_FILE_SIZE));
  }
  if (skippedOverLimit > 0) {
    callbacks?.onOverLimit?.(skippedOverLimit, MAX_FILES);
  }

  return accepted;
}
