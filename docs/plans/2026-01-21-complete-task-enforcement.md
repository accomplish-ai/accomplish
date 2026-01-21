# Complete Task Enforcement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent agents from stopping mid-task by requiring them to call a `complete_task` MCP tool to finish, with automatic continuation prompts if they stop prematurely.

**Architecture:** New MCP server provides `complete_task` tool. Adapter tracks whether tool was called. On `step_finish` without the tool call, adapter injects continuation prompt (max 2 attempts).

**Tech Stack:** TypeScript, MCP SDK, node-pty

---

## Task 1: Create complete-task MCP Server Directory Structure

**Files:**
- Create: `apps/desktop/skills/complete-task/package.json`
- Create: `apps/desktop/skills/complete-task/SKILL.md`

**Step 1: Create package.json**

```json
{
  "name": "complete-task-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "npx tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

Write to: `apps/desktop/skills/complete-task/package.json`

**Step 2: Create SKILL.md**

```markdown
# Complete Task

This tool signals task completion. The agent MUST call this tool to finish any task.

## Usage

Call `complete_task` with:
- `status`: "success", "blocked", or "partial"
- `original_request_summary`: Restate what was asked (forces review)
- `summary`: What you accomplished
- `remaining_work`: (if blocked/partial) What's left to do

## Statuses

- **success** — All parts of the request completed
- **blocked** — Hit an unresolvable blocker, cannot continue
- **partial** — Completed some parts but not all
```

Write to: `apps/desktop/skills/complete-task/SKILL.md`

**Step 3: Install dependencies**

Run: `cd apps/desktop/skills/complete-task && npm install`

**Step 4: Commit**

```bash
git add apps/desktop/skills/complete-task/package.json apps/desktop/skills/complete-task/SKILL.md
git commit -m "feat(complete-task): add MCP server package structure"
```

---

## Task 2: Implement complete-task MCP Server

**Files:**
- Create: `apps/desktop/skills/complete-task/src/index.ts`

**Step 1: Write the MCP server**

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'complete-task', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'complete_task',
      description:
        'Call this tool when you have finished the task or cannot continue. You MUST call this tool to end a task - do not stop without calling it.',
      inputSchema: {
        type: 'object',
        required: ['status', 'summary', 'original_request_summary'],
        properties: {
          status: {
            type: 'string',
            enum: ['success', 'blocked', 'partial'],
            description:
              'success = fully completed, blocked = cannot continue, partial = completed some but not all',
          },
          original_request_summary: {
            type: 'string',
            description: 'Briefly restate what the user originally asked for',
          },
          summary: {
            type: 'string',
            description: 'What you accomplished. Be specific about each part.',
          },
          remaining_work: {
            type: 'string',
            description:
              'If blocked or partial, describe what remains and why you could not complete it',
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'complete_task') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { status, summary, original_request_summary, remaining_work } =
    request.params.arguments as {
      status: 'success' | 'blocked' | 'partial';
      summary: string;
      original_request_summary: string;
      remaining_work?: string;
    };

  // Log for debugging
  console.error(`[complete-task] status=${status}`);
  console.error(`[complete-task] original_request=${original_request_summary}`);
  console.error(`[complete-task] summary=${summary}`);
  if (remaining_work) {
    console.error(`[complete-task] remaining=${remaining_work}`);
  }

  // Build response message
  let responseText = `Task ${status}.`;
  if (status === 'success') {
    responseText = `Task completed successfully.`;
  } else if (status === 'blocked') {
    responseText = `Task blocked. Remaining work: ${remaining_work || 'not specified'}`;
  } else if (status === 'partial') {
    responseText = `Task partially completed. Remaining work: ${remaining_work || 'not specified'}`;
  }

  return {
    content: [{ type: 'text', text: responseText }],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[complete-task] MCP server running');
}

main().catch((error) => {
  console.error('[complete-task] Fatal error:', error);
  process.exit(1);
});
```

