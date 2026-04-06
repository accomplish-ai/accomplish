import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Info } from '@phosphor-icons/react';
import { useAccomplish } from '@/lib/accomplish';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ScheduledTask } from '@accomplish_ai/agent-core/common';
import { ScheduleCard } from './ScheduleCard';
import { AddScheduleDialog } from './AddScheduleDialog';

export function SchedulerPanel() {
  const { t } = useTranslation('settings');
  const accomplish = useAccomplish();
  const { activeWorkspaceId } = useWorkspaceStore();

  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);

  const loadSchedules = useCallback(async () => {
    try {
      const result = await accomplish.listSchedules(activeWorkspaceId ?? undefined);
      setSchedules(result);
    } catch {
      // Daemon may be unavailable
      setSchedules([]);
    }
  }, [accomplish, activeWorkspaceId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [, autoStart] = await Promise.all([loadSchedules(), accomplish.isAutoStartEnabled()]);
        setAutoStartEnabled(autoStart);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadSchedules, accomplish]);

  const handleCreate = async (cron: string, prompt: string) => {
    await accomplish.createSchedule(cron, prompt, activeWorkspaceId ?? undefined);
    await loadSchedules();
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await accomplish.setScheduleEnabled(id, enabled);
    // Re-fetch to get updated next_run_at (recomputed server-side on enable)
    await loadSchedules();
  };

  const handleDelete = async (id: string) => {
    await accomplish.deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-sm text-muted-foreground">{t('scheduler.title')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{t('scheduler.description')}</p>
      </div>

      {!autoStartEnabled && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {t('scheduler.autoStartWarning')}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('scheduler.title')}</h4>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('scheduler.addButton')}
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('scheduler.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onToggleEnabled={handleToggleEnabled}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddScheduleDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} />
    </div>
  );
}
