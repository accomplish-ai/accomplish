#!/usr/bin/env node
/**
 * context-memory MCP Server
 *
 * PURPOSE: Persists session context across CLI restarts to enable
 * reliable continuations without cache loss.
 *
 * TOOLS:
 * - update_session_context: Agent calls to save current context
 * - get_session_context: Adapter calls to retrieve context for continuation
 * - clear_session_context: Clean up after task completion
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

console.error('[context-memory] Starting MCP server...');

const server = new Server(
  { name: 'context-memory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Placeholder handlers - will implement in next tasks
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[context-memory] MCP server running');
}

main().catch((error) => {
  console.error('[context-memory] Fatal error:', error);
  process.exit(1);
});
