import { X, WarningCircle } from '@phosphor-icons/react';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';
import { formatFileSize } from '@/lib/fileUtils';
import { FileTypeIcon } from './FileTypeIcon';

interface TaskInputAttachmentListProps {
  attachments: FileAttachmentInfo[];
  attachmentError: string | null;
  onRemove: (id: string) => void;
}

export function TaskInputAttachmentList({
  attachments,
  attachmentError,
  onRemove,
}: TaskInputAttachmentListProps) {
  const hasContent = attachmentError || attachments.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <>
      {attachmentError && (
        <div
          role="alert"
          aria-live="polite"
          className="px-4 py-1.5 text-xs text-destructive flex items-center gap-1.5"
        >
          <WarningCircle className="h-3 w-3 shrink-0" />
          {attachmentError}
        </div>
      )}

      {attachments.length > 0 && (
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
                onClick={() => onRemove(file.id)}
                className="ml-0.5 rounded-sm opacity-50 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
