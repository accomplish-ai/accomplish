import { useMemo } from 'react';
import type { Task } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';
import { SpinnerGap } from '@phosphor-icons/react';
import { STATUS_COLORS, extractDomains } from '@/lib/task-utils';
import { getFaviconUrl } from '@/components/landing/IntegrationIcons';

interface TaskLauncherItemProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}

export function TaskLauncherItem({ task, isSelected, onClick }: TaskLauncherItemProps) {
  const domains = useMemo(() => extractDomains(task), [task]);
  const statusColor = STATUS_COLORS[task.status] || 'bg-muted-foreground';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg text-xs font-medium transition-colors duration-100',
        'flex items-center gap-3',
        isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
      )}
    >
      <span className="flex items-center justify-center shrink-0 w-3 h-3">
        {task.status === 'running' || task.status === 'waiting_permission' ? (
          <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full', statusColor)} />
        )}
      </span>
      <span className="truncate flex-1 tracking-[0.18px]">{task.prompt}</span>
      {domains.length > 0 && (
        <span className={cn('flex items-center shrink-0', domains.length > 1 && 'pr-1')}>
          {domains.map((domain, i) => (
            <span
              key={domain}
              className={cn(
                'flex items-center p-0.5 rounded-full bg-white shrink-0 relative',
                i > 0 && '-ml-1',
                i === 0 && 'z-30',
                i === 1 && 'z-20',
                i === 2 && 'z-10',
              )}
            >
              <img
                src={getFaviconUrl(domain, 16)}
                alt={domain}
                className="w-3 h-3 rounded-full"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

export default TaskLauncherItem;
