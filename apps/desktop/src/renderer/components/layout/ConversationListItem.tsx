'use client';

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Task } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, Clock, Square, PauseCircle, X, Star } from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';

const COMPLETED_OR_INTERRUPTED: Array<string> = ['completed', 'interrupted'];

interface ConversationListItemProps {
  task: Task;
}

export default function ConversationListItem({ task }: ConversationListItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === `/execution/${task.id}`;
  const { deleteTask, favorites, loadFavorites, addFavorite, removeFavorite } = useTaskStore();
  const favoritesList = Array.isArray(favorites) ? favorites : [];
  const isFavorited = favoritesList.some((f) => f.taskId === task.id);
  const canFavorite = COMPLETED_OR_INTERRUPTED.includes(task.status);

  useEffect(() => {
    if (typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [loadFavorites]);

  const handleClick = () => {
    navigate(`/execution/${task.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    await deleteTask(task.id);

    // Navigate to home if deleting the currently active task
    if (isActive) {
      navigate('/');
    }
  };

  const getStatusIcon = () => {
    switch (task.status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin-ccw text-primary shrink-0" />;
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
      case 'cancelled':
        return <Square className="h-3 w-3 text-zinc-400 shrink-0" />;
      case 'interrupted':
        return <PauseCircle className="h-3 w-3 text-amber-500 shrink-0" />;
      case 'queued':
        return <Clock className="h-3 w-3 text-amber-500 shrink-0" />;
      default:
        return null;
    }
  };

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
      className={cn(
        'w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-200',
        'text-foreground hover:bg-accent hover:text-accent-foreground',
        'flex items-center gap-2 group relative cursor-pointer',
        isActive && 'bg-accent text-accent-foreground'
      )}
    >
      {getStatusIcon()}
      <span className="block truncate flex-1">{task.summary || task.prompt}</span>
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
          className={cn(
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            'p-1 rounded hover:bg-accent',
            'shrink-0',
            isFavorited && 'opacity-100 text-amber-500'
          )}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={cn('h-3 w-3', isFavorited && 'fill-current')} />
        </button>
      )}
      <button
        onClick={handleDelete}
        className={cn(
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
          'p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20',
          'text-zinc-400 hover:text-red-600 dark:hover:text-red-400',
          'shrink-0'
        )}
        aria-label="Delete task"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
