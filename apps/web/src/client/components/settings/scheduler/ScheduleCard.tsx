import { useTranslation } from 'react-i18next';
import { Trash } from '@phosphor-icons/react';
import { Switch } from '@/components/ui/switch';
import type { ScheduledTask } from '@accomplish_ai/agent-core/common';

interface ScheduleCardProps {
  schedule: ScheduledTask;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

function formatDateTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ScheduleCard({ schedule, onToggleEnabled, onDelete }: ScheduleCardProps) {
  const { t } = useTranslation('settings');

  const handleDelete = () => {
    if (window.confirm(t('scheduler.card.deleteConfirm'))) {
      onDelete(schedule.id);
    }
  };

  const truncatedPrompt =
    schedule.prompt.length > 100 ? `${schedule.prompt.slice(0, 100)}...` : schedule.prompt;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{schedule.cron}</code>
        </div>
        <p className="text-sm text-muted-foreground break-words">{truncatedPrompt}</p>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            {t('scheduler.card.lastRun')}:{' '}
            {schedule.lastRunAt ? formatDateTime(schedule.lastRunAt) : t('scheduler.card.never')}
          </span>
          <span>
            {t('scheduler.card.nextRun')}:{' '}
            {schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : t('scheduler.card.never')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          size="sm"
          checked={schedule.enabled}
          onCheckedChange={(checked) => onToggleEnabled(schedule.id, checked)}
        />
        <button
          onClick={handleDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={t('scheduler.card.delete')}
        >
          <Trash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
