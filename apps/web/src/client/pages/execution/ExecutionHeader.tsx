import type { TaskStatus } from '@accomplish_ai/agent-core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, CheckCircle, Clock, Square, Hourglass } from '@phosphor-icons/react';

function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation('execution');

  switch (status) {
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 shrink-0">
          <Clock className="h-3 w-3" />
          {t('status.queued')}
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 dark:bg-primary/5 shrink-0">
          <span className="animate-shimmer bg-gradient-to-r from-primary via-primary/50 to-primary dark:from-primary/70 dark:via-primary/30 dark:to-primary/70 bg-[length:200%_100%] bg-clip-text text-transparent">
            {t('status.running')}
          </span>
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 shrink-0">
          <CheckCircle className="h-3 w-3" />
          {t('status.completed')}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive shrink-0">
          <XCircle className="h-3 w-3" />
          {t('status.failed')}
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
          <XCircle className="h-3 w-3" />
          {t('status.cancelled')}
        </span>
      );
    case 'interrupted':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 shrink-0">
          <Square className="h-3 w-3" />
          {t('status.stopped')}
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
          <Hourglass className="h-3 w-3" />
          {t('status.pending')}
        </span>
      );
    case 'waiting_permission':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 shrink-0">
          <Hourglass className="h-3 w-3" />
          {t('status.waiting_permission')}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
          {status}
        </span>
      );
  }
}

export function ExecutionHeader({ prompt, status }: { prompt: string; status: TaskStatus }) {
  const navigate = useNavigate();

  return (
    <div className="flex-shrink-0 border-b border-border bg-card/50 px-6 py-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            aria-label="Back"
            className="shrink-0 no-drag"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h1 className="text-base font-medium text-foreground truncate min-w-0">{prompt}</h1>
            <span data-testid="execution-status-badge">
              <StatusBadge status={status} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
