import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Task } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';
import { X, Star, SpinnerGap } from '@phosphor-icons/react';
import { useTaskStore } from '@/stores/taskStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { STATUS_COLORS, FAVORITABLE_STATUSES, extractDomains } from '@/lib/task-utils';
import { getFaviconUrl } from '@/components/landing/IntegrationIcons';

interface ConversationListItemProps {
  task: Task;
}

export function ConversationListItem({ task }: ConversationListItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('sidebar');
  const isActive = location.pathname === `/execution/${task.id}`;
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const domains = useMemo(() => extractDomains(task), [task]);
  const { favorites, addFavorite, removeFavorite } = useTaskStore();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const workspaceColor = useMemo(() => {
    if (!task.workspaceId) {
      return undefined;
    }
    return workspaces.find((w) => w.id === task.workspaceId)?.color;
  }, [task.workspaceId, workspaces]);
  const favoritesList = Array.isArray(favorites) ? favorites : [];
  const isFavorited = favoritesList.some((f) => f.taskId === task.id);
  const canFavorite = FAVORITABLE_STATUSES.includes(task.status);
  // Note: loadFavorites is intentionally not called here — the parent page
  // (Home/Execution) is responsible for loading favorites once on mount.

  const handleClick = () => {
    navigate(`/execution/${task.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm(t('confirmDelete'))) {
      return;
    }

    await deleteTask(task.id);

    if (isActive) {
      navigate('/');
    }
  };

  const statusColor = STATUS_COLORS[task.status] || 'bg-muted-foreground';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={task.summary || task.prompt}
      style={workspaceColor ? { borderLeft: `2px solid ${workspaceColor}` } : undefined}
      className={cn(
        'w-full text-left p-2 rounded-lg text-xs font-medium transition-colors duration-200',
        'text-foreground hover:bg-accent hover:text-foreground',
        'flex items-center gap-3 group relative cursor-pointer',
        isActive && 'bg-accent text-foreground',
      )}
    >
      <span className="flex items-center justify-center shrink-0 w-3 h-3">
        {task.status === 'running' || task.status === 'waiting_permission' ? (
          <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full', statusColor)} />
        )}
      </span>
      <span className="block truncate flex-1 tracking-[0.18px]">{task.summary || task.prompt}</span>
      <span className="relative flex items-center shrink-0 h-5">
        {domains.length > 0 && (
          <span className="flex items-center group-hover:opacity-0 transition-opacity duration-200">
            {domains
              .map((domain) => ({ domain, faviconUrl: getFaviconUrl(domain) }))
              .filter(({ faviconUrl }) => faviconUrl !== null)
              .map(({ domain, faviconUrl }, i) => (
                <span
                  key={domain}
                  className={cn(
                    'flex items-center p-0.5 rounded-full bg-card shrink-0 relative',
                    i > 0 && '-ml-1',
                    i === 0 && 'z-30',
                    i === 1 && 'z-20',
                    i === 2 && 'z-10',
                  )}
                >
                  <img
                    src={faviconUrl!}
                    alt={domain}
                    className="w-3 h-3 rounded-full"
                    loading="lazy"
                  />
                </span>
              ))}
          </span>
        )}
        {canFavorite && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (isFavorited) {
                await removeFavorite(task.id);
              } else {
                await addFavorite(task.id);
              }
            }}
            title={isFavorited ? t('favorite.remove') : t('favorite.add')}
            aria-label={isFavorited ? t('favorite.remove') : t('favorite.add')}
            className={cn(
              'absolute right-6 top-1/2 -translate-y-1/2',
              'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
              'transition-opacity duration-200',
              'p-1 rounded hover:bg-accent shrink-0',
              isFavorited && 'opacity-100 text-amber-500',
            )}
          >
            <Star className={cn('h-3 w-3', isFavorited && 'fill-current')} />
          </button>
        )}
        <button
          onClick={handleDelete}
          title={t('deleteTask')}
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2',
            'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
            'transition-opacity duration-200',
            'p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20',
            'text-zinc-400 hover:text-red-600 dark:hover:text-red-400',
          )}
          aria-label={t('deleteTask')}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </div>
  );
}

export default ConversationListItem;
