import type { Task } from '@accomplish_ai/agent-core/common';

/** Task statuses that support the favorites/bookmarking feature */
export const FAVORITABLE_STATUSES: readonly string[] = ['completed', 'interrupted'] as const;

export const STATUS_COLORS: Record<string, string> = {
  running: 'border-2 border-muted-foreground',
  completed: 'bg-green-500',
  failed: 'bg-destructive',
  cancelled: 'bg-muted-foreground',
  interrupted: 'bg-yellow-500',
  pending: 'bg-warning',
  waiting_permission: 'bg-warning',
  queued: 'bg-muted-foreground',
};

const URL_REGEX = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/g;

/** Require a TLD of at least 2 characters (e.g. ".com", ".io", not ".g") */
function hasValidTld(domain: string): boolean {
  const lastDot = domain.lastIndexOf('.');
  return lastDot !== -1 && domain.length - lastDot - 1 >= 2;
}

export function extractDomains(task: Task): string[] {
  const domains = new Set<string>();

  for (const match of task.prompt.matchAll(URL_REGEX)) {
    if (hasValidTld(match[1])) {
      domains.add(match[1]);
    }
  }

  for (const msg of task.messages) {
    for (const match of msg.content.matchAll(URL_REGEX)) {
      if (hasValidTld(match[1])) {
        domains.add(match[1]);
      }
    }
    if (msg.toolInput) {
      const inputStr =
        typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput);
      for (const match of inputStr.matchAll(URL_REGEX)) {
        if (hasValidTld(match[1])) {
          domains.add(match[1]);
        }
      }
    }
  }

  return Array.from(domains).slice(0, 3);
}
