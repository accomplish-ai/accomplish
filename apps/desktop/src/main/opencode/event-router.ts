/**
 * EventRouter - Routes SDK SSE events to the correct task by mapping sessionId->taskId.
 *
 * Subscribes to a single SSE event stream from the OpenCode SDK and demultiplexes
 * events to their corresponding tasks. Handles text batching (50ms intervals),
 * screenshot extraction from tool outputs, and maps SDK event types to the
 * existing TaskMessage/TaskResult/PermissionRequest/TodoItem shapes used by the IPC layer.
 */

import type { OpencodeClient } from '@opencode-ai/sdk';
import type {
  EventMessagePartUpdated,
  EventSessionIdle,
  EventSessionError,
  EventSessionStatus,
  EventPermissionUpdated,
  EventTodoUpdated,
  GlobalEvent,
  Part,
  TextPart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  FilePart,
  ToolStateCompleted,
  ToolStateError,
  Event as SdkEvent,
} from '@opencode-ai/sdk';
import type {
  TaskMessage,
  TaskResult,
  PermissionRequest,
  TodoItem,
  TaskAttachment,
} from '@accomplish/shared';

// ---------------------------------------------------------------------------
// Callback interface
// ---------------------------------------------------------------------------

/**
 * Callbacks that the IPC/handler layer provides so the EventRouter can
 * forward processed events without knowing about Electron specifics.
 */
export interface TaskEventCallbacks {
  onTaskMessage: (taskId: string, message: TaskMessage) => void;
  onTaskProgress: (taskId: string, progress: { stage: string; message?: string; toolName?: string; toolInput?: unknown }) => void;
  onPermissionRequest: (taskId: string, request: PermissionRequest) => void;
  onTaskComplete: (taskId: string, result: TaskResult) => void;
  onTaskError: (taskId: string, error: string) => void;
  onTodoUpdate: (taskId: string, todos: TodoItem[]) => void;
  onDebug: (taskId: string, log: { type: string; message: string; data?: unknown }) => void;
}

// ---------------------------------------------------------------------------
// Text accumulator for batching
// ---------------------------------------------------------------------------

interface TextAccumulator {
  /** Pending text since last flush */
  text: string;
  /** ALL text emitted for the current assistant turn (survives flushes) */
  totalText: string;
  /** Stable message ID for the current assistant turn (reused across flushes) */
  messageId: string;
  timer: ReturnType<typeof setTimeout> | null;
}

const TEXT_BATCH_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// EventRouter class
// ---------------------------------------------------------------------------

export class EventRouter {
  /** Maps OpenCode sessionId -> our taskId */
  private sessionToTask: Map<string, string> = new Map();
  /** Maps our taskId -> OpenCode sessionId */
  private taskToSession: Map<string, string> = new Map();
  /** Accumulates text deltas per task before flushing as a single TaskMessage */
  private textAccumulators: Map<string, TextAccumulator> = new Map();