Write to: `apps/desktop/skills/complete-task/src/index.ts`

**Step 2: Verify server starts**

Run: `cd apps/desktop/skills/complete-task && npx tsx src/index.ts`
Expected: Server starts without error (will wait for stdin, ctrl+c to exit)

**Step 3: Commit**

```bash
git add apps/desktop/skills/complete-task/src/index.ts
git commit -m "feat(complete-task): implement MCP server"
```

---

## Task 3: Register MCP Server in Config Generator

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Add complete-task to MCP config**

Find the `mcp` object (around line 549) and add after `dev-browser-mcp`:

```typescript
      'complete-task': {
        type: 'local',
        command: ['npx', 'tsx', path.join(skillsPath, 'complete-task', 'src', 'index.ts')],
        enabled: true,
        timeout: 5000,
      },
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat(complete-task): register MCP server in config"
```

---

## Task 4: Update System Prompt with Completion Requirements

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Replace TASK COMPLETION section**

Find the `**TASK COMPLETION - CRITICAL:**` section (around line 171-186) in `ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE` and replace with:

```typescript
**TASK COMPLETION - CRITICAL:**

You MUST call the \`complete_task\` tool to finish ANY task. Never stop without calling it.

When to call \`complete_task\`:

1. **status: "success"** - You verified EVERY part of the user's request is done
   - Before calling, re-read the original request
   - Check off each requirement mentally
   - Summarize what you did for each part

2. **status: "blocked"** - You hit an unresolvable blocker
   - Explain what you were trying to do
   - Describe what went wrong
   - State what remains undone in \`remaining_work\`

3. **status: "partial"** - You completed some parts but not all
   - Summarize what you accomplished
   - Explain why you couldn't finish the rest
   - State what remains in \`remaining_work\`

**NEVER** just stop working. If you find yourself about to end without calling \`complete_task\`,
ask yourself: "Did I actually finish what was asked?" If unsure, keep working.

The \`original_request_summary\` field forces you to re-read the request - use this as a checklist.
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat(complete-task): update system prompt with completion requirements"
```

---

## Task 5: Add Completion Tracking State to Adapter

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Add new state properties**

Find the class properties section (around line 66-74) and add after `private wasInterrupted: boolean = false;`:

```typescript
  private completeTaskCalled: boolean = false;
  private continuationAttempts: number = 0;
  private readonly maxContinuationAttempts: number = 2;
```

**Step 2: Reset state in startTask**

Find `startTask` method, locate the reset block (around line 154-157 where `this.hasCompleted = false;` etc.), and add:

```typescript
    this.completeTaskCalled = false;
    this.continuationAttempts = 0;
```

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(complete-task): add completion tracking state to adapter"
```

---

## Task 6: Track complete_task Tool Calls

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Detect complete_task in tool_call handler**

Find the `case 'tool_call':` section in `handleMessage` (around line 628-643). After extracting `toolName`, add:

```typescript
        // Track if complete_task was called
        if (toolName === 'complete_task') {
          this.completeTaskCalled = true;
          console.log('[OpenCode Adapter] complete_task tool called');
        }
```

**Step 2: Detect complete_task in tool_use handler**

Find the `case 'tool_use':` section (around line 646-694). After extracting `toolUseName`, add:

```typescript
        // Track if complete_task was called
        if (toolUseName === 'complete_task') {
          this.completeTaskCalled = true;
          console.log('[OpenCode Adapter] complete_task tool called (via tool_use)');
        }
```

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(complete-task): track complete_task tool calls"
```

---

## Task 7: Add Continuation Prompt Injection Method

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Add injectContinuationPrompt method**

Add this method to the `OpenCodeAdapter` class (after `handleProcessExit` method, around line 785):

```typescript
  /**
   * Inject a continuation prompt when agent stops without calling complete_task
   */
  private injectContinuationPrompt(): void {
    if (!this.ptyProcess) {
      console.warn('[OpenCode Adapter] Cannot inject continuation - no active process');
      return;
    }

    const continuationMessage = `You stopped without calling the complete_task tool.

