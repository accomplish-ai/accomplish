#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { loadManifest, resolveAccounts } from './accounts.js';
import {
  parseFlags,
  handleApiError,
  cmdList,
  cmdGet,
  cmdCreate,
  cmdUpdate,
  cmdDelete,
  cmdRsvp,
  cmdFreeTime,
} from './calendar.js';

/**
 * Tokenize a command string while preserving quoted sequences.
 * Handles both single and double quotes.
 * Example: 'create --title "Team Sync" --start 2024-01-01' → ['create', '--title', 'Team Sync', '--start', '2024-01-01']
 */
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (inQuote) {
      // Inside a quoted string
      if (char === inQuote) {
        // End of quoted string
        inQuote = null;
      } else {
        current += char;
      }
    } else {
      // Outside quotes
      if (char === '"' || char === "'") {
        // Start of quoted string
        inQuote = char;
      } else if (char === ' ' || char === '\t') {
        // Whitespace: push current token if non-empty
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
  }

  // Push final token if any
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

const server = new Server(
  { name: 'google-calendar', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'google_calendar',
      description:
        'Manage Google Calendar events across connected accounts. Supports listing, creating, updating, deleting events, responding to invitations, and finding free time slots.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'Subcommand and flags. Examples: "list --start 2024-01-01T00:00:00Z --end 2024-01-07T00:00:00Z", "get <eventId>", "create --title Meeting --start 2024-01-02T10:00:00Z --end 2024-01-02T11:00:00Z", "update --eventId <id> --title NewTitle", "delete <eventId>", "rsvp --eventId <id> --status accepted", "free-time --start 2024-01-01T00:00:00Z --end 2024-01-07T00:00:00Z --duration 30"',
          },
          account: {
            type: 'string',
            description: 'Account label or email to use. Omit to query all accounts (read ops).',
          },
        },
        required: ['command'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  if (request.params.name !== 'google_calendar') {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments;
  if (!args || typeof args !== 'object') {
    return { content: [{ type: 'text', text: 'Error: Missing tool arguments' }], isError: true };
  }
  const rawArgs = args as { command?: unknown; account?: unknown };
  if (typeof rawArgs.command !== 'string' || !rawArgs.command.trim()) {
    return {
      content: [{ type: 'text', text: 'Error: command must be a non-empty string' }],
      isError: true,
    };
  }
  if (rawArgs.account !== undefined && typeof rawArgs.account !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: account must be a string' }],
      isError: true,
    };
  }
  const command = rawArgs.command;
  const accountParam = rawArgs.account as string | undefined;

  let accounts: ReturnType<typeof loadManifest>;
  try {
    accounts = loadManifest();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error loading Google accounts: ${errMsg}` }],
      isError: true,
    };
  }

  if (accounts.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No Google accounts connected. Add accounts in Settings → Integrations.',
        },
      ],
      isError: true,
    };
  }

  const parts = tokenizeCommand(command.trim());
  const subcommand = parts[0];
  const rest = parts.slice(1);
  const flags = parseFlags(rest);

  // free-time always uses all accounts — skip normal resolution
  if (subcommand === 'free-time') {
    try {
      const result = await cmdFreeTime(accounts, flags);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${handleApiError(error, 'unknown')}` }],
        isError: true,
      };
    }
  }

  const { resolved, clarificationNeeded, error } = resolveAccounts(
    accounts,
    accountParam,
    subcommand,
  );

  if (error) {
    return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
  }
  if (clarificationNeeded) {
    return { content: [{ type: 'text', text: clarificationNeeded }] };
  }

  try {
    let result: unknown;

    if (subcommand === 'list') {
      if (resolved.length === 1) {
        result = await cmdList(resolved[0], flags);
      } else {
        const allResults = await Promise.allSettled(resolved.map((acc) => cmdList(acc, flags)));
        const rejected = allResults.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        if (rejected.length > 0) {
          const reasons = rejected.map((r) => String(r.reason)).join('; ');
          throw new Error(`Failed to fetch calendar for one or more accounts: ${reasons}`);
        }
        const merged: unknown[] = [];
        for (const r of allResults) {
          if (r.status === 'fulfilled') {
            merged.push(...r.value);
          }
        }
        const sorted = (merged as Array<{ start?: string | null }>).sort((a, b) => {
          return (a.start ?? '').localeCompare(b.start ?? '');
        });
        result = sorted;
      }
    } else if (subcommand === 'get') {
      const eventId = rest[0];
      if (!eventId) {
        return {
          content: [
            { type: 'text', text: 'Error: get requires an event ID. Usage: "get <eventId>"' },
          ],
          isError: true,
        };
      }
      result = await cmdGet(resolved[0], eventId);
    } else if (subcommand === 'create') {
      result = await cmdCreate(resolved[0], flags);
    } else if (subcommand === 'update') {
      result = await cmdUpdate(resolved[0], flags);
    } else if (subcommand === 'delete') {
      const eventId = rest[0];
      if (!eventId) {
        return {
          content: [
            { type: 'text', text: 'Error: delete requires an event ID. Usage: "delete <eventId>"' },
          ],
          isError: true,
        };
      }
      result = await cmdDelete(resolved[0], eventId);
    } else if (subcommand === 'rsvp') {
      result = await cmdRsvp(resolved[0], flags);
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown subcommand: ${subcommand}. Available: list, get, create, update, delete, rsvp, free-time`,
          },
        ],
        isError: true,
      };
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const email = resolved[0]?.email ?? 'unknown';
    return {
      content: [{ type: 'text', text: `Error: ${handleApiError(error, email)}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Google Calendar MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
