'use client';

import type { Task } from '@accomplish/shared';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface TaskLauncherItemProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusIcon(status: Task['status']) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />;
    case 'failed':
      return <XCircle className="h-3 w-3 shrink-0 text-destructive" />;
    case 'cancelled':
    case 'interrupted':
      return <AlertCircle className="h-3 w-3 shrink-0 text-yellow-500" />;
    default:
      return null;
  }
}

export default function TaskLauncherItem({
  task,
  isSelected,
  onClick,
}: TaskLauncherItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-100',
        'flex items-center gap-2',
        isSelected
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-accent'
      )}
    >
      {getStatusIcon(task.status)}
      <span className="flex-1 truncate">{task.prompt}</span>
      <span
        className={cn(
          'shrink-0 text-xs',
          isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )}
      >
        {formatRelativeDate(task.createdAt)}
      </span>
    </button>
  );
}
