import { XCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';
import { getAttachmentIcon } from '../../lib/attachments';

interface DragOverlayProps {
  setIsDragging: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
}

/** Full-area drag-and-drop overlay shown while dragging files. */
export function DragOverlay({ setIsDragging, handleDrop }: DragOverlayProps) {
  const { t } = useTranslation('execution');
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="text-primary font-medium flex items-center gap-2 pointer-events-none">
        {t('followUp.dropFilesToAttach')}
      </div>
    </div>
  );
}

interface AttachmentListProps {
  attachments: FileAttachmentInfo[];
  removeAttachment: (id: string) => void;
}

/** Horizontal scrollable row of attached file chips. */
export function AttachmentList({ attachments, removeAttachment }: AttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="px-4 pt-4 pb-1 flex gap-2 overflow-x-auto items-center">
      {attachments.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 border border-border rounded-md shrink-0 max-w-[200px]"
          title={file.name}
        >
          {getAttachmentIcon(file.type)}
          <span className="text-xs font-medium truncate">{file.name}</span>
          <button
            onClick={() => removeAttachment(file.id)}
            aria-label={`Remove attachment ${file.name}`}
            className="text-muted-foreground hover:text-foreground shrink-0 ml-1 rounded-full p-0.5 hover:bg-muted"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
