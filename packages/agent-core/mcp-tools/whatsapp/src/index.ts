#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const WHATSAPP_API_PORT = process.env.ACCOMPLISH_WHATSAPP_API_PORT;
if (!WHATSAPP_API_PORT) {
  process.stderr.write(
    'ACCOMPLISH_WHATSAPP_API_PORT is not set — WhatsApp MCP tool cannot start\n',
  );
  process.exit(1);
}
const WHATSAPP_API_BASE = `http://localhost:${WHATSAPP_API_PORT}`;
const AUTH_TOKEN = process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

interface SendWhatsAppMessageInput {
  recipient: string;
  message: string;
}

interface ListWhatsAppChatsInput {
  limit?: number;
}

interface GetWhatsAppMessagesInput {
  jid: string;
  limit?: number;
}

interface WhatsAppApiResponse {
  success: boolean;
  error?: string;
  message?: string;
  chats?: Array<{ jid: string; name?: string; lastMessageAt?: number }>;
  messages?: Array<{ senderJid: string; fromMe: boolean; text: string; timestamp: number }>;
}

const server = new Server({ name: 'whatsapp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'SendWhatsAppMessage',
      description:
        'Send a WhatsApp message to a contact using the connected WhatsApp account. ' +
        'Only works when WhatsApp is connected in Settings → Integrations. ' +
        'Provide the recipient as a phone number in international format (e.g. +15551234567) ' +
        'or as the value the user provided.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description:
              "The recipient's phone number in international format (e.g. +15551234567) " +
              'or the value the user provided.',
          },
          message: {
            type: 'string',
            description: 'The text message to send.',
          },
        },
        required: ['recipient', 'message'],
      },
    },
    {
      name: 'ListWhatsAppChats',
      description:
        'List recent WhatsApp conversations for the connected account. ' +
        'Returns contact JIDs, display names, and last activity timestamps. ' +
        'Use this to discover recent conversations before reading messages. ' +
        'Only works when WhatsApp is connected in Settings → Integrations.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of chats to return (default 20, max 100).',
          },
        },
        required: [],
      },
    },
    {
      name: 'GetWhatsAppMessages',
      description:
        'Get recent messages from a specific WhatsApp conversation. ' +
        'Provide the contact JID (e.g. 15551234567@s.whatsapp.net for a contact, ' +
        'or the group JID for a group). ' +
        'Only works when WhatsApp is connected in Settings → Integrations.',
      inputSchema: {
        type: 'object',
        properties: {
          jid: {
            type: 'string',
            description:
              'The WhatsApp JID of the conversation ' +
              '(e.g. 15551234567@s.whatsapp.net or groupid@g.us).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default 20, max 100).',
          },
        },
        required: ['jid'],
      },
    },
  ],
}));

async function callApi(path: string, body: Record<string, unknown>): Promise<WhatsAppApiResponse> {
  const response = await fetch(`${WHATSAPP_API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp API returned ${response.status}`);
  }
  return (await response.json()) as WhatsAppApiResponse;
}

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name } = request.params;

  if (name === 'SendWhatsAppMessage') {
    const { recipient, message } = (request.params.arguments ??
      {}) as unknown as SendWhatsAppMessageInput;

    if (!recipient?.trim()) {
      return {
        content: [{ type: 'text', text: 'Error: A recipient is required.' }],
        isError: true,
      };
    }
    if (!message?.trim()) {
      return {
        content: [{ type: 'text', text: 'Error: A message body is required.' }],
        isError: true,
      };
    }

    try {
      const result = await callApi('/send', {
        recipient: recipient.trim(),
        message: message.trim(),
      });
      if (!result.success) {
        return {
          content: [{ type: 'text', text: result.message ?? 'Failed to send WhatsApp message.' }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: `Message sent to ${recipient.trim()}.` }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: Failed to reach WhatsApp API: ${msg}` }],
        isError: true,
      };
    }
  }

  if (name === 'ListWhatsAppChats') {
    const { limit } = (request.params.arguments ?? {}) as unknown as ListWhatsAppChatsInput;
    try {
      const result = await callApi('/chats', { limit: limit ?? 20 });
      if (!result.success) {
        return {
          content: [{ type: 'text', text: result.message ?? 'Failed to list WhatsApp chats.' }],
          isError: true,
        };
      }
      const chats = result.chats ?? [];
      if (chats.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No WhatsApp conversations found. The store may still be loading — try again in a moment.',
            },
          ],
        };
      }
      const lines = chats.map((c) => {
        const ts = c.lastMessageAt ? new Date(c.lastMessageAt * 1000).toISOString() : 'unknown';
        return `• ${c.name ?? c.jid} (${c.jid}) — last active: ${ts}`;
      });
      return {
        content: [{ type: 'text', text: `Recent WhatsApp conversations:\n${lines.join('\n')}` }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: Failed to reach WhatsApp API: ${msg}` }],
        isError: true,
      };
    }
  }

  if (name === 'GetWhatsAppMessages') {
    const { jid, limit } = (request.params.arguments ?? {}) as unknown as GetWhatsAppMessagesInput;
    if (!jid?.trim()) {
      return { content: [{ type: 'text', text: 'Error: A jid is required.' }], isError: true };
    }
    try {
      const result = await callApi('/messages', { jid: jid.trim(), limit: limit ?? 20 });
      if (!result.success) {
        return {
          content: [{ type: 'text', text: result.message ?? 'Failed to get WhatsApp messages.' }],
          isError: true,
        };
      }
      const messages = result.messages ?? [];
      if (messages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No messages found for this conversation. The store may still be loading — try again in a moment.',
            },
          ],
        };
      }
      const lines = messages.map((m) => {
        const ts = new Date(m.timestamp * 1000).toISOString();
        const sender = m.fromMe ? 'You' : m.senderJid;
        return `[${ts}] ${sender}: ${m.text}`;
      });
      return {
        content: [{ type: 'text', text: `Messages from ${jid.trim()}:\n${lines.join('\n')}` }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: Failed to reach WhatsApp API: ${msg}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Error: Unknown tool: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('WhatsApp MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