Review the original request: Did you complete ALL parts of what was asked?

- If YES: Call complete_task with status "success" and summarize what you did
- If NO and you can continue: Keep working on the remaining parts
- If NO and you're blocked: Call complete_task with status "blocked" and explain why

Do not stop again without calling complete_task.`;

    // Send as user input to the PTY
    this.ptyProcess.write(continuationMessage + '\n');

    this.emit('debug', {
      type: 'continuation',
      message: `Injected continuation prompt (attempt ${this.continuationAttempts})`,
    });

    console.log(`[OpenCode Adapter] Injected continuation prompt (attempt ${this.continuationAttempts})`);
  }
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(complete-task): add continuation prompt injection method"
```

---

## Task 8: Intercept Premature Stops in step_finish Handler

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Modify step_finish handler**

Find the `case 'step_finish':` section (around line 704-722). Replace the entire case with:

```typescript
      // Step finish event
      case 'step_finish':
        // Only complete if reason is 'stop' or 'end_turn' (final completion)
        // 'tool_use' means there are more steps coming
        if (message.part.reason === 'stop' || message.part.reason === 'end_turn') {
          // Check if agent stopped without calling complete_task
          if (!this.completeTaskCalled && this.continuationAttempts < this.maxContinuationAttempts) {
            this.continuationAttempts++;
            console.log(`[OpenCode Adapter] Agent stopped without complete_task, injecting continuation (attempt ${this.continuationAttempts}/${this.maxContinuationAttempts})`);
            this.injectContinuationPrompt();
            return; // Don't emit complete yet
          }

          // Either complete_task was called, or we've exhausted retries
          if (!this.completeTaskCalled) {
            console.warn('[OpenCode Adapter] Agent stopped without complete_task after max attempts');
          }

          this.hasCompleted = true;
          this.emit('complete', {
            status: 'success',
            sessionId: this.currentSessionId || undefined,
          });
        } else if (message.part.reason === 'error') {
          this.hasCompleted = true;
          this.emit('complete', {
            status: 'error',
            sessionId: this.currentSessionId || undefined,
            error: 'Task failed',
          });
        }
        // 'tool_use' reason means agent is continuing, don't emit complete
        break;
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(complete-task): intercept premature stops and inject continuation"
```

---

## Task 9: Update postinstall Script for New MCP Server

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add complete-task to postinstall**

Find the `postinstall` script and add `&& npm --prefix skills/complete-task install` at the end:

```json
"postinstall": "electron-rebuild && npm --prefix skills/dev-browser install && npm --prefix skills/dev-browser-mcp install && npm --prefix skills/file-permission install && npm --prefix skills/ask-user-question install && npm --prefix skills/complete-task install"
```

**Step 2: Test postinstall works**

Run: `cd apps/desktop && npm --prefix skills/complete-task install`
Expected: Dependencies install successfully

**Step 3: Commit**

```bash
git add apps/desktop/package.json
git commit -m "chore: add complete-task to postinstall script"
```

---

## Task 10: Final Verification

**Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Manual test**

Run: `pnpm dev`
- Start a task that requires multiple steps
- Verify the agent calls complete_task before finishing
- (Optional) Test by temporarily breaking the prompt to see continuation injection

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues from final verification"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create MCP server directory structure | `package.json`, `SKILL.md` |
| 2 | Implement MCP server | `src/index.ts` |
| 3 | Register MCP in config | `config-generator.ts` |
| 4 | Update system prompt | `config-generator.ts` |
| 5 | Add tracking state | `adapter.ts` |
| 6 | Track tool calls | `adapter.ts` |
| 7 | Add continuation method | `adapter.ts` |
| 8 | Intercept premature stops | `adapter.ts` |
| 9 | Update postinstall | `package.json` |
| 10 | Final verification | — |
