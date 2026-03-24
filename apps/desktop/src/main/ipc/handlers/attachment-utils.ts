import type { FileAttachmentInfo } from '@accomplish_ai/agent-core';

const VALID_ATTACHMENT_TYPES = new Set(['image', 'pdf', 'code', 'text', 'other']);
const MAX_ATTACHMENT_SIZE = 10_485_760; // 10 MB

/**
 * Sanitize renderer-controlled attachment objects before passing them to the task manager.
 * Invalid entries are filtered out rather than throwing, to be lenient at the IPC boundary.
 */
export function sanitizeAttachments(attachments: unknown[] | undefined): FileAttachmentInfo[] {
  if (!Array.isArray(attachments)) {
    return [];
  }
  const result: FileAttachmentInfo[] = [];
  for (const item of attachments) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const a = item as Record<string, unknown>;

    const path = typeof a['path'] === 'string' ? a['path'].slice(0, 4096) : undefined;
    const name = typeof a['name'] === 'string' ? a['name'].slice(0, 512) : undefined;
    const type =
      typeof a['type'] === 'string' && VALID_ATTACHMENT_TYPES.has(a['type'])
        ? (a['type'] as FileAttachmentInfo['type'])
        : undefined;
    const rawSize = typeof a['size'] === 'number' ? a['size'] : undefined;
    const size =
      rawSize !== undefined && rawSize >= 0 ? Math.min(rawSize, MAX_ATTACHMENT_SIZE) : undefined;

    if (!path || !name || !type || size === undefined) {
      continue;
    }

    result.push({ path, name, type, size } as FileAttachmentInfo);
  }
  return result;
}
