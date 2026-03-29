import { FileText, Image, Code, File, FilePdf } from '@phosphor-icons/react';
import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';

interface FileTypeIconProps {
  type: FileAttachmentInfo['type'];
  className?: string;
}

export function FileTypeIcon({ type, className }: FileTypeIconProps) {
  switch (type) {
    case 'image':
      return <Image className={className} />;
    case 'text':
      return <FileText className={className} />;
    case 'code':
      return <Code className={className} />;
    case 'pdf':
      return <FilePdf className={className} />;
    default:
      return <File className={className} />;
  }
}
