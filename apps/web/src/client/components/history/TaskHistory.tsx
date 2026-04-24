import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { StarButton } from '../ui/StarButton';
import { FAVORITABLE_STATUSES } from '../../lib/task-utils';
import { useTaskStore } from '../../stores/taskStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Task, TaskStatus } from '@accomplish_ai/agent-core/common';
import { CheckCircle, Copy, Funnel, Play } from '@phosphor-icons/react';

interface TaskHistoryProps {
  limit?: number;
  showTitle?: boolean;
}

type StatusFilter = 'all' | TaskStatus;
type SortOrder = 'newest' | 'oldest';

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'completed',
  'running',
  'waiting_permission',
  'queued',
  'pending',
  'failed',
  'cancelled',
  'interrupted',
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const showControls = !limit;

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [loadFavorites]);

  const stats = useMemo(() => getTaskStats(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks
      .filter((task) => statusFilter === 'all' || task.status === statusFilter)
      .filter((task) => {
        if (!query) {
          return true;
        }

        const searchableText = [
          task.prompt,
          task.summary,
          ...task.messages.map((message) => message.content),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort((first, second) => {
        const firstTime = new Date(first.createdAt).getTime();
        const secondTime = new Date(second.createdAt).getTime();
        return sortOrder === 'newest' ? secondTime - firstTime : firstTime - secondTime;
      });
  }, [tasks, searchQuery, statusFilter, sortOrder]);

  const displayedTasks = limit ? filteredTasks.slice(0, limit) : filteredTasks;
  const hasActiveFilters = searchQuery.trim() || statusFilter !== 'all' || sortOrder !== 'newest';

  if (displayedTasks.length === 0) {
    return (
      <div>
        {showControls && tasks.length > 0 && (
          <HistoryControls
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            sortOrder={sortOrder}
            onSearchChange={setSearchQuery}
            onStatusFilterChange={setStatusFilter}
            onSortOrderChange={setSortOrder}
            onReset={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setSortOrder('newest');
            }}
          />
        )}
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
          <p className="text-muted-foreground">
            {tasks.length === 0 ? t('noTasks') : t('noResults')}
          </p>
          {tasks.length > 0 && hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setSortOrder('newest');
              }}
            >
              {t('filters.clear')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {showControls && <HistoryStats stats={stats} />}

      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-foreground">{t('recentTasks')}</h2>
          {tasks.length > 0 && !limit && !showControls && (
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

      {showControls && (
        <HistoryControls
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onSortOrderChange={setSortOrder}
          onReset={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setSortOrder('newest');
          }}
        />
      )}

      {showControls && (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('resultsCount', { shown: displayedTasks.length, total: tasks.length })}</span>
          {tasks.length > 0 && !limit && (
            <button
              onClick={() => {
                if (confirm(t('confirmClear'))) {
                  clearHistory();
                }
              }}
              className="text-muted-foreground transition-colors hover:text-destructive"
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

function HistoryStats({
  stats,
}: {
  stats: { total: number; completed: number; active: number; failed: number };
}) {
  const { t } = useTranslation('history');

  const items = [
    { label: t('stats.total'), value: stats.total },
    { label: t('stats.completed'), value: stats.completed },
    { label: t('stats.active'), value: stats.active },
    { label: t('stats.failed'), value: stats.failed },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {item.value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function HistoryControls({
  searchQuery,
  statusFilter,
  sortOrder,
  onSearchChange,
  onStatusFilterChange,
  onSortOrderChange,
  onReset,
}: {
  searchQuery: string;
  statusFilter: StatusFilter;
  sortOrder: SortOrder;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('history');

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_150px_auto]">
        <Input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.searchLabel')}
        />
        <label className="flex items-center gap-2 rounded-md border border-input px-3">
          <Funnel className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            aria-label={t('filters.statusLabel')}
            className="h-9 flex-1 bg-transparent text-sm text-foreground outline-none"
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? t('filters.allStatuses') : t(`status.${status}`)}
              </option>
            ))}
          </select>
        </label>
        <select
          value={sortOrder}
          onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
          aria-label={t('filters.sortLabel')}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none"
        >
          <option value="newest">{t('filters.newest')}</option>
          <option value="oldest">{t('filters.oldest')}</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          {t('filters.clear')}
        </Button>
      </div>
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
  const { openLauncherWithPrompt } = useTaskStore();
  const [copied, setCopied] = useState(false);

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
  const duration = getDuration(task);
  const canFavorite = FAVORITABLE_STATUSES.includes(task.status);

  const handleCopyPrompt = async () => {
    await navigator.clipboard?.writeText(task.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleRerun = () => {
    openLauncherWithPrompt?.(task.prompt);
  };

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
            {duration ? ` · ${duration}` : ''}
          </p>
        </div>
      </Link>
      {canFavorite && (
        <StarButton isFavorite={isFavorited} onToggle={() => void onToggleFavorite()} size="md" />
      )}
      <IconButton
        label={copied ? t('actions.copied') : t('actions.copyPrompt')}
        onClick={handleCopyPrompt}
      >
        {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </IconButton>
      <IconButton label={t('actions.rerun')} onClick={handleRerun}>
        <Play className="h-4 w-4" />
      </IconButton>
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

function IconButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void onClick();
      }}
      title={label}
      aria-label={label}
      className={`rounded-md p-2 transition-colors ${
        danger
          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'text-text-muted hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function getTaskStats(tasks: Task[]) {
  return tasks.reduce(
    (stats, task) => {
      stats.total += 1;
      if (task.status === 'completed') {
        stats.completed += 1;
      }
      if (['pending', 'queued', 'running', 'waiting_permission'].includes(task.status)) {
        stats.active += 1;
      }
      if (task.status === 'failed') {
        stats.failed += 1;
      }
      return stats;
    },
    { total: 0, completed: 0, active: 0, failed: 0 },
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

  if (diffMins < 1) {
    return t('time.justNow');
  }
  if (diffMins < 60) {
    return t('time.minutesAgo', { count: diffMins });
  }
  if (diffHours < 24) {
    return t('time.hoursAgo', { count: diffHours });
  }
  return t('time.daysAgo', { count: diffDays });
}

function getDuration(task: Task): string | null {
  const durationMs =
    task.result?.durationMs ??
    (task.completedAt
      ? new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()
      : null);

  if (!durationMs || durationMs < 0) {
    return null;
  }

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
