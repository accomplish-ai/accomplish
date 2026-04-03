import type { Task } from '@accomplish_ai/agent-core/common';

export function getDateGroup(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) {
    return 'Today';
  }
  if (date >= yesterday) {
    return 'Yesterday';
  }
  return 'Earlier';
}

export function groupTasksByDate(tasks: Task[]): { label: string; tasks: Task[] }[] {
  const groups: Record<string, Task[]> = {};
  for (const task of tasks) {
    const label = getDateGroup(task.createdAt);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(task);
  }
  const order = ['Today', 'Yesterday', 'Earlier'];
  return order.filter((label) => groups[label]).map((label) => ({ label, tasks: groups[label] }));
}
