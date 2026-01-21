#!/usr/bin/env node
/**
 * complete-task MCP Server
 *
 * PURPOSE: Provides a `complete_task` tool that agents MUST call to signal task completion.
 *
 * WHY THIS EXISTS:
 * - Agents often stop mid-task or claim success without verifying work is done
 * - Requiring an explicit tool call creates a checkpoint the system can monitor
 * - The `original_request_summary` field forces the agent to re-read the request
 *   before claiming completion—acts as a self-check mechanism
 *
 * HOW IT WORKS WITH THE ADAPTER:
 * 1. Agent calls complete_task with status/summary
 * 2. Adapter detects the tool call via stream parsing (see adapter.ts)
 * 3. CompletionEnforcer tracks the call and may trigger verification
 * 4. If status="success", verification prompts agent to screenshot and confirm
 *
 * STATUSES:
 * - success: All parts of request completed (triggers verification)
 * - blocked: Hit unresolvable blocker, cannot continue
 * - partial: Completed some parts but not all
 */
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
