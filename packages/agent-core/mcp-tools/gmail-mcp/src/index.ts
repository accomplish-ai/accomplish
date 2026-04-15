#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { loadManifest, resolveAccounts } from './accounts.js';
import { runCommand } from './commands.js';

const server = new Server({ name: 'gmail-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'google_gmail',
      description:
        'Read and manage Gmail across all connected Google accounts. Supports list/search, read, send, reply, draft, label, archive, and mark-read operations.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              "The operation to perform. Format: '<subcommand> [flags]'. See description for details.",
          },
          account: {
            type: 'string',
            description:
              "Optional. Target a specific account by label (e.g. 'Work') or email address. For reads: omit to query all accounts. For writes: REQUIRED — if omitted, returns a clarification request.",
          },
        },
        required: ['command'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  if (request.params.name !== 'google_gmail') {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const { command, account } = request.params.arguments as {
    command: string;
    account?: string;
  };

  if (!command || !command.trim()) {
    return {
      content: [{ type: 'text', text: 'Error: command is required' }],
      isError: true,
    };
  }

  const spaceIdx = command.indexOf(' ');
  const subcommand = spaceIdx === -1 ? command.trim() : command.slice(0, spaceIdx).trim();
  const args = spaceIdx === -1 ? '' : command.slice(spaceIdx + 1).trim();

  const accounts = loadManifest();
  if (accounts.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No Google accounts configured. Please connect an account in Settings → Integrations.',
        },
      ],
      isError: true,
    };
  }

  const { resolved, clarificationNeeded, error } = resolveAccounts(accounts, account, subcommand);

  if (clarificationNeeded) {
    return { content: [{ type: 'text', text: clarificationNeeded }] };
  }

  if (error) {
    return { content: [{ type: 'text', text: error }], isError: true };
  }

  try {
    const result = await runCommand(resolved, subcommand, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gmail MCP Server started');
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
