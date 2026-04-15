#!/usr/bin/env node
/**
 * GWS MCP server — Google Docs, Sheets, Slides via @googleworkspace/cli.
 *
 * Supports multi-account via GWS_ACCOUNTS_MANIFEST env var (manifest JSON
 * produced by AccountManager.writeAccountsManifest). Each tool accepts an
 * optional `account` parameter (label or email) to select which account's
 * token to use. When only one account is connected it is used automatically.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ── Account manifest ──────────────────────────────────────────────────────────

interface AccountEntry {
  googleAccountId: string;
  label: string;
  email: string;
  tokenFilePath: string;
}

interface TokenData {
  accessToken: string;
}

function loadManifest(): AccountEntry[] {
  const manifestPath = process.env.GWS_ACCOUNTS_MANIFEST;
  if (!manifestPath) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as AccountEntry[];
  } catch {
    return [];
  }
}

function resolveAccount(
  accounts: AccountEntry[],
  accountParam: string | undefined,
): { entry: AccountEntry; error?: undefined } | { entry?: undefined; error: string } {
  if (accounts.length === 0) {
    return {
      error: 'No Google accounts configured. Please connect an account in Settings → Integrations.',
    };
  }

  if (accountParam) {
    const needle = accountParam.toLowerCase();
    const match = accounts.find(
      (a) => a.label.toLowerCase() === needle || a.email.toLowerCase() === needle,
    );
    if (!match) {
      const available = accounts.map((a) => `${a.label} (${a.email})`).join(', ');
      return { error: `Account not found: "${accountParam}". Available: ${available}` };
    }
    return { entry: match };
  }

  if (accounts.length === 1) {
    return { entry: accounts[0] };
  }

  const available = accounts.map((a) => `${a.label} (${a.email})`).join(', ');
  return {
    error: `Multiple accounts connected. Specify which account to use with the 'account' parameter. Available: ${available}`,
  };
}

function readToken(entry: AccountEntry): string {
  const data = JSON.parse(fs.readFileSync(entry.tokenFilePath, 'utf-8')) as TokenData;
  return data.accessToken;
}

// ── GWS CLI binary resolution ─────────────────────────────────────────────────

function resolveGwsBin(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve('@googleworkspace/cli/package.json');
    const pkgDir = path.dirname(pkgJsonPath);

    if (process.platform === 'win32') {
      const nativeBin = path.join(pkgDir, 'node_modules', '.bin_real', 'gws.exe');
      if (fs.existsSync(nativeBin)) {
        return nativeBin;
      }
      return null;
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
      bin?: string | Record<string, string>;
    };
    const binEntry: string | undefined =
      typeof pkgJson.bin === 'string' ? pkgJson.bin : pkgJson.bin?.gws;
    if (!binEntry) {
      return null;
    }
    return path.resolve(pkgDir, binEntry);
  } catch {
    return null;
  }
}

const GWS_BIN = resolveGwsBin();

// ── Command execution ─────────────────────────────────────────────────────────

function tokenizeCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\' && !inSingle && i + 1 < command.length) {
      current += command[i + 1];
      i++;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function runGws(command: string, token: string): Promise<{ stdout: string; stderr: string }> {
  if (!GWS_BIN) {
    return Promise.reject(
      new Error(
        '@googleworkspace/cli is not installed. ' +
          'Google Docs, Sheets, and Slides require this package.',
      ),
    );
  }

  const args = [...tokenizeCommand(command), '--format', 'json'];

  return new Promise((resolve, reject) => {
    execFile(
      GWS_BIN,
      args,
      {
        env: { ...process.env, GOOGLE_WORKSPACE_CLI_TOKEN: token },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          let apiError: string | null = null;
          if (stdout) {
            try {
              const parsed = JSON.parse(stdout.trim()) as {
                error?: { message?: string; code?: number };
              };
              if (parsed?.error?.message) {
                apiError = `${parsed.error.message} (HTTP ${parsed.error.code ?? '?'})`;
              }
            } catch {
              /* not JSON */
            }
          }
          reject(new Error(apiError || stderr || error.message, { cause: error }));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

