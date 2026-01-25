'use client';

import type { Task } from '@accomplish/shared';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface TaskLauncherItemProps {
  task: Task;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

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
      return <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />;
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
    case 'cancelled':
    case 'interrupted':
      return <AlertCircle className="h-3 w-3 text-yellow-500 shrink-0" />;
    default:
      return null;
  }
}

export default function TaskLauncherItem({
  task,
}: TaskLauncherItemProps) {
  return (
    <div className="flex w-full items-center gap-2 text-sm">
      {getStatusIcon(task.status)}
      <span className="truncate flex-1">{task.prompt}</span>
      <span className='text-xs shrink-0 text-muted-foreground group-data-highlighted:text-primary-foreground/70'>
        {formatRelativeDate(task.createdAt)}
      </span>
    </div>
  );
}
