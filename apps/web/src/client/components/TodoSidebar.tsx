import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, SpinnerGap, XCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@accomplish_ai/agent-core/common';

interface TodoSidebarProps {
  todos: TodoItem[];
}

export function TodoSidebar({ todos }: TodoSidebarProps) {
  const { t } = useTranslation('execution');

  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === 'completed').length;
  const cancelled = todos.filter((t) => t.status === 'cancelled').length;
  const total = todos.length;
  const done = completed + cancelled;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-[250px] border-l border-border bg-card/50 flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground tracking-[0.18px]">
            {t('todos.title')}
          </span>
          <span className="text-xs text-muted-foreground tracking-[0.18px]">
            {t('todos.progress', { completed: done, total })}
          </span>
        </div>
        {/* Segmented progress bar */}
        <div className="flex gap-0.5">
          {todos.map((todo, i) => (
            <div
              key={todo.id}
              className={cn(
                'h-[3px] flex-1',
                i === 0 && 'rounded-l-full',
                i === total - 1 && 'rounded-r-full',
                todo.status === 'completed' || todo.status === 'cancelled'
                  ? 'bg-foreground'
                  : 'bg-todo-progress-pending',
              )}
            />
          ))}
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-1">
          {todos.map((todo) => (
            <TodoListItem key={todo.id} todo={todo} />
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function TodoListItem({ todo }: { todo: TodoItem }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-lg pl-2 pr-1 py-3',
        todo.status === 'completed' && 'bg-todo-item-completed',
        todo.status === 'in_progress' && 'bg-todo-item-in-progress',
        todo.status === 'cancelled' && 'opacity-50',
      )}
    >
      <StatusIcon status={todo.status} />
      <span
        className={cn(
          'text-xs text-foreground leading-snug tracking-[0.18px]',
          todo.status === 'cancelled' && 'line-through text-muted-foreground',
        )}
      >
        {todo.content}
      </span>
    </li>
  );
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-foreground shrink-0 mt-px" />;
    case 'in_progress':
      return <SpinnerGap className="h-4 w-4 text-muted-foreground shrink-0 mt-px animate-spin" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-px" />;
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-px" />;
  }
}
