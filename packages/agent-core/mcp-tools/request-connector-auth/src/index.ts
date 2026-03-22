#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CONNECTOR_AUTH_REQUIRED_MARKER } from '../../../src/common/constants.js';
import {
  getOAuthProviderDisplayName,
  OAuthProviderId,
} from '../../../src/common/types/connector.js';

const server = new McpServer(
  { name: 'request-connector-auth', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.registerTool(
  'request_connector_auth',
  {
    description:
      'Pause the task and ask the user to authenticate a built-in connector from inside the chat transcript before continuing.',
    inputSchema: {
      providerId: z
        .enum([OAuthProviderId.Slack, OAuthProviderId.Google])
        .describe('Which built-in connector must be authenticated.'),
      message: z
        .string()
        .describe(
          'Short assistant-style explanation shown in chat before the button. Mention the manual fallback path here if needed.',
        ),
      label: z.string().optional().describe('Optional label for the in-chat button.'),
      pendingLabel: z
        .string()
        .optional()
        .describe('Optional label while authentication is in progress.'),
      successText: z
        .string()
        .optional()
        .describe(
          'Optional text sent back to the agent when the user successfully authenticates the connector.',
        ),
    },
  },
  async ({ providerId, message, label, pendingLabel, successText }) => {
    const providerName = getOAuthProviderDisplayName(providerId);

    return {
      content: [
        {
          type: 'text' as const,
          text: [
            CONNECTOR_AUTH_REQUIRED_MARKER,
            `ProviderId: ${providerId}`,
            `Message: ${message}`,
            `Label: ${label?.trim() || `Authenticate ${providerName}`}`,
            `PendingLabel: ${pendingLabel?.trim() || `Authenticating ${providerName}...`}`,
            `SuccessText: ${successText?.trim() || `${providerName} is connected.`}`,
          ].join('\n'),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[request-connector-auth] Fatal error:', error);
  process.exit(1);
});
