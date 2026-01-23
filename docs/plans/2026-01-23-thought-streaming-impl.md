# Thought Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable real-time visibility into subagent activity by streaming thoughts/checkpoints via HTTP side-channel

**Architecture:** MCP tools POST to Electron-hosted HTTP server (port 9228), which forwards events to renderer via IPC. Fire-and-forget pattern ensures no agent blocking.

**Tech Stack:** Node.js HTTP server, IPC events, Zustand state management, React components

---

## Task 1: Create Thought Stream API Server

**Files:**
- Create: `apps/desktop/src/main/thought-stream-api.ts`

**Step 1: Create the HTTP server module**

```typescript
/**
 * Thought Stream API Server
 *
 * HTTP server that MCP tools (report-thought, report-checkpoint) call to stream
 * subagent thoughts/checkpoints to the UI in real-time. This bridges the MCP tools
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';

export const THOUGHT_STREAM_PORT = 9228;

// Event types
export interface ThoughtEvent {
  taskId: string;
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: number;
}

export interface CheckpointEvent {
  taskId: string;
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}

// Store reference to main window
let mainWindow: BrowserWindow | null = null;

// Track active task IDs for validation
const activeTaskIds = new Set<string>();

/**
 * Initialize the thought stream API with dependencies
 */
export function initThoughtStreamApi(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * Register a task ID as active (called when task starts)
 */
export function registerActiveTask(taskId: string): void {
  activeTaskIds.add(taskId);
}

/**
 * Unregister a task ID (called when task completes)
 */
export function unregisterActiveTask(taskId: string): void {
  activeTaskIds.delete(taskId);
}

/**
 * Create and start the HTTP server for thought streaming
 */
export function startThoughtStreamServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate taskId exists and is active
    const taskId = data.taskId as string;
    if (!taskId || !activeTaskIds.has(taskId)) {
      // Fire-and-forget: return 200 even for unknown tasks
      res.writeHead(200);
      res.end();
      return;
    }

    // Route based on endpoint
    if (req.url === '/thought') {
      handleThought(data as unknown as ThoughtEvent, res);
    } else if (req.url === '/checkpoint') {
      handleCheckpoint(data as unknown as CheckpointEvent, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(THOUGHT_STREAM_PORT, '127.0.0.1', () => {
    console.log(`[Thought Stream API] Server listening on port ${THOUGHT_STREAM_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Thought Stream API] Port ${THOUGHT_STREAM_PORT} already in use, skipping server start`);
    } else {
      console.error('[Thought Stream API] Server error:', error);
    }
  });

  return server;
}

function handleThought(event: ThoughtEvent, res: http.ServerResponse): void {
  // Forward to renderer via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:thought', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}

function handleCheckpoint(event: CheckpointEvent, res: http.ServerResponse): void {
  // Forward to renderer via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task:checkpoint', event);
  }

  // Fire-and-forget: always return 200
  res.writeHead(200);
  res.end();
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors related to thought-stream-api.ts

**Step 3: Commit**

```bash
git add apps/desktop/src/main/thought-stream-api.ts
git commit -m "feat: add thought stream API server for subagent visibility"
```

---

## Task 2: Create MCP Tools for Thought Reporting

**Files:**
- Create: `apps/desktop/skills/report-thought/package.json`
- Create: `apps/desktop/skills/report-thought/src/index.ts`
- Create: `apps/desktop/skills/report-checkpoint/package.json`
- Create: `apps/desktop/skills/report-checkpoint/src/index.ts`

**Step 1: Create report-thought package.json**

```json
{
  "name": "report-thought",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

**Step 2: Create report-thought/src/index.ts**

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

const THOUGHT_STREAM_PORT = process.env.THOUGHT_STREAM_PORT || '9228';
const THOUGHT_STREAM_TASK_ID = process.env.THOUGHT_STREAM_TASK_ID || process.env.ACCOMPLISH_TASK_ID || '';

const server = new Server(
  { name: 'report-thought', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'report_thought',
      description: 'Stream a thought to the UI for real-time visibility into agent reasoning. Use frequently to narrate what you see and do.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The thought content to display',
          },
          category: {
            type: 'string',
            enum: ['observation', 'reasoning', 'decision', 'action'],
            description: 'Category: observation (what you see), reasoning (why), decision (what you chose), action (what you are doing)',
          },
        },
        required: ['content', 'category'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'report_thought') {
    return { content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }] };
  }

  const { content, category } = request.params.arguments as {
    content: string;
    category: 'observation' | 'reasoning' | 'decision' | 'action';
  };

  // Log to stderr for debugging
  console.error(`[report-thought] [${category}] ${content}`);

  // Fire-and-forget POST to thought stream API
  if (THOUGHT_STREAM_TASK_ID) {
    const payload = JSON.stringify({
      taskId: THOUGHT_STREAM_TASK_ID,
      content,
      category,
      agentName: process.env.ACCOMPLISH_AGENT_NAME || 'agent',
      timestamp: Date.now(),
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: parseInt(THOUGHT_STREAM_PORT, 10),
        path: '/thought',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 1000,
      },
      () => {
        // Response received - ignore
      }
    );

    req.on('error', (err) => {
      console.error(`[report-thought] HTTP error (non-fatal): ${err.message}`);
    });

    req.write(payload);
    req.end();
  }

  return { content: [{ type: 'text', text: 'Thought recorded.' }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[report-thought] MCP server running');
}

main().catch((error) => {
  console.error('[report-thought] Fatal error:', error);
  process.exit(1);
});
```

**Step 3: Create report-thought/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: Create report-checkpoint (same pattern)**

Create `apps/desktop/skills/report-checkpoint/package.json`:
```json
{
  "name": "report-checkpoint",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

Create `apps/desktop/skills/report-checkpoint/src/index.ts`:
```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

const THOUGHT_STREAM_PORT = process.env.THOUGHT_STREAM_PORT || '9228';
const THOUGHT_STREAM_TASK_ID = process.env.THOUGHT_STREAM_TASK_ID || process.env.ACCOMPLISH_TASK_ID || '';

const server = new Server(
  { name: 'report-checkpoint', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'report_checkpoint',
      description: 'Report a milestone or status checkpoint. Use to communicate progress, completion, or blockers.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['progress', 'complete', 'stuck'],
            description: 'Status: progress (milestone reached), complete (sub-task done), stuck (blocked)',
          },
          summary: {
            type: 'string',
            description: 'Brief summary of current state',
          },
          nextPlanned: {
            type: 'string',
            description: 'What you plan to do next (if status is progress)',
          },
          blocker: {
            type: 'string',
            description: 'What is blocking progress (if status is stuck)',
          },
        },
        required: ['status', 'summary'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'report_checkpoint') {
    return { content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }] };
  }

  const { status, summary, nextPlanned, blocker } = request.params.arguments as {
    status: 'progress' | 'complete' | 'stuck';
    summary: string;
    nextPlanned?: string;
    blocker?: string;
  };

  // Log to stderr for debugging
  console.error(`[report-checkpoint] [${status}] ${summary}`);

  // Fire-and-forget POST to thought stream API
  if (THOUGHT_STREAM_TASK_ID) {
    const payload = JSON.stringify({
      taskId: THOUGHT_STREAM_TASK_ID,
      status,
      summary,
      nextPlanned,
      blocker,
      agentName: process.env.ACCOMPLISH_AGENT_NAME || 'agent',
      timestamp: Date.now(),
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: parseInt(THOUGHT_STREAM_PORT, 10),
        path: '/checkpoint',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 1000,
      },
      () => {
        // Response received - ignore
      }
    );

    req.on('error', (err) => {
      console.error(`[report-checkpoint] HTTP error (non-fatal): ${err.message}`);
    });

    req.write(payload);
    req.end();
  }

  return { content: [{ type: 'text', text: 'Checkpoint recorded.' }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[report-checkpoint] MCP server running');
}

main().catch((error) => {
  console.error('[report-checkpoint] Fatal error:', error);
  process.exit(1);
});
```

Create `apps/desktop/skills/report-checkpoint/tsconfig.json` (same as report-thought).

**Step 5: Install dependencies and build**

Run: `cd apps/desktop/skills/report-thought && npm install && npm run build`
Run: `cd apps/desktop/skills/report-checkpoint && npm install && npm run build`

**Step 6: Commit**

```bash
git add apps/desktop/skills/report-thought apps/desktop/skills/report-checkpoint
git commit -m "feat: add report-thought and report-checkpoint MCP tools"
```

---

## Task 3: Integrate Thought Stream API with App Lifecycle

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1: Start server in main/index.ts**

Find the section where permission API servers are started (look for `startPermissionApiServer`).

Add after the permission API server starts:

```typescript
import { initThoughtStreamApi, startThoughtStreamServer } from './thought-stream-api';

// In createWindow function, after mainWindow is created:
initThoughtStreamApi(mainWindow);
startThoughtStreamServer();
```

**Step 2: Register/unregister tasks in task-manager.ts**

Add imports at top of task-manager.ts:
```typescript
import { registerActiveTask, unregisterActiveTask } from '../thought-stream-api';
```

In `executeTask` method, after creating the adapter:
```typescript
// Register task for thought streaming
registerActiveTask(taskId);
```

In `cleanupTask` method, before deleting from activeTasks:
```typescript
// Unregister task from thought streaming
unregisterActiveTask(taskId);
```

**Step 3: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/opencode/task-manager.ts
git commit -m "feat: integrate thought stream API with app lifecycle"
```

---

## Task 4: Pass Environment Variables to OpenCode

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Add THOUGHT_STREAM_PORT and THOUGHT_STREAM_TASK_ID to environment**

In `buildEnvironment()` method, add near the end (before the return):

```typescript
// Thought streaming configuration
env.THOUGHT_STREAM_PORT = '9228';
if (this.currentTaskId) {
  env.THOUGHT_STREAM_TASK_ID = this.currentTaskId;
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat: pass thought stream env vars to OpenCode"
```

---

## Task 5: Add Preload API for Thought Events

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add event subscriptions**

Add after `onTaskSummary`:

```typescript
// Thought streaming events from subagents
onThought: (callback: (event: {
  taskId: string;
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: number;
}) => void) => {
  const listener = (_: unknown, event: {
    taskId: string;
    content: string;
    category: 'observation' | 'reasoning' | 'decision' | 'action';
    agentName: string;
    timestamp: number;
  }) => callback(event);
  ipcRenderer.on('task:thought', listener);
  return () => ipcRenderer.removeListener('task:thought', listener);
},

onCheckpoint: (callback: (event: {
  taskId: string;
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}) => void) => {
  const listener = (_: unknown, event: {
    taskId: string;
    status: 'progress' | 'complete' | 'stuck';
    summary: string;
    nextPlanned?: string;
    blocker?: string;
    agentName: string;
    timestamp: number;
  }) => callback(event);
  ipcRenderer.on('task:checkpoint', listener);
  return () => ipcRenderer.removeListener('task:checkpoint', listener);
},
```

**Step 2: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat: add preload API for thought/checkpoint events"
```

---

## Task 6: Add Shared Types for Thought Events

**Files:**
- Modify: `packages/shared/src/types/task.ts`

**Step 1: Add thought and checkpoint types**

Add at the end of the file (before any export):

```typescript
// Thought streaming types
export interface ThoughtMessage {
  id: string;
  taskId: string;
  type: 'thought';
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: string;
}

export interface CheckpointMessage {
  id: string;
  taskId: string;
  type: 'checkpoint';
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: string;
}

export type StreamMessage = ThoughtMessage | CheckpointMessage;
```

**Step 2: Update TaskMessage union if needed**

If TaskMessage is a union type, add `ThoughtMessage | CheckpointMessage` to it:
```typescript
export type TaskMessage = AssistantMessage | UserMessage | ToolMessage | ThoughtMessage | CheckpointMessage;
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/task.ts
git commit -m "feat: add shared types for thought/checkpoint messages"
```

---

## Task 7: Update Task Store for Thought Events

**Files:**
- Modify: `apps/desktop/src/renderer/stores/taskStore.ts`

**Step 1: Add thought message handling**

Add import at top:
```typescript
import type { ThoughtMessage, CheckpointMessage } from '@accomplish/shared';
```

Add helper function:
```typescript
function createThoughtMessageId(): string {
  return `thought_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
```

Add to TaskState interface:
```typescript
addThought: (event: {
  taskId: string;
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: number;
}) => void;
addCheckpoint: (event: {
  taskId: string;
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}) => void;
```

Add implementations in create():
```typescript
addThought: (event) => {
  set((state) => {
    if (!state.currentTask || state.currentTask.id !== event.taskId) {
      return state;
    }

    const thoughtMessage: ThoughtMessage = {
      id: createThoughtMessageId(),
      taskId: event.taskId,
      type: 'thought',
      content: event.content,
      category: event.category,
      agentName: event.agentName,
      timestamp: new Date(event.timestamp).toISOString(),
    };

    return {
      currentTask: {
        ...state.currentTask,
        messages: [...state.currentTask.messages, thoughtMessage],
      },
    };
  });
},

addCheckpoint: (event) => {
  set((state) => {
    if (!state.currentTask || state.currentTask.id !== event.taskId) {
      return state;
    }

    const checkpointMessage: CheckpointMessage = {
      id: createThoughtMessageId(),
      taskId: event.taskId,
      type: 'checkpoint',
      status: event.status,
      summary: event.summary,
      nextPlanned: event.nextPlanned,
      blocker: event.blocker,
      agentName: event.agentName,
      timestamp: new Date(event.timestamp).toISOString(),
    };

    return {
      currentTask: {
        ...state.currentTask,
        messages: [...state.currentTask.messages, checkpointMessage],
      },
    };
  });
},
```

**Step 2: Subscribe to IPC events**

Add at the end of the file (in the `if (typeof window !== 'undefined' ...)` block):

```typescript
// Subscribe to thought streaming events
window.accomplish.onThought?.((event) => {
  useTaskStore.getState().addThought(event);
});

window.accomplish.onCheckpoint?.((event) => {
  useTaskStore.getState().addCheckpoint(event);
});
```

**Step 3: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/stores/taskStore.ts
git commit -m "feat: add thought/checkpoint handling to task store"
```

---

## Task 8: Create Thought Message Component

**Files:**
- Create: `apps/desktop/src/renderer/components/ThoughtMessage.tsx`

**Step 1: Create the component**

```tsx
import React from 'react';
import type { ThoughtMessage as ThoughtMessageType, CheckpointMessage } from '@accomplish/shared';

interface ThoughtMessageProps {
  message: ThoughtMessageType;
}

interface CheckpointMessageProps {
  message: CheckpointMessage;
}

const categoryIcons: Record<ThoughtMessageType['category'], string> = {
  observation: '👁️',
  reasoning: '🧠',
  decision: '💭',
  action: '🔵',
};

const statusIcons: Record<CheckpointMessage['status'], string> = {
  progress: '📍',
  complete: '✅',
  stuck: '🚫',
};

export function ThoughtMessageBubble({ message }: ThoughtMessageProps) {
  const icon = categoryIcons[message.category];

  return (
    <div className="ml-4 my-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm border-l-2 border-blue-400">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">
            {message.agentName}:
          </span>
          <span className={`ml-1 ${message.category === 'reasoning' ? 'italic' : ''}`}>
            {message.content}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CheckpointMessageBubble({ message }: CheckpointMessageProps) {
  const icon = statusIcons[message.status];

  return (
    <div className={`ml-4 my-1 px-3 py-1.5 rounded-lg text-sm border-l-2 ${
      message.status === 'complete'
        ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
        : message.status === 'stuck'
        ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
    }`}>
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">
            {message.agentName}:
          </span>
          <span className="ml-1 font-medium">{message.summary}</span>
          {message.nextPlanned && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Next: {message.nextPlanned}
            </div>
          )}
          {message.blocker && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Blocked: {message.blocker}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/ThoughtMessage.tsx
git commit -m "feat: add ThoughtMessage and CheckpointMessage components"
```

---

## Task 9: Integrate Thought Messages into Message List

**Files:**
- Modify: `apps/desktop/src/renderer/components/MessageList.tsx` (or equivalent)

**Step 1: Import components**

Add import:
```typescript
import { ThoughtMessageBubble, CheckpointMessageBubble } from './ThoughtMessage';
import type { ThoughtMessage, CheckpointMessage } from '@accomplish/shared';
```

**Step 2: Update message rendering**

In the message rendering loop, add cases for thought and checkpoint messages:

```typescript
// Inside the map over messages:
if (message.type === 'thought') {
  return <ThoughtMessageBubble key={message.id} message={message as ThoughtMessage} />;
}
if (message.type === 'checkpoint') {
  return <CheckpointMessageBubble key={message.id} message={message as CheckpointMessage} />;
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/MessageList.tsx
git commit -m "feat: render thought/checkpoint messages in message list"
```

---

## Task 10: Update OpenCode Config to Include MCP Servers

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Add MCP server configurations**

Find where MCP servers are configured and add:

```typescript
// Thought streaming MCP servers
'report-thought': {
  command: nodePath,
  args: [path.join(skillsPath, 'report-thought', 'dist', 'index.js')],
  env: {
    THOUGHT_STREAM_PORT: '9228',
    THOUGHT_STREAM_TASK_ID: '${ACCOMPLISH_TASK_ID}',
    NODE_BIN_PATH: bundledPaths?.binDir || '',
  },
},
'report-checkpoint': {
  command: nodePath,
  args: [path.join(skillsPath, 'report-checkpoint', 'dist', 'index.js')],
  env: {
    THOUGHT_STREAM_PORT: '9228',
    THOUGHT_STREAM_TASK_ID: '${ACCOMPLISH_TASK_ID}',
    NODE_BIN_PATH: bundledPaths?.binDir || '',
  },
},
```

**Step 2: Verify skills are built during postinstall**

Check `apps/desktop/scripts/postinstall.cjs` includes `report-thought` and `report-checkpoint` in the skills array.

**Step 3: Run typecheck**

Run: `pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat: add report-thought/checkpoint MCP servers to config"
```

---

## Task 11: Build and Test

**Step 1: Full build**

Run: `pnpm build`
Expected: Build completes without errors

**Step 2: Run dev mode**

Run: `pnpm -F @accomplish/desktop dev`

**Step 3: Manual test**

1. Start a task that uses the browser agent (e.g., "Open google.com")
2. Verify thoughts appear inline in the chat as the agent works
3. Verify checkpoints appear with appropriate styling
4. Verify task completes successfully

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Success Criteria

1. **Real-time visibility**: Thoughts appear in UI within 100ms of MCP tool call
2. **No blocking**: Agent execution is not slowed by thought streaming
3. **Graceful degradation**: If streaming fails, task still completes
4. **Clear attribution**: Each thought shows which agent (browser/coder/research) emitted it
5. **Visual distinction**: Thoughts/checkpoints are visually distinct from regular messages
