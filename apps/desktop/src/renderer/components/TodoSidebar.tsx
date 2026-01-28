import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@accomplish/shared';

interface TodoSidebarProps {
  todos: TodoItem[];
}

export function TodoSidebar({ todos }: TodoSidebarProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === 'completed').length;
  const cancelled = todos.filter((t) => t.status === 'cancelled').length;
  const total = todos.length;
  const progress = ((completed + cancelled) / total) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex w-[250px] flex-col border-l border-border bg-card/50"
    >
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Tasks</span>
          <span className="text-xs text-muted-foreground">
            {completed} of {total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-1">
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
        'flex items-start gap-2 rounded-md border-l-2 border-l-border px-2 py-1.5',
        todo.status === 'completed' && 'border-l-primary',
        todo.status === 'in_progress' && 'border-l-primary',
        todo.status === 'cancelled' && 'opacity-50'
      )}
    >
      <StatusIcon status={todo.status} />
      <span
        className={cn(
          'text-xs leading-snug text-foreground',
          todo.status === 'cancelled' && 'text-muted-foreground line-through'
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
      return (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      );
    case 'in_progress':
      return (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      );
    case 'cancelled':
      return (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      );
    case 'pending':
    default:
      return (
        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      );
  }
}
