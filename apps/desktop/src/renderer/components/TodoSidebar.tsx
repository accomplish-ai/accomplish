import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoItem } from '@accomplish/shared';

interface TodoSidebarProps {
  todos: TodoItem[];
}

export function TodoSidebar({ todos }: TodoSidebarProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === 'completed').length;
  const cancelled = todos.filter(t => t.status === 'cancelled').length;
  const total = todos.length;
  const progress = ((completed + cancelled) / total) * 100;

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
          <span className="text-sm font-medium text-foreground">Tasks</span>
          <span className="text-xs text-muted-foreground">
            {completed} of {total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
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
        'flex items-start gap-2 px-2 py-1.5 rounded-md border-l-2 border-l-border',
        todo.status === 'completed' && 'border-l-primary',
        todo.status === 'in_progress' && 'border-l-primary',
        todo.status === 'cancelled' && 'opacity-50'
      )}
    >
      <StatusIcon status={todo.status} />
      <span
        className={cn(
          'text-xs text-foreground leading-snug',
          todo.status === 'cancelled' && 'line-through text-muted-foreground'
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
      return <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />;
    case 'in_progress':
      return <Loader2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5 animate-spin" />;
    case 'cancelled':
      return <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
    case 'pending':
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
  }
}
