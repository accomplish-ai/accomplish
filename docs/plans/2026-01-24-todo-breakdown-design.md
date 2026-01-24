# Task Breakdown with Todo Tracking

## Overview

Surface OpenCode's built-in `todowrite` tool to users, displaying task breakdowns in the UI and enforcing completion of all items before task finishes.

## Requirements

- Display todo breakdown inline in chat as formatted blocks
- Right sidebar with checklist + progress bar when todos exist
- Hard enforcement: block completion until all todos completed/cancelled
- Auto-continue if incomplete items remain when agent tries to complete
- No sidebar for simple tasks (only show when todowrite is called)

## Data Types

**`packages/shared/src/types/todo.ts`:**

```typescript
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

export interface TodoState {
  items: TodoItem[];
  updatedAt: number;
}
```

## Architecture

### IPC Flow

1. Adapter detects `tool_use` message where `tool === 'todowrite'`
2. Parses `state.input.todos` array into `TodoItem[]`
3. Emits: `this.emit('todo:update', todos)`
4. Handler forwards to renderer: `forwardToRenderer('todo:update', { taskId, todos })`
5. Preload exposes: `window.accomplish.onTodoUpdate(callback)`

No persistence needed - todos are session-scoped, recreated on session resume.

### Adapter Changes

**`src/main/opencode/adapter.ts`:**

Add to `OpenCodeAdapterEvents`:
```typescript
'todo:update': [TodoItem[]];
```

Detection in message handler:
```typescript
if (msg.type === 'tool_use' && msg.part.tool === 'todowrite') {
  const input = msg.part.state.input as { todos?: TodoItem[] };
  if (input?.todos && Array.isArray(input.todos)) {
    this.emit('todo:update', input.todos);
  }
}
```

### IPC Handler

**`src/main/ipc/handlers.ts`:**

```typescript
adapter.on('todo:update', (todos) => {
  forwardToRenderer('todo:update', { taskId, todos });
});
```

### Preload

**`src/preload/index.ts`:**

```typescript
onTodoUpdate: (callback: (data: { taskId: string; todos: TodoItem[] }) => void) => {
  ipcRenderer.on('todo:update', (_, data) => callback(data));
},
offTodoUpdate: () => {
  ipcRenderer.removeAllListeners('todo:update');
},
```

### Zustand Store

**`src/renderer/stores/taskStore.ts`:**

State:
```typescript
todos: TodoItem[];
todosUpdatedAt: number | null;
```

Actions:
```typescript
setTodos: (todos: TodoItem[]) => set({ todos, todosUpdatedAt: Date.now() }),
clearTodos: () => set({ todos: [], todosUpdatedAt: null }),
```

Clear todos on task start.

## UI Components

### TodoSidebar

**`src/renderer/components/TodoSidebar.tsx`:**

- Only renders when `todos.length > 0`
- Fixed width (~250px), right side of Execution page
- Progress bar showing completed/total
- Label: "3 of 7 tasks"
- Scrollable checklist with status icons:
  - ○ pending (gray)
  - ◐ in_progress (blue, animated pulse)
  - ✓ completed (green)
  - ✗ cancelled (gray strikethrough)
- Priority indicated by subtle left border color

### TodoInlineCard

Renders in message stream when `toolName === 'todowrite'`:
- Compact checklist card instead of raw JSON
- Shows snapshot of todos at that moment
- Useful for seeing how plan evolved

### Execution Page Layout

```
┌─────────────────────────────────────┬──────────────┐
│                                     │   Todo       │
│         Message Stream              │   Sidebar    │
│                                     │   (250px)    │
│                                     │              │
├─────────────────────────────────────┴──────────────┤
│              Debug Panel (if enabled)              │
└────────────────────────────────────────────────────┘
```

Sidebar conditionally rendered based on `todos.length > 0`.

## Completion Enforcement

**`src/main/opencode/completion/completion-enforcer.ts`:**

Add state:
```typescript
private currentTodos: TodoItem[] = [];

public updateTodos(todos: TodoItem[]): void {
  this.currentTodos = todos;
}
```

Check methods:
```typescript
private hasIncompleteTodos(): boolean {
  return this.currentTodos.some(
    t => t.status === 'pending' || t.status === 'in_progress'
  );
}

private getIncompleteTodosSummary(): string {
  const incomplete = this.currentTodos.filter(
    t => t.status === 'pending' || t.status === 'in_progress'
  );
  return incomplete.map(t => `- ${t.content}`).join('\n');
}
```

When agent calls `complete_task` with `status: "success"`:
1. Check `hasIncompleteTodos()`
2. If true, spawn continuation:
   ```
   You marked the task complete but have incomplete todos:
   {incompleteTodosSummary}

   Either complete these items or update the todo list to mark
   them as cancelled if no longer needed. Then call complete_task again.
   ```
3. Only allow completion when all todos are `completed` or `cancelled`

Wire up in adapter:
```typescript
adapter.on('todo:update', (todos) => {
  this.completionEnforcer.updateTodos(todos);
});
```

## File Changes Summary

| File | Change |
|------|--------|
| `packages/shared/src/types/todo.ts` | New file: TodoItem, TodoState types |
| `packages/shared/src/types/index.ts` | Export todo types |
| `src/main/opencode/adapter.ts` | Detect todowrite, emit todo:update |
| `src/main/ipc/handlers.ts` | Forward todo:update to renderer |
| `src/preload/index.ts` | Expose onTodoUpdate/offTodoUpdate |
| `src/renderer/stores/taskStore.ts` | Add todos state + actions |
| `src/renderer/components/TodoSidebar.tsx` | New component |
| `src/renderer/components/TodoInlineCard.tsx` | New component |
| `src/renderer/pages/Execution.tsx` | Add sidebar, wire up listener |
| `src/main/opencode/completion/completion-enforcer.ts` | Add todo completion check |

## References

- [OpenCode Tools Documentation](https://opencode.ai/docs/tools/)
- [OpenCode TodoWrite Source](https://github.com/sst/opencode/blob/dev/packages/opencode/src/tool/todowrite.txt)
