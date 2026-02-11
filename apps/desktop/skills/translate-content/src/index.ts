#!/usr/bin/env node
/**
 * Translate Content MCP Server
 *
 * Exposes a `translate_to_user_language` tool that the agent calls to translate
 * English content to the user's preferred language. Used when creating
 * user-facing content like documentation, notes, or text files.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const TRANSLATION_API_PORT = process.env.TRANSLATION_API_PORT || '9228';
const TRANSLATION_API_URL = `http://localhost:${TRANSLATION_API_PORT}/translate`;

interface TranslateToUserLanguageInput {
  text: string;
  context?: string;
}

const server = new Server(
  { name: 'translate-content', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'translate_to_user_language',
      description:
        "Translate English text to the user's preferred language. Use this when creating user-facing content like documentation, notes, README files, or any text file that the user will read. The tool automatically detects the user's language from the conversation context. Returns the translated text.",
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The English text to translate',
          },
          context: {
            type: 'string',
            description:
              'Optional context hint for better translation (e.g., "documentation", "meeting notes", "technical guide")',
          },
        },
        required: ['text'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  if (request.params.name !== 'translate_to_user_language') {
    return {
      content: [{ type: 'text', text: `Error: Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const rawArgs = request.params.arguments;
  if (!rawArgs || typeof rawArgs !== 'object') {
    return {
      content: [{ type: 'text', text: 'Error: arguments object is required' }],
      isError: true,
    };
  }

  const args = rawArgs as unknown as TranslateToUserLanguageInput;
  if (!args.text) {
    return {
      content: [{ type: 'text', text: 'Error: text parameter is required' }],
      isError: true,
    };
  }

  const { text, context } = args;

  try {
    const response = await fetch(TRANSLATION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        direction: 'to-user',
        context,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [
          { type: 'text', text: `Error: Translation API returned ${response.status}: ${errorText}` },
        ],
        isError: true,
      };
    }

    const result = (await response.json()) as {
      translatedText: string;
      language: string;
      error?: string;
    };

    if (result.error) {
      return {
        content: [
          {
            type: 'text',
            text: `Warning: ${result.error}\n\nOriginal text:\n${result.translatedText}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: result.translatedText,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: Failed to translate: ${errorMessage}` }],
      isError: true,
    };
  }
});

/** Start the MCP server over stdio. */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Translate Content MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
