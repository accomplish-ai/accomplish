#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'complete-task', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'complete_task') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { status, summary, original_request_summary, remaining_work } = request.params
    .arguments as {
    status: 'success' | 'blocked' | 'partial';
    summary: string;
    original_request_summary: string;
    remaining_work?: string;
  };

  console.error(`[complete-task] status=${status}`);
  console.error(`[complete-task] original_request=${original_request_summary}`);
  console.error(`[complete-task] summary=${summary}`);
  if (remaining_work) {
    console.error(`[complete-task] remaining=${remaining_work}`);
  }

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[complete-task] MCP server running');
}

main().catch((error) => {
  console.error('[complete-task] Fatal error:', error);
  process.exit(1);
});
