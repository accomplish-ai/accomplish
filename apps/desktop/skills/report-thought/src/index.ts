#!/usr/bin/env node
/**
 * ReportThought MCP Server
 *
 * Exposes a `report_thought` tool that subagents use to stream their thoughts
 * to the UI in real-time. Communicates with Electron main process via HTTP.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const THOUGHT_STREAM_PORT = process.env.THOUGHT_STREAM_PORT || '9228';
const THOUGHT_STREAM_URL = `http://127.0.0.1:${THOUGHT_STREAM_PORT}/thought`;
const THOUGHT_STREAM_TASK_ID =
  process.env.THOUGHT_STREAM_TASK_ID || process.env.ACCOMPLISH_TASK_ID || '';

interface ReportThoughtInput {
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
}

const server = new Server(
  { name: 'report-thought', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'report_thought',
      description:
        'Stream a thought to the UI for real-time visibility into agent reasoning. Use frequently to narrate what you see and do.',
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
            description:
              'Category: observation (what you see), reasoning (why), decision (what you chose), action (what you are doing)',
          },
        },
        required: ['content', 'category'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  if (request.params.name !== 'report_thought') {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments as unknown as ReportThoughtInput;
  const { content, category } = args;

  // Validate required fields
  if (!content || !category) {
    return {
      content: [{ type: 'text', text: 'Error: content and category are required' }],
      isError: true,
    };
  }

  // Log to stderr for debugging
  console.error(`[report-thought] [${category}] ${content}`);

  // Fire-and-forget POST to thought stream API
  if (THOUGHT_STREAM_TASK_ID) {
    try {
      const response = await fetch(THOUGHT_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: THOUGHT_STREAM_TASK_ID,
          content,
          category,
          agentName: process.env.ACCOMPLISH_AGENT_NAME || 'agent',
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(1000),
      });

      if (!response.ok) {
        console.error(`[report-thought] HTTP error (non-fatal): ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[report-thought] HTTP error (non-fatal): ${errorMessage}`);
    }
  }

  return {
    content: [{ type: 'text', text: 'Thought recorded.' }],
  };
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[report-thought] MCP server running');
}

main().catch((error) => {
  console.error('[report-thought] Fatal error:', error);
  process.exit(1);
});