// ── MCP server ────────────────────────────────────────────────────────────────

const SCOPE_NOTE =
  'Only operates on files created by this app or explicitly selected by the user via Google Picker. ' +
  'If a file returns 403/404, the user may need to grant access.';

interface ToolDef {
  name: string;
  description: string;
  servicePrefix: string;
}

const SERVICE_TOOLS: ToolDef[] = [
  {
    name: 'google_sheets',
    description:
      `Create, read, and write Google Sheets spreadsheets.\n` +
      `Create: google_sheets("spreadsheets create --json '{\\"properties\\": {\\"title\\": \\"My Sheet\\"}}'") → response has "spreadsheetId".\n` +
      `Add row: google_sheets("+append --spreadsheet '<ID>' --values 'Name,Score'")\n` +
      `Read: google_sheets("+read --spreadsheet '<ID>' --range 'Sheet1'")\n` +
      `${SCOPE_NOTE}`,
    servicePrefix: 'sheets',
  },
  {
    name: 'google_docs',
    description:
      `Create, read, and write Google Docs documents.\n` +
      `Create: google_docs("documents create --json '{\\"title\\": \\"My Doc\\"}'") → response has "documentId".\n` +
      `Write: google_docs("+write --document '<ID>' --text 'Hello world'")\n` +
      `Read: google_docs("documents get --params '{\\"documentId\\": \\"<ID>\\"}'") \n` +
      `${SCOPE_NOTE}`,
    servicePrefix: 'docs',
  },
  {
    name: 'google_slides',
    description:
      `Create, read, and write Google Slides presentations.\n` +
      `Create: google_slides("presentations create --json '{\\"title\\": \\"My Deck\\"}'") → response has "presentationId".\n` +
      `Read: google_slides("presentations get --params '{\\"presentationId\\": \\"<ID>\\"}'") to discover slide IDs.\n` +
      `${SCOPE_NOTE}`,
    servicePrefix: 'slides',
  },
];

const server = new McpServer(
  { name: 'gws-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

for (const tool of SERVICE_TOOLS) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: {
        command: z
          .string()
          .describe(
            `Arguments passed after "${tool.servicePrefix}" (the service prefix is added automatically).`,
          ),
        account: z
          .string()
          .optional()
          .describe(
            "Target a specific Google account by label (e.g. 'Work') or email. " +
              'When only one account is connected it is used automatically.',
          ),
      },
    },
    async ({ command, account }) => {
      const accounts = loadManifest();
      const resolved = resolveAccount(accounts, account);
      if (resolved.error) {
        return { content: [{ type: 'text', text: resolved.error }], isError: true };
      }

      let token: string;
      try {
        token = readToken(resolved.entry);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to read token for ${resolved.entry.label}: ${String(err)}`,
            },
          ],
          isError: true,
        };
      }

      const fullCommand = `${tool.servicePrefix} ${command}`;
      try {
        const { stdout } = await runGws(fullCommand, token);
        // runGws only resolves on successful exit (exit code 0); treat output as success
        const text = stdout || '(no output)';
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const is403or404 = /\b40[34]\b/.test(message);
        const hints: string[] = [];
        if (is403or404) {
          hints.push(
            'This file may not be accessible. Use Google Drive to share it with the connected account.',
          );
        }
        const suffix = hints.length > 0 ? '\n\n' + hints.join('\n') : '';
        return {
          content: [{ type: 'text', text: `Error: ${message}${suffix}` }],
          isError: true,
        };
      }
    },
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[gws-mcp] MCP server running');
}

main().catch((error) => {
  console.error('[gws-mcp] Fatal error:', error);
  process.exit(1);
});
