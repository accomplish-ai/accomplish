import { useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { StarButton } from '../ui/StarButton';
import { FAVORITABLE_STATUSES } from '../../lib/task-utils';
import { useTaskStore } from '../../stores/taskStore';
import type { Task, TaskStatus } from '@accomplish_ai/agent-core/common';

interface TaskHistoryProps {
  limit?: number;
  showTitle?: boolean;
}

export default function TaskHistory({ limit, showTitle = true }: TaskHistoryProps) {
  const {
    tasks,
    favorites,
    loadTasks,
    loadFavorites,
    addFavorite,
    removeFavorite,
    deleteTask,
    clearHistory,
  } = useTaskStore();
  const favoritesList = Array.isArray(favorites) ? favorites : [];
  const { t } = useTranslation('history');
  const { t: tCommon } = useTranslation('common');

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [loadFavorites]);

  const displayedTasks = limit ? tasks.slice(0, limit) : tasks;

  if (displayedTasks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted">{t('noTasks')}</p>
      </div>
    );
  }

  return (
    <div>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text">{t('recentTasks')}</h2>
          {tasks.length > 0 && !limit && (
            <button
              onClick={() => {
                if (confirm(t('confirmClear'))) {
                  clearHistory();
                }
              }}
              className="text-sm text-text-muted hover:text-danger transition-colors"
            >
              {tCommon('buttons.clearAll')}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {displayedTasks.map((task) => (
          <TaskHistoryItem
            key={task.id}
            task={task}
            isFavorited={favoritesList.some((f) => f.taskId === task.id)}
            onToggleFavorite={async () => {
              if (typeof addFavorite !== 'function' || typeof removeFavorite !== 'function') {
                return;
              }
              if (favoritesList.some((f) => f.taskId === task.id)) {
                await removeFavorite(task.id);
              } else {
                await addFavorite(task.id);
              }
            }}
            onDelete={() => deleteTask(task.id)}
          />
        ))}
      </div>

      {limit && tasks.length > limit && (
        <Link
          to="/history"
          className="block mt-4 text-center text-sm text-text-muted hover:text-text transition-colors"
        >
          {t('viewAll', { count: tasks.length })}
        </Link>
      )}
    </div>
  );
}

function TaskHistoryItem({
  task,
  isFavorited,
  onToggleFavorite,
  onDelete,
}: {
  task: Task;
  isFavorited: boolean;
  onToggleFavorite: () => Promise<void>;
  onDelete: () => void;
}) {
  const { t: tCommon } = useTranslation('common');
  const { t } = useTranslation('history');

  const statusConfig: Record<TaskStatus, { color: string; labelKey: string }> = {
    queued: { color: 'bg-warning', labelKey: 'status.queued' },
    completed: { color: 'bg-success', labelKey: 'status.completed' },
    running: { color: 'bg-primary', labelKey: 'status.running' },
    failed: { color: 'bg-danger', labelKey: 'status.failed' },
    cancelled: { color: 'bg-text-muted', labelKey: 'status.cancelled' },
    pending: { color: 'bg-warning', labelKey: 'status.pending' },
    waiting_permission: { color: 'bg-warning', labelKey: 'status.waiting' },
    interrupted: { color: 'bg-text-muted', labelKey: 'status.stopped' },
  };

  const config = statusConfig[task.status];
  const timeAgo = getTimeAgo(task.createdAt, tCommon);
  const canFavorite = FAVORITABLE_STATUSES.includes(task.status);

  // Buttons must NOT be nested inside the Link anchor (invalid HTML / a11y issue).
  // Outer div holds layout; inner Link covers only the navigable text area.
  return (
    <div className="relative flex items-center gap-4 p-4 rounded-card border border-border bg-background-card hover:shadow-card-hover transition-all">
      <Link to={`/execution/${task.id}`} className="flex flex-1 items-center gap-4 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text truncate" title={task.summary || task.prompt}>
            {task.summary || task.prompt}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {tCommon(config.labelKey)} · {timeAgo} ·{' '}
            {tCommon('messages', { count: task.messages.length })}
          </p>
        </div>
      </Link>
      {canFavorite && (
        <StarButton isFavorite={isFavorited} onToggle={() => void onToggleFavorite()} size="md" />
      )}
      <button
        type="button"
        data-testid="task-delete-button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(t('confirmDelete'))) {
            onDelete();
          }
        }}
        className="p-2 text-text-muted hover:text-danger transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}

function getTimeAgo(
  dateString: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  return t('time.daysAgo', { count: diffDays });
}
