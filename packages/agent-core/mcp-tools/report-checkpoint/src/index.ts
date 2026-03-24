#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const THOUGHT_STREAM_PORT = process.env.THOUGHT_STREAM_PORT || '9228';
const CHECKPOINT_URL = `http://127.0.0.1:${THOUGHT_STREAM_PORT}/checkpoint`;
const THOUGHT_STREAM_TASK_ID =
  process.env.THOUGHT_STREAM_TASK_ID || process.env.ACCOMPLISH_TASK_ID || '';

interface ReportCheckpointInput {
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
}

const server = new Server(
  { name: 'report-checkpoint', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'report_checkpoint',
      description:
        'Report a progress checkpoint to the UI. Use this to mark significant milestones, completion of subtasks, or when stuck and needing help.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['progress', 'complete', 'stuck'],
            description:
              'Status: progress (ongoing work), complete (task finished), stuck (blocked/need help)',
          },
          summary: {
            type: 'string',
            description: 'Brief summary of what was accomplished or the current state',
          },
          nextPlanned: {
            type: 'string',
            description: 'What you plan to do next (optional, for progress status)',
          },
          blocker: {
            type: 'string',
            description: 'Description of what is blocking progress (optional, for stuck status)',
          },
        },
        required: ['status', 'summary'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  if (request.params.name !== 'report_checkpoint') {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments as unknown as ReportCheckpointInput;
  const { status, summary, nextPlanned, blocker } = args;

  if (!status || !summary) {
    return {
      content: [{ type: 'text', text: 'Error: status and summary are required' }],
      isError: true,
    };
  }

  console.error(`[report-checkpoint] [${status}] ${summary}`);
  if (nextPlanned) {
    console.error(`[report-checkpoint] Next planned: ${nextPlanned}`);
  }
  if (blocker) {
    console.error(`[report-checkpoint] Blocker: ${blocker}`);
  }

  if (THOUGHT_STREAM_TASK_ID) {
    try {
      const response = await fetch(CHECKPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: THOUGHT_STREAM_TASK_ID,
          status,
          summary,
          nextPlanned,
          blocker,
          agentName: process.env.ACCOMPLISH_AGENT_NAME || 'agent',
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(1000),
      });

      if (!response.ok) {
        console.error(`[report-checkpoint] HTTP error (non-fatal): ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[report-checkpoint] HTTP error (non-fatal): ${errorMessage}`);
    }
  }

  return {
    content: [{ type: 'text', text: 'Checkpoint recorded.' }],
  };
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