  private callbacks: TaskEventCallbacks | null = null;
  private abortController: AbortController | null = null;
  private subscriptionActive = false;
  private currentClient: OpencodeClient | null = null;

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Set the callbacks that receive routed events.
   * Must be called before subscribe().
   */
  setCallbacks(callbacks: TaskEventCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Register a mapping between an OpenCode session and our internal task.
   */
  registerSession(sessionId: string, taskId: string): void {
    this.sessionToTask.set(sessionId, taskId);
    this.taskToSession.set(taskId, sessionId);
    console.log(`[EventRouter] Registered session ${sessionId} -> task ${taskId}`);
  }

  /**
   * Remove mappings for a task/session pair.
   */
  unregisterSession(taskId: string): void {
    const sessionId = this.taskToSession.get(taskId);
    if (sessionId) {
      this.sessionToTask.delete(sessionId);
    }
    this.taskToSession.delete(taskId);
    // Flush any pending text for this task
    this.flushText(taskId);
    this.textAccumulators.delete(taskId);
    console.log(`[EventRouter] Unregistered task ${taskId}`);
  }

  /**
   * Look up the OpenCode sessionId associated with a task.
   */
  getSessionId(taskId: string): string | undefined {
    return this.taskToSession.get(taskId);
  }

  /**
   * Flush any buffered text for a given task immediately.
   * Called before permission requests, completion, or errors so that
   * the UI has all text before the next state change.
   */
  flushTaskText(taskId: string): void {
    this.flushText(taskId);
  }

  /**
   * Subscribe to the SDK event stream and begin routing events.
   * This is a long-lived subscription that runs until dispose() is called.
   */
  async subscribe(client: OpencodeClient): Promise<void> {
    if (this.subscriptionActive) {
      console.warn('[EventRouter] Already subscribed, skipping duplicate subscribe()');
      return;
    }

    this.currentClient = client;
    this.subscriptionActive = true;
    this.abortController = new AbortController();

    // Start processing in the background - reconnects on failure
    void this.processEventStream();
  }

  /**
   * Update the SDK client reference (e.g. after server restart).
   * The event stream loop will pick up the new client on next reconnect.
   */
  updateClient(client: OpencodeClient): void {
    this.currentClient = client;
    console.log('[EventRouter] Client reference updated');
  }

  /**
   * Stop the event subscription and clean up all state.
   */
  dispose(): void {
    this.subscriptionActive = false;
    // The abort controller signals the stream loop to stop. The SDK's SSE stream
    // doesn't accept an AbortSignal directly, so we rely on subscriptionActive
    // to break between events. The abort fires for any custom listeners.
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Flush all pending text
    for (const taskId of this.textAccumulators.keys()) {
      this.flushText(taskId);
    }
    this.textAccumulators.clear();
    this.sessionToTask.clear();
    this.taskToSession.clear();
    this.callbacks = null;
    this.currentClient = null;

    console.log('[EventRouter] Disposed');
  }

  // -------------------------------------------------------------------
  // Private: Event stream processing
  // -------------------------------------------------------------------

  /**
   * Main event loop — subscribes to the SSE stream and processes events.
   * Reconnects automatically on error until dispose() is called.
   * Uses this.currentClient which may be updated after server restarts.
   */
  private async processEventStream(): Promise<void> {
    while (this.subscriptionActive) {
      try {
        const client = this.currentClient;
        if (!client) {
          console.warn('[EventRouter] No client available, waiting...');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        console.log('[EventRouter] Subscribing to global SSE event stream...');
        // Use global.event() instead of event.subscribe() because the latter
        // requires a `directory` query param to scope events to a project.
        // The global endpoint delivers events for all projects, each wrapped
        // as { directory, payload: Event }.
        const result = await client.global.event();
        const stream = result.stream;

        for await (const globalEvent of stream) {
          if (!this.subscriptionActive) break;
          // Unwrap GlobalEvent → Event payload
          const event = (globalEvent as GlobalEvent).payload;
          if (event) {
            this.handleEvent(event as SdkEvent);
          }
        }

        // Stream ended normally
        console.log('[EventRouter] SSE stream ended');
      } catch (error: unknown) {
        if (!this.subscriptionActive) {
          // Expected during dispose()
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[EventRouter] SSE stream error: ${message}`);
        // Wait before reconnecting
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  // -------------------------------------------------------------------
  // Private: Event dispatch
  // -------------------------------------------------------------------

  /**
   * Route a single SDK event to the appropriate handler based on its type.
   */
  private handleEvent(event: SdkEvent): void {
    try {
      switch (event.type) {
        case 'message.part.updated':
          this.handlePartUpdated(event as EventMessagePartUpdated);
          break;

        case 'session.idle':
          this.handleSessionIdle(event as EventSessionIdle);
          break;

        case 'session.error':
          this.handleSessionError(event as EventSessionError);
          break;

        case 'session.status':
          this.handleSessionStatus(event as EventSessionStatus);
          break;

        case 'permission.updated':
          this.handlePermission(event as EventPermissionUpdated);
          break;

        case 'todo.updated':
          this.handleTodoUpdated(event as EventTodoUpdated);
          break;

        default:
          // Other events (session.created, file.edited, etc.) are not routed to tasks
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[EventRouter] Error handling event ${event.type}: ${msg}`);
    }
  }

  // -------------------------------------------------------------------
  // Private: message.part.updated
  // -------------------------------------------------------------------

  private handlePartUpdated(event: EventMessagePartUpdated): void {
    const part = event.properties.part;
    const delta = event.properties.delta;
    const sessionId = part.sessionID;
    const taskId = this.sessionToTask.get(sessionId);

    if (!taskId) {
      // Ignore events for sessions we're not tracking
      return;
    }

    switch (part.type) {
      case 'text':
        this.handleTextPart(taskId, part as TextPart, delta);
        break;

      case 'tool':
        this.handleToolPart(taskId, part as ToolPart);
        break;

      case 'step-start':
        this.handleStepStart(taskId, part as StepStartPart);
        break;

      case 'step-finish':
        this.handleStepFinish(taskId, part as StepFinishPart);
        break;

      case 'file':
        this.handleFilePart(taskId, part as FilePart);
        break;

      default:
        // reasoning, snapshot, patch, agent, retry, compaction, subtask — debug only
        this.callbacks?.onDebug(taskId, {
          type: 'part',
          message: `Unhandled part type: ${(part as Part).type}`,
          data: part,
        });
        break;
    }
  }

  // -------------------------------------------------------------------
  // Private: Part handlers
  // -------------------------------------------------------------------

  private handleTextPart(taskId: string, part: TextPart, delta?: string): void {
    // If we have a delta, use it for incremental accumulation (more efficient).
    // Otherwise fall back to the full text in the part.
    const textChunk = delta ?? part.text;
    if (!textChunk) return;

    this.accumulateText(taskId, textChunk);

    // Emit progress so the UI can show "thinking" indicator
    this.callbacks?.onTaskProgress(taskId, { stage: 'thinking', message: 'Thinking...' });
  }

  private handleToolPart(taskId: string, part: ToolPart): void {
    const toolName = part.tool;
    const state = part.state;

    switch (state.status) {
      case 'pending':
      case 'running': {
        // Flush any accumulated text before tool use starts, then reset
        // so the next text chunk after tool completion starts a new bubble.
        this.flushText(taskId);
        this.resetTextTurn(taskId);

        this.callbacks?.onTaskProgress(taskId, {
          stage: 'tool-use',
          toolName,
          toolInput: state.input,
          message: `Using tool: ${toolName}`,
        });
        break;
      }

      case 'completed': {
        const completedState = state as ToolStateCompleted;
        const { cleanedText, attachments } = this.extractAttachments(completedState.output || '');

        // Truncate long outputs for display
        const displayText = cleanedText.length > 500
          ? cleanedText.substring(0, 500) + '...'
          : cleanedText;

        const message: TaskMessage = {
          id: createMessageId(),
          type: 'tool',
          content: displayText || `Tool ${toolName} completed`,
          toolName,
          toolInput: completedState.input,
          timestamp: new Date().toISOString(),
          attachments: attachments.length > 0 ? attachments : undefined,
        };

        this.callbacks?.onTaskMessage(taskId, message);
        break;
      }

      case 'error': {
        const errorState = state as ToolStateError;
        const message: TaskMessage = {
          id: createMessageId(),
          type: 'tool',
          content: errorState.error || `Tool ${toolName} failed`,
          toolName,
          toolInput: errorState.input,
          timestamp: new Date().toISOString(),
        };

        this.callbacks?.onTaskMessage(taskId, message);
        break;
      }
    }
  }

  private handleStepStart(taskId: string, _part: StepStartPart): void {
    this.callbacks?.onTaskProgress(taskId, {
      stage: 'connecting',
      message: 'Connecting to model...',
    });
  }

  private handleStepFinish(taskId: string, _part: StepFinishPart): void {
    // Flush accumulated text when a step finishes, then reset turn
    // so the next step's text starts a new bubble.
    this.flushText(taskId);
    this.resetTextTurn(taskId);
  }

  private handleFilePart(taskId: string, part: FilePart): void {
    // File parts (images, etc.) — emit as a message with attachment
    const attachment: TaskAttachment = {
      type: part.mime.startsWith('image/') ? 'screenshot' : 'json',
      data: part.url,
      label: part.filename,
    };

    const message: TaskMessage = {
      id: createMessageId(),
      type: 'assistant',
      content: part.filename ? `File: ${part.filename}` : 'File attachment',
      timestamp: new Date().toISOString(),
      attachments: [attachment],
    };

    this.callbacks?.onTaskMessage(taskId, message);
  }

  // -------------------------------------------------------------------
  // Private: Screenshot/attachment extraction from tool output
  // -------------------------------------------------------------------

  /**
   * Extract base64 screenshots from tool output text.
   * Returns cleaned text (with images replaced by placeholders) and extracted attachments.
   */
  private extractAttachments(output: string): {
    cleanedText: string;
    attachments: TaskAttachment[];
  } {
    const attachments: TaskAttachment[] = [];

    // Match data URLs (data:image/png;base64,...)
    const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
    let match;
    while ((match = dataUrlRegex.exec(output)) !== null) {
      attachments.push({
        type: 'screenshot',
        data: match[0],
        label: 'Browser screenshot',
      });
    }

    // Also check for raw base64 PNG (starts with iVBORw0)
    const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
    while ((match = rawBase64Regex.exec(output)) !== null) {
      const base64Data = match[1];
      if (base64Data && base64Data.length > 100) {
        attachments.push({
          type: 'screenshot',
          data: `data:image/png;base64,${base64Data}`,
          label: 'Browser screenshot',
        });
      }
    }

    // Clean the text
    let cleanedText = output
      .replace(dataUrlRegex, '[Screenshot captured]')
      .replace(rawBase64Regex, '[Screenshot captured]');

    cleanedText = cleanedText
      .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
      .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

    return { cleanedText, attachments };
  }

  // -------------------------------------------------------------------
  // Private: Text batching
  // -------------------------------------------------------------------

  /**
   * Accumulate text for a task. After TEXT_BATCH_DELAY_MS of inactivity
   * the accumulated text is flushed as a single TaskMessage.
   */
  private accumulateText(taskId: string, text: string): void {
    let acc = this.textAccumulators.get(taskId);
    if (!acc) {
      acc = { text: '', totalText: '', messageId: createMessageId(), timer: null };
      this.textAccumulators.set(taskId, acc);
    }

    // If this is the first text after a turn boundary (totalText was reset),
    // generate a fresh stable ID for the new assistant turn.
    if (!acc.totalText && !acc.text) {
      acc.messageId = createMessageId();
    }

    acc.text += text;

    // Reset the debounce timer
    if (acc.timer) {
      clearTimeout(acc.timer);
    }

    acc.timer = setTimeout(() => {
      this.flushText(taskId);
    }, TEXT_BATCH_DELAY_MS);
  }

  /**
   * Immediately emit any buffered text for a task as a TaskMessage.
   * Uses the stable messageId so the renderer can update an existing bubble
   * rather than creating a new one for each flush within the same turn.
   */
  private flushText(taskId: string): void {
    const acc = this.textAccumulators.get(taskId);
    if (!acc || !acc.text) return;

    if (acc.timer) {
      clearTimeout(acc.timer);
      acc.timer = null;
    }

    // Append pending text to the running total for this turn
    acc.totalText += acc.text;
    acc.text = '';

    const message: TaskMessage = {
      id: acc.messageId,
      type: 'assistant',
      content: acc.totalText,
      timestamp: new Date().toISOString(),
    };

    this.callbacks?.onTaskMessage(taskId, message);
  }

  /**
   * Reset the text accumulator for a task so the next text chunk
   * starts a new assistant turn with a new message bubble.
   */
  private resetTextTurn(taskId: string): void {
    const acc = this.textAccumulators.get(taskId);
    if (acc) {
      acc.totalText = '';
      // messageId will be regenerated on next accumulateText call
    }
  }

  // -------------------------------------------------------------------
  // Private: Session lifecycle events
  // -------------------------------------------------------------------

  private handleSessionIdle(event: EventSessionIdle): void {
    const sessionId = event.properties.sessionID;
    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId) return;

    // Flush text before signaling completion
    this.flushText(taskId);
    this.resetTextTurn(taskId);

    const result: TaskResult = {
      status: 'success',
      sessionId,
    };

    this.callbacks?.onTaskComplete(taskId, result);
  }

  private handleSessionError(event: EventSessionError): void {
    const sessionId = event.properties.sessionID;
    if (!sessionId) return;

    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId) return;

    // Flush text before signaling error
    this.flushText(taskId);
    this.resetTextTurn(taskId);

    const sdkError = event.properties.error;
    let errorMessage = 'Unknown error';

    if (sdkError) {
      switch (sdkError.name) {
        case 'ProviderAuthError':
          errorMessage = `Authentication error: ${sdkError.data.message}`;
          break;
        case 'UnknownError':
          errorMessage = sdkError.data.message;
          break;
        case 'MessageAbortedError':
          // Aborted messages are treated as interruptions, not errors
          this.callbacks?.onTaskComplete(taskId, {
            status: 'interrupted',
            sessionId,
          });
          return;
        case 'APIError':
          errorMessage = `API error: ${sdkError.data.message}`;
          break;
        default:
          // MessageOutputLengthError and others
          errorMessage = 'data' in sdkError && 'message' in (sdkError.data as Record<string, unknown>)
            ? String((sdkError.data as Record<string, unknown>).message)
            : `Error: ${sdkError.name}`;
          break;
      }
    }

    this.callbacks?.onTaskError(taskId, errorMessage);
  }

  private handleSessionStatus(event: EventSessionStatus): void {
    const sessionId = event.properties.sessionID;
    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId) return;

    const status = event.properties.status;

    switch (status.type) {
      case 'busy':
        this.callbacks?.onTaskProgress(taskId, {
          stage: 'thinking',
          message: 'Processing...',
        });
        break;

      case 'retry':
        this.callbacks?.onTaskProgress(taskId, {
          stage: 'waiting',
          message: `Retrying (attempt ${status.attempt}): ${status.message}`,
        });
        break;

      case 'idle':
        // session.status idle is different from session.idle event
        // This status update means the session's processing loop is idle
        break;
    }
  }

