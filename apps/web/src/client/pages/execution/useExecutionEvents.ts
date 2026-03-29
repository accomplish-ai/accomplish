import { useEffect } from 'react';
import type { TaskUpdateEvent } from '@accomplish_ai/agent-core/common';
import type { DebugLogEntry } from '../../components/execution/DebugPanel';
import { getAccomplish } from '../../lib/accomplish';

type Accomplish = ReturnType<typeof getAccomplish>;

interface UseExecutionEventsOptions {
  id: string | undefined;
  accomplish: Accomplish;
  addTaskUpdate: (event: TaskUpdateEvent) => void;
  addTaskUpdateBatch: (event: {
    taskId: string;
    messages: import('@accomplish_ai/agent-core/common').TaskMessage[];
  }) => void;
  updateTaskStatus: (
    taskId: string,
    status: import('@accomplish_ai/agent-core/common').TaskStatus,
  ) => void;
  setPermissionRequest: (req: import('@accomplish_ai/agent-core/common').PermissionRequest) => void;
  setCurrentTool: (tool: string | null) => void;
  setCurrentToolInput: (input: unknown) => void;
  clearStartupStage: (taskId: string) => void;
  setDebugLogs: React.Dispatch<React.SetStateAction<DebugLogEntry[]>>;
  loadTaskById: (id: string) => Promise<void>;
}

/** Registers all IPC event subscriptions for the execution page. */
export function useExecutionEvents(opts: UseExecutionEventsOptions) {
  const {
    id,
    accomplish,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    setCurrentTool,
    setCurrentToolInput,
    clearStartupStage,
    setDebugLogs,
    loadTaskById,
  } = opts;

  useEffect(() => {
    if (id) {
      loadTaskById(id);
      setDebugLogs([]);
      setCurrentTool(null);
      setCurrentToolInput(null);
      accomplish.getTodosForTask(id).then((todos) => {
        import('../../stores/taskStore').then(({ useTaskStore }) => {
          useTaskStore.getState().setTodos(id, todos);
        });
      });
    }

    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
      if (event.taskId === id && event.type === 'message' && event.message?.type === 'tool') {
        const toolName =
          event.message.toolName || event.message.content?.match(/Using tool: (\w+)/)?.[1];
        if (toolName) {
          setCurrentTool(toolName);
          setCurrentToolInput(event.message.toolInput);
        }
      }
      if (event.taskId === id && event.type === 'message' && event.message?.type === 'assistant') {
        setCurrentTool(null);
        setCurrentToolInput(null);
        if (id) {
          clearStartupStage(id);
        }
      }
      if (event.taskId === id && (event.type === 'complete' || event.type === 'error')) {
        setCurrentTool(null);
        setCurrentToolInput(null);
      }
    });

    const unsubscribeTaskBatch = accomplish.onTaskUpdateBatch?.((event) => {
      if (event.messages?.length) {
        addTaskUpdateBatch(event);
        if (event.taskId === id) {
          const lastMsg = event.messages[event.messages.length - 1];
          if (lastMsg.type === 'assistant') {
            setCurrentTool(null);
            setCurrentToolInput(null);
            if (id) {
              clearStartupStage(id);
            }
          } else if (lastMsg.type === 'tool') {
            const toolName = lastMsg.toolName || lastMsg.content?.match(/Using tool: (\w+)/)?.[1];
            if (toolName) {
              setCurrentTool(toolName);
              setCurrentToolInput(lastMsg.toolInput);
            }
          }
        }
      }
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      if (data.taskId === id) {
        updateTaskStatus(data.taskId, data.status);
      }
    });

    const unsubscribeDebugLog = accomplish.onDebugLog((log) => {
      const entry = log as DebugLogEntry;
      if (entry.taskId === id) {
        setDebugLogs((prev) => [...prev, entry]);
      }
    });

    return () => {
      unsubscribeTask();
      unsubscribeTaskBatch?.();
      unsubscribePermission();
      unsubscribeStatusChange?.();
      unsubscribeDebugLog();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadTaskById, addTaskUpdate, addTaskUpdateBatch, updateTaskStatus, setPermissionRequest]);
}
