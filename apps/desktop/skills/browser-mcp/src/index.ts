#!/usr/bin/env node
/**
 * Browser MCP Server - Exposes browser automation tools via MCP
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { chromium, type Browser, type Page } from 'playwright';
import { getEnhancedSnapshot, parseRef, getLocatorFromRef, type RefMap } from '../../browser/src/snapshot.js';

const DEV_BROWSER_PORT = 9224;
const DEV_BROWSER_URL = `http://localhost:${DEV_BROWSER_PORT}`;
const TASK_ID = process.env.ACCOMPLISH_TASK_ID || 'default';

let browser: Browser | null = null;
let refMap: RefMap = {};

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, i)));
      }
    }
  }
  throw lastError || new Error('fetchWithRetry failed');
}

async function ensureConnected(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  const res = await fetchWithRetry(DEV_BROWSER_URL);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const info = (await res.json()) as { wsEndpoint: string };
  browser = await chromium.connectOverCDP(info.wsEndpoint);
  return browser;
}

function getFullPageName(pageName?: string): string {
  return `${TASK_ID}-${pageName || 'main'}`;
}

async function getPage(pageName?: string): Promise<Page> {
  const fullName = getFullPageName(pageName);
  const res = await fetchWithRetry(`${DEV_BROWSER_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fullName }),
  });
  if (!res.ok) throw new Error(`Failed to get page: ${await res.text()}`);
  const { targetId } = (await res.json()) as { targetId: string };

  const b = await ensureConnected();
  for (const ctx of b.contexts()) {
    for (const page of ctx.pages()) {
      const cdpSession = await ctx.newCDPSession(page);
      try {
        const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
        if (targetInfo.targetId === targetId) return page;
      } finally {
        await cdpSession.detach();
      }
    }
  }
  throw new Error(`Page not found: ${fullName}`);
}

function getLocator(page: Page, refOrSelector: string) {
  const ref = parseRef(refOrSelector);
  if (ref) {
    const locator = getLocatorFromRef(page, ref, refMap);
    if (!locator) throw new Error(`Ref "${ref}" not found. Run browser_snapshot first.`);
    return locator;
  }
  return page.locator(refOrSelector);
}

const server = new Server({ name: 'browser-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser_open',
      description: 'Navigate to a URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          wait: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Wait condition' },
          page_name: { type: 'string', description: 'Page name (default: main)' },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_snapshot',
      description: 'Get accessibility tree with element refs',
      inputSchema: {
        type: 'object',
        properties: {
          interactive: { type: 'boolean', description: 'Only interactive elements' },
          compact: { type: 'boolean', description: 'Remove empty structural elements' },
          selector: { type: 'string', description: 'CSS selector to scope snapshot' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click an element',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Element ref from snapshot (e.g., e5 or @e5)' },
          selector: { type: 'string', description: 'CSS selector (fallback)' },
          button: { type: 'string', enum: ['left', 'right', 'middle'] },
          count: { type: 'number', description: 'Click count (2 for double-click)' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into an input',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Element ref from snapshot' },
          selector: { type: 'string', description: 'CSS selector (fallback)' },
          text: { type: 'string', description: 'Text to type' },
          clear: { type: 'boolean', description: 'Clear input first' },
          page_name: { type: 'string' },
        },
        required: ['text'],
      },
    },
    {
      name: 'browser_fill',
      description: 'Fill an input with a value (faster than type)',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          selector: { type: 'string' },
          value: { type: 'string', description: 'Value to fill' },
          page_name: { type: 'string' },
        },
        required: ['value'],
      },
    },
    {
      name: 'browser_press',
      description: 'Press a key (Enter, Tab, Escape, Ctrl+a, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press' },
          page_name: { type: 'string' },
        },
        required: ['key'],
      },
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot',
      inputSchema: {
        type: 'object',
        properties: {
          full: { type: 'boolean', description: 'Full page screenshot' },
          selector: { type: 'string', description: 'Element to screenshot' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_back',
      description: 'Go back',
      inputSchema: { type: 'object', properties: { page_name: { type: 'string' } } },
    },
    {
      name: 'browser_forward',
      description: 'Go forward',
      inputSchema: { type: 'object', properties: { page_name: { type: 'string' } } },
    },
    {
      name: 'browser_reload',
      description: 'Reload the page',
      inputSchema: { type: 'object', properties: { page_name: { type: 'string' } } },
    },
    {
      name: 'browser_hover',
      description: 'Hover over an element',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          selector: { type: 'string' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_select',
      description: 'Select a dropdown option',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          selector: { type: 'string' },
          value: { type: 'string', description: 'Option value to select' },
          page_name: { type: 'string' },
        },
        required: ['value'],
      },
    },
    {
      name: 'browser_wait',
      description: 'Wait for a condition',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Wait for element' },
          text: { type: 'string', description: 'Wait for text' },
          url: { type: 'string', description: 'Wait for URL pattern' },
          timeout: { type: 'number', description: 'Timeout in ms' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_evaluate',
      description: 'Run JavaScript in the page',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript code' },
          page_name: { type: 'string' },
        },
        required: ['script'],
      },
    },
    {
      name: 'browser_get',
      description: 'Get text, value, or attribute from an element',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          selector: { type: 'string' },
          attr: { type: 'string', description: 'Attribute name (omit for text content)' },
          page_name: { type: 'string' },
        },
      },
    },
    {
      name: 'browser_tabs',
      description: 'List or manage tabs',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'close'], description: 'Action to perform' },
          page_name: { type: 'string', description: 'Page to close (for close action)' },
        },
        required: ['action'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, unknown>;

  try {
    switch (name) {
      case 'browser_open': {
        const page = await getPage(a.page_name as string);
        let url = a.url as string;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        const waitUntil = (a.wait as 'load' | 'domcontentloaded' | 'networkidle') || 'load';
        await page.goto(url, { waitUntil });
        return { content: [{ type: 'text', text: `Navigated to ${url}. Use browser_snapshot to see page elements.` }] };
      }

      case 'browser_snapshot': {
        const page = await getPage(a.page_name as string);
        const snapshot = await getEnhancedSnapshot(page, {
          interactive: a.interactive as boolean,
          compact: a.compact as boolean,
          selector: a.selector as string,
        });
        refMap = snapshot.refs;
        const refCount = Object.keys(refMap).length;
        return { content: [{ type: 'text', text: `# Page: ${page.url()}\n# Refs: ${refCount}\n\n${snapshot.tree}` }] };
      }

      case 'browser_click': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        const locator = getLocator(page, target);
        const clickCount = (a.count as number) || 1;
        const button = (a.button as 'left' | 'right' | 'middle') || 'left';
        await locator.click({ clickCount, button });
        return { content: [{ type: 'text', text: `Clicked ${target}` }] };
      }

      case 'browser_type': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        const locator = getLocator(page, target);
        if (a.clear) await locator.clear();
        await locator.pressSequentially(a.text as string);
        return { content: [{ type: 'text', text: `Typed "${a.text}" into ${target}` }] };
      }

      case 'browser_fill': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        const locator = getLocator(page, target);
        await locator.fill(a.value as string);
        return { content: [{ type: 'text', text: `Filled ${target} with "${a.value}"` }] };
      }

      case 'browser_press': {
        const page = await getPage(a.page_name as string);
        await page.keyboard.press(a.key as string);
        return { content: [{ type: 'text', text: `Pressed ${a.key}` }] };
      }

      case 'browser_screenshot': {
        const page = await getPage(a.page_name as string);
        let buffer: Buffer;
        if (a.selector) {
          buffer = await page.locator(a.selector as string).screenshot();
        } else {
          buffer = await page.screenshot({ fullPage: a.full as boolean });
        }
        return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType: 'image/png' }] };
      }

      case 'browser_back': {
        const page = await getPage(a.page_name as string);
        await page.goBack();
        return { content: [{ type: 'text', text: 'Went back' }] };
      }

      case 'browser_forward': {
        const page = await getPage(a.page_name as string);
        await page.goForward();
        return { content: [{ type: 'text', text: 'Went forward' }] };
      }

      case 'browser_reload': {
        const page = await getPage(a.page_name as string);
        await page.reload();
        return { content: [{ type: 'text', text: 'Reloaded page' }] };
      }

      case 'browser_hover': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        await getLocator(page, target).hover();
        return { content: [{ type: 'text', text: `Hovered over ${target}` }] };
      }

      case 'browser_select': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        await getLocator(page, target).selectOption(a.value as string);
        return { content: [{ type: 'text', text: `Selected "${a.value}" in ${target}` }] };
      }

      case 'browser_wait': {
        const page = await getPage(a.page_name as string);
        const timeout = (a.timeout as number) || 30000;
        if (a.selector) {
          await page.waitForSelector(a.selector as string, { timeout });
          return { content: [{ type: 'text', text: `Element appeared: ${a.selector}` }] };
        }
        if (a.text) {
          await page.waitForFunction((t) => document.body.innerText.includes(t), a.text as string, { timeout });
          return { content: [{ type: 'text', text: `Text appeared: "${a.text}"` }] };
        }
        if (a.url) {
          await page.waitForURL(a.url as string, { timeout });
          return { content: [{ type: 'text', text: `URL matched: ${a.url}` }] };
        }
        return { content: [{ type: 'text', text: 'No wait condition specified' }] };
      }

      case 'browser_evaluate': {
        const page = await getPage(a.page_name as string);
        const result = await page.evaluate(a.script as string);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'browser_get': {
        const page = await getPage(a.page_name as string);
        const target = (a.ref || a.selector) as string;
        if (!target) throw new Error('Either ref or selector required');
        const locator = getLocator(page, target);
        let value: string;
        if (a.attr) {
          value = (await locator.getAttribute(a.attr as string)) || '';
        } else {
          value = await locator.innerText();
        }
        return { content: [{ type: 'text', text: value }] };
      }

      case 'browser_tabs': {
        if (a.action === 'list') {
          const res = await fetchWithRetry(`${DEV_BROWSER_URL}/pages`);
          const { pages } = (await res.json()) as { pages: string[] };
          const taskPages = pages.filter((p) => p.startsWith(`${TASK_ID}-`));
          return { content: [{ type: 'text', text: taskPages.map((p) => p.replace(`${TASK_ID}-`, '')).join('\n') || '(none)' }] };
        }
        if (a.action === 'close') {
          const fullName = getFullPageName(a.page_name as string);
          await fetchWithRetry(`${DEV_BROWSER_URL}/pages/${encodeURIComponent(fullName)}`, { method: 'DELETE' });
          return { content: [{ type: 'text', text: `Closed page: ${a.page_name || 'main'}` }] };
        }
        return { content: [{ type: 'text', text: 'Unknown action' }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[browser-mcp] Server started');
}

main().catch((err) => {
  console.error('[browser-mcp] Fatal error:', err);
  process.exit(1);
});
