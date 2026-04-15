import { useState } from 'react';
import type { GoogleAccount } from '@accomplish_ai/agent-core/common';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface GoogleAccountCardProps {
  account: GoogleAccount;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  connected:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent',
  connecting: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent',
  expired:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-transparent',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent',
};

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  expired: 'Expired',
  error: 'Error',
};

function formatLastRefreshed(dateStr: string | null): string {
  if (!dateStr) {
    return 'Never refreshed';
  }
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return date.toLocaleDateString();
}

export function GoogleAccountCard({ account, onDisconnect, onReconnect }: GoogleAccountCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fallback = (account.label || account.email).charAt(0).toUpperCase();
  const badgeClass = STATUS_BADGE_CLASS[account.status] ?? STATUS_BADGE_CLASS.error;
  const statusLabel = STATUS_LABEL[account.status] ?? account.status;
  const showReconnect = account.status === 'expired' || account.status === 'error';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Avatar className="size-9 shrink-0">
        {account.pictureUrl && <AvatarImage src={account.pictureUrl} alt={account.displayName} />}
        <AvatarFallback className="text-sm font-medium">{fallback}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{account.label}</span>
          <Badge className={badgeClass}>{statusLabel}</Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{account.email}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Last refreshed: {formatLastRefreshed(account.lastRefreshedAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showReconnect && (
          <Button variant="outline" size="sm" onClick={() => onReconnect(account.googleAccountId)}>
            Reconnect
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          Disconnect
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect {account.label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove all credentials for this account. You can reconnect later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDisconnect(account.googleAccountId);
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
