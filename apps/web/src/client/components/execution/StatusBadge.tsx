/**
 * StatusBadge — Connection status indicator for BrowserPreview.
 *
 * Displays a small visual badge reflecting the current ViewStatus.
 * Extracted from BrowserPreview as part of ENG-982 refactor.
 */

import { Loader2, AlertCircle } from 'lucide-react';

export type ViewStatus = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';

interface StatusBadgeProps {
  status: ViewStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'streaming') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>
    );
  }
  if (status === 'starting') {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Connecting…
      </span>
    );
  }
  if (status === 'stopping') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Disconnecting…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    );
  }
  return null;
}
