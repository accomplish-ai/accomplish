'use client';

import { useNavigate, useLocation } from 'react-router-dom';
import type { Task } from '@accomplish/shared';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Square,
  PauseCircle,
  X,
} from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';

interface ConversationListItemProps {
  task: Task;
}

export default function ConversationListItem({
  task,
}: ConversationListItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === `/execution/${task.id}`;
  const deleteTask = useTaskStore((state) => state.deleteTask);

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
        return (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin-ccw text-primary" />
        );
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'cancelled':
        return <Square className="h-3 w-3 shrink-0 text-zinc-400" />;
      case 'interrupted':
        return <PauseCircle className="h-3 w-3 shrink-0 text-amber-500" />;
      case 'queued':
        return <Clock className="h-3 w-3 shrink-0 text-amber-500" />;
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
        'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-200',
        'text-zinc-700 hover:bg-accent hover:text-accent-foreground',
        'group relative flex cursor-pointer items-center gap-2',
        isActive && 'bg-accent text-accent-foreground'
      )}
    >
      {getStatusIcon()}
      <span className="block flex-1 truncate">
        {task.summary || task.prompt}
      </span>
      <button
        onClick={handleDelete}
        className={cn(
          'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
          'rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20',
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
