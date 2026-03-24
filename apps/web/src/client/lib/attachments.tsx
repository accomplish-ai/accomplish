import { FileCode, Image, FileText, FilePdf, File } from '@phosphor-icons/react';

export function getAttachmentIcon(type: string) {
  switch (type) {
    case 'code':
      return <FileCode className="h-4 w-4 text-blue-500" />;
    case 'image':
      return <Image className="h-4 w-4 text-purple-500" />;
    case 'text':
      return <FileText className="h-4 w-4 text-green-500" />;
    case 'pdf':
      return <FilePdf className="h-4 w-4 text-red-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}
