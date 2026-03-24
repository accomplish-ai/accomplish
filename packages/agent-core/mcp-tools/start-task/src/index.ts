#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'start-task', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'start_task',
      description:
        'Call this tool FIRST before executing any task. Captures your plan. Other tools will fail until this is called.',
      inputSchema: {
        type: 'object',
        required: ['original_request', 'needs_planning', 'skills'],
        properties: {
          original_request: {
            type: 'string',
            description: "Echo the user's original request exactly as stated",
          },
          needs_planning: {
            type: 'boolean',
            description:
              'true for multi-step tasks that need a plan, false for simple messages (greetings, questions, quick lookups)',
          },
          goal: {
            type: 'string',
            description:
              'What you aim to accomplish for the user (required when needs_planning is true)',
          },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Planned actions to achieve the goal, in order (required when needs_planning is true)',
          },
          verification: {
            type: 'array',
            items: { type: 'string' },
            description:
              'How you will verify the task is complete (required when needs_planning is true)',
          },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Skill names or commands from the available-skills list that are relevant to this task. Use empty array [] if no skills apply.',
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'start_task') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { original_request, needs_planning, goal, steps, verification, skills } = request.params
    .arguments as {
    original_request: string;
    needs_planning: boolean;
    goal?: string;
    steps?: string[];
    verification?: string[];
    skills: string[];
  };

  if (needs_planning && (!goal || !steps?.length || !verification?.length)) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: goal, steps, and verification are required when needs_planning is true.',
        },
      ],
      isError: true,
    };
  }

  console.error(`[start-task] original_request=${original_request}`);
  console.error(`[start-task] needs_planning=${needs_planning}`);
  if (goal) console.error(`[start-task] goal=${goal}`);
  if (steps) console.error(`[start-task] steps=${JSON.stringify(steps)}`);
  if (verification) console.error(`[start-task] verification=${JSON.stringify(verification)}`);
  console.error(`[start-task] skills=${JSON.stringify(skills)}`);

  return {
    content: [{ type: 'text', text: 'Plan registered. Proceed with execution.' }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[start-task] MCP server running');
}

main().catch((error) => {
  console.error('[start-task] Fatal error:', error);
  process.exit(1);
});
