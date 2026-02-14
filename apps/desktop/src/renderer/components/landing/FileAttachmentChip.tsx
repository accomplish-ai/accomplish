import { X, FileText, Image, Code, File } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'text' | 'code' | 'document' | 'other';
  size: number;
}

interface FileAttachmentChipProps {
  attachment: FileAttachment;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const FILE_TYPE_ICONS = {
  image: Image,
  text: FileText,
  code: Code,
  document: FileText,
  other: File,
} as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileType(fileName: string): FileAttachment['type'] {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
  const textExtensions = ['txt', 'md', 'json', 'yaml', 'yml', 'toml', 'csv', 'xml', 'log'];
  const codeExtensions = ['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'sh', 'sql'];
  const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  if (imageExtensions.includes(ext)) {
    return 'image';
  }
  if (textExtensions.includes(ext)) {
    return 'text';
  }
  if (codeExtensions.includes(ext)) {
    return 'code';
  }
  if (documentExtensions.includes(ext)) {
    return 'document';
  }
  return 'other';
}

export const MAX_ATTACHMENTS = 5;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function FileAttachmentChip({ attachment, onRemove, disabled }: FileAttachmentChipProps) {
  const Icon = FILE_TYPE_ICONS[attachment.type];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid={`file-chip-${attachment.id}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-sm text-foreground border border-border hover:bg-muted/80 transition-colors duration-150 max-w-[200px]"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{attachment.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatFileSize(attachment.size)}
          </span>
          <button
            type="button"
            data-testid={`file-chip-remove-${attachment.id}`}
            aria-label={`Remove ${attachment.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(attachment.id);
            }}
            disabled={disabled}
            className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span>{attachment.path}</span>
      </TooltipContent>
    </Tooltip>
  );
}