  // -------------------------------------------------------------------
  // Private: Permission events
  // -------------------------------------------------------------------

  private handlePermission(event: EventPermissionUpdated): void {
    const permission = event.properties;
    const sessionId = permission.sessionID;
    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId) return;

    // Flush text before showing permission dialog
    this.flushText(taskId);
    this.resetTextTurn(taskId);

    // Build a rich PermissionRequest from SDK Permission metadata.
    // The SDK's metadata object may contain tool-specific fields that map
    // to our PermissionRequest shape. Extract what we can.
    const meta = permission.metadata || {};

    // Determine the permission type based on SDK permission.type and metadata hints
    let permType: 'tool' | 'question' | 'file' = 'tool';
    if (meta.fileOperation || meta.filePath || permission.type === 'file-write' || permission.type === 'file-read') {
      permType = 'file';
    } else if (meta.options || meta.question || meta.header) {
      permType = 'question';
    }

    const request: PermissionRequest = {
      id: permission.id,
      taskId,
      type: permType,
      toolName: typeof meta.toolName === 'string' ? meta.toolName : permission.title,
      toolInput: meta.toolInput ?? meta,
      question: typeof meta.question === 'string' ? meta.question : permission.title,
      header: typeof meta.header === 'string' ? meta.header : undefined,
      options: Array.isArray(meta.options) ? meta.options as PermissionRequest['options'] : undefined,
      multiSelect: typeof meta.multiSelect === 'boolean' ? meta.multiSelect : undefined,
      fileOperation: typeof meta.fileOperation === 'string' ? meta.fileOperation as PermissionRequest['fileOperation'] : undefined,
      filePath: typeof meta.filePath === 'string' ? meta.filePath : undefined,
      filePaths: Array.isArray(meta.filePaths) ? meta.filePaths as string[] : undefined,
      targetPath: typeof meta.targetPath === 'string' ? meta.targetPath : undefined,
      contentPreview: typeof meta.contentPreview === 'string' ? meta.contentPreview : undefined,
      createdAt: new Date(permission.time.created).toISOString(),
    };

    this.callbacks?.onPermissionRequest(taskId, request);
  }

  // -------------------------------------------------------------------
  // Private: Todo events
  // -------------------------------------------------------------------

  private handleTodoUpdated(event: EventTodoUpdated): void {
    const sessionId = event.properties.sessionID;
    const taskId = this.sessionToTask.get(sessionId);
    if (!taskId) return;

    const todos: TodoItem[] = event.properties.todos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status as TodoItem['status'],
      priority: t.priority as TodoItem['priority'],
    }));

    this.callbacks?.onTodoUpdate(taskId, todos);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: EventRouter | null = null;

/**
 * Get the singleton EventRouter instance.
 */
export function getEventRouter(): EventRouter {
  if (!instance) {
    instance = new EventRouter();
  }
  return instance;
}

/**
 * Dispose the singleton EventRouter instance.
 */
export function disposeEventRouter(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
