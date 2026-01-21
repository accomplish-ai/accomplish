# Agent-Browser Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace dev-browser and dev-browser-mcp with agent-browser's cleaner implementation while keeping the same HTTP server architecture.

**Architecture:** HTTP server (browser/) manages single Chromium with shared profile. MCP server (browser-mcp/) connects via CDP, exposes tools using agent-browser's snapshot system (Playwright's native `ariaSnapshot()` + `getByRole()` locators).

**Tech Stack:** TypeScript, Playwright, Express, MCP SDK

---

## Task 1: Create browser/src/snapshot.ts

Copy agent-browser's snapshot module with minimal changes.

**Files:**
- Create: `apps/desktop/skills/browser/src/snapshot.ts`

**Step 1: Create the snapshot module**

```typescript
/**
 * Enhanced snapshot with element refs for deterministic element selection.
 * Adapted from agent-browser's snapshot.ts
 */

import type { Page, Locator } from 'playwright';

export interface RefMap {
  [ref: string]: {
    selector: string;
    role: string;
    name?: string;
    nth?: number;
  };
}

export interface EnhancedSnapshot {
  tree: string;
  refs: RefMap;
}

export interface SnapshotOptions {
  interactive?: boolean;
  maxDepth?: number;
  compact?: boolean;
  selector?: string;
}

let refCounter = 0;

export function resetRefs(): void {
  refCounter = 0;
}

function nextRef(): string {
  return `e${++refCounter}`;
}

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'searchbox',
  'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]);

const CONTENT_ROLES = new Set([
  'heading', 'cell', 'gridcell', 'columnheader', 'rowheader',
  'listitem', 'article', 'region', 'main', 'navigation',
]);

const STRUCTURAL_ROLES = new Set([
  'generic', 'group', 'list', 'table', 'row', 'rowgroup', 'grid',
  'treegrid', 'menu', 'menubar', 'toolbar', 'tablist', 'tree',
  'directory', 'document', 'application', 'presentation', 'none',
]);

function buildSelector(role: string, name?: string): string {
  if (name) {
    const escapedName = name.replace(/"/g, '\\"');
    return `getByRole('${role}', { name: "${escapedName}", exact: true })`;
  }
  return `getByRole('${role}')`;
}

export async function getEnhancedSnapshot(
  page: Page,
  options: SnapshotOptions = {}
): Promise<EnhancedSnapshot> {
  resetRefs();
  const refs: RefMap = {};

  const locator = options.selector ? page.locator(options.selector) : page.locator(':root');
  const ariaTree = await locator.ariaSnapshot();

  if (!ariaTree) {
    return { tree: '(empty)', refs: {} };
  }

  const enhancedTree = processAriaTree(ariaTree, refs, options);
  return { tree: enhancedTree, refs };
}

interface RoleNameTracker {
  counts: Map<string, number>;
  refsByKey: Map<string, string[]>;
  getKey(role: string, name?: string): string;
  getNextIndex(role: string, name?: string): number;
  trackRef(role: string, name: string | undefined, ref: string): void;
  getDuplicateKeys(): Set<string>;
}

function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string): string {
      return `${role}:${name ?? ''}`;
    },
    getNextIndex(role: string, name?: string): number {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string): void {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys(): Set<string> {
      const duplicates = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) duplicates.add(key);
      }
      return duplicates;
    },
  };
}

function processAriaTree(ariaTree: string, refs: RefMap, options: SnapshotOptions): string {
  const lines = ariaTree.split('\n');
  const result: string[] = [];
  const tracker = createRoleNameTracker();

  if (options.interactive) {
    for (const line of lines) {
      const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
      if (!match) continue;

      const [, , role, name, suffix] = match;
      const roleLower = role.toLowerCase();

      if (INTERACTIVE_ROLES.has(roleLower)) {
        const ref = nextRef();
        const nth = tracker.getNextIndex(roleLower, name);
        tracker.trackRef(roleLower, name, ref);
        refs[ref] = { selector: buildSelector(roleLower, name), role: roleLower, name, nth };

        let enhanced = `- ${role}`;
        if (name) enhanced += ` "${name}"`;
        enhanced += ` [ref=${ref}]`;
        if (nth > 0) enhanced += ` [nth=${nth}]`;
        if (suffix && suffix.includes('[')) enhanced += suffix;
        result.push(enhanced);
      }
    }
    removeNthFromNonDuplicates(refs, tracker);
    return result.join('\n') || '(no interactive elements)';
  }

  for (const line of lines) {
    const processed = processLine(line, refs, options, tracker);
    if (processed !== null) result.push(processed);
  }
  removeNthFromNonDuplicates(refs, tracker);

  if (options.compact) return compactTree(result.join('\n'));
  return result.join('\n');
}

function removeNthFromNonDuplicates(refs: RefMap, tracker: RoleNameTracker): void {
  const duplicateKeys = tracker.getDuplicateKeys();
  for (const [, data] of Object.entries(refs)) {
    const key = tracker.getKey(data.role, data.name);
    if (!duplicateKeys.has(key)) delete data.nth;
  }
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

function processLine(
  line: string,
  refs: RefMap,
  options: SnapshotOptions,
  tracker: RoleNameTracker
): string | null {
  const depth = getIndentLevel(line);
  if (options.maxDepth !== undefined && depth > options.maxDepth) return null;

  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
  if (!match) {
    if (options.interactive) return null;
    return line;
  }

  const [, prefix, role, name, suffix] = match;
  const roleLower = role.toLowerCase();
  if (role.startsWith('/')) return line;

  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);

  if (options.interactive && !isInteractive) return null;
  if (options.compact && isStructural && !name) return null;

  const shouldHaveRef = isInteractive || (isContent && name);
  if (shouldHaveRef) {
    const ref = nextRef();
    const nth = tracker.getNextIndex(roleLower, name);
    tracker.trackRef(roleLower, name, ref);
    refs[ref] = { selector: buildSelector(roleLower, name), role: roleLower, name, nth };

    let enhanced = `${prefix}${role}`;
    if (name) enhanced += ` "${name}"`;
    enhanced += ` [ref=${ref}]`;
    if (nth > 0) enhanced += ` [nth=${nth}]`;
    if (suffix) enhanced += suffix;
    return enhanced;
  }

  return line;
}

function compactTree(tree: string): string {
  const lines = tree.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('[ref=')) { result.push(line); continue; }
    if (line.includes(':') && !line.endsWith(':')) { result.push(line); continue; }

    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;
    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]);
      if (childIndent <= currentIndent) break;
      if (lines[j].includes('[ref=')) { hasRelevantChildren = true; break; }
    }
    if (hasRelevantChildren) result.push(line);
  }

  return result.join('\n');
}

export function parseRef(arg: string): string | null {
  if (arg.startsWith('@')) return arg.slice(1);
  if (arg.startsWith('ref=')) return arg.slice(4);
  if (/^e\d+$/.test(arg)) return arg;
  return null;
}

export function getLocatorFromRef(page: Page, ref: string, refMap: RefMap): Locator | null {
  const refData = refMap[ref];
  if (!refData) return null;

  let locator: Locator;
  if (refData.name) {
    locator = page.getByRole(refData.role as any, { name: refData.name, exact: true });
  } else {
    locator = page.getByRole(refData.role as any);
  }

  if (refData.nth !== undefined) {
    locator = locator.nth(refData.nth);
  }

  return locator;
}
```

**Step 2: Verify the file was created**

Run: `ls -la apps/desktop/skills/browser/src/snapshot.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add apps/desktop/skills/browser/src/snapshot.ts
git commit -m "feat(browser): add snapshot module from agent-browser"
```

---

## Task 2: Create browser/src/types.ts

Define shared types for the browser package.

**Files:**
- Create: `apps/desktop/skills/browser/src/types.ts`

**Step 1: Create the types file**

```typescript
export interface ServeOptions {
  port?: number;
  cdpPort?: number;
  headless?: boolean;
  profileDir?: string;
  useSystemChrome?: boolean;
}

export interface GetPageRequest {
  name: string;
  viewport?: { width: number; height: number };
}

export interface GetPageResponse {
  wsEndpoint: string;
  name: string;
  targetId: string;
}

export interface ListPagesResponse {
  pages: string[];
}

export interface ServerInfoResponse {
  wsEndpoint: string;
}

export interface BrowserServer {
  wsEndpoint: string;
  port: number;
  stop: () => Promise<void>;
}
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/browser/src/types.ts
git commit -m "feat(browser): add types module"
```

---

## Task 3: Create browser/src/index.ts

HTTP server with browser management. Keep the current structure but simplify.

**Files:**
- Create: `apps/desktop/skills/browser/src/index.ts`

**Step 1: Create the server module**

```typescript
import express, { type Express, type Request, type Response } from 'express';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { Socket } from 'net';
import type {
  ServeOptions,
  GetPageRequest,
  GetPageResponse,
  ListPagesResponse,
  ServerInfoResponse,
  BrowserServer,
} from './types.js';

export type { ServeOptions, GetPageResponse, ListPagesResponse, ServerInfoResponse, BrowserServer };
export { getEnhancedSnapshot, parseRef, getLocatorFromRef, type RefMap, type EnhancedSnapshot, type SnapshotOptions } from './snapshot.js';

async function fetchWithRetry(url: string, maxRetries = 5, delayMs = 500): Promise<globalThis.Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${message}`)), ms)),
  ]);
}

export async function serve(options: ServeOptions = {}): Promise<BrowserServer> {
  const port = options.port ?? 9224;
  const headless = options.headless ?? false;
  const cdpPort = options.cdpPort ?? 9225;
  const profileDir = options.profileDir;
  const useSystemChrome = options.useSystemChrome ?? true;

  if (port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
  if (cdpPort < 1 || cdpPort > 65535) throw new Error(`Invalid cdpPort: ${cdpPort}`);
  if (port === cdpPort) throw new Error('port and cdpPort must be different');

  const baseProfileDir = profileDir ?? join(process.cwd(), '.browser-data');
  let context: BrowserContext;
  let usedSystemChrome = false;

  if (useSystemChrome) {
    try {
      console.log('Trying to use system Chrome...');
      const chromeUserDataDir = join(baseProfileDir, 'chrome-profile');
      mkdirSync(chromeUserDataDir, { recursive: true });

      context = await chromium.launchPersistentContext(chromeUserDataDir, {
        headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [`--remote-debugging-port=${cdpPort}`, '--disable-blink-features=AutomationControlled'],
      });
      usedSystemChrome = true;
      console.log('Using system Chrome');
    } catch {
      console.log('System Chrome not available, falling back to Playwright Chromium...');
    }
  }

  if (!usedSystemChrome) {
    const playwrightUserDataDir = join(baseProfileDir, 'playwright-profile');
    mkdirSync(playwrightUserDataDir, { recursive: true });

    console.log('Launching browser with Playwright Chromium...');
    context = await chromium.launchPersistentContext(playwrightUserDataDir, {
      headless,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [`--remote-debugging-port=${cdpPort}`, '--disable-blink-features=AutomationControlled'],
    });
  }

  context.on('close', () => {
    console.log('Browser context closed. Exiting server...');
    process.exit(0);
  });

  const cdpResponse = await fetchWithRetry(`http://127.0.0.1:${cdpPort}/json/version`);
  const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
  const wsEndpoint = cdpInfo.webSocketDebuggerUrl;
  console.log(`CDP WebSocket endpoint: ${wsEndpoint}`);

  interface PageEntry { page: Page; targetId: string; }
  const registry = new Map<string, PageEntry>();

  async function getTargetId(page: Page): Promise<string> {
    const cdpSession = await context.newCDPSession(page);
    try {
      const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
      return targetInfo.targetId;
    } finally {
      await cdpSession.detach();
    }
  }

  const app: Express = express();
  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    res.json({ wsEndpoint } as ServerInfoResponse);
  });

  app.get('/pages', (_req: Request, res: Response) => {
    res.json({ pages: Array.from(registry.keys()) } as ListPagesResponse);
  });

  app.post('/pages', async (req: Request, res: Response) => {
    const body = req.body as GetPageRequest;
    const { name, viewport } = body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (name.length === 0 || name.length > 256) {
      res.status(400).json({ error: 'name must be 1-256 characters' });
      return;
    }

    let entry = registry.get(name);
    if (!entry) {
      const page = await withTimeout(context.newPage(), 30000, 'Page creation timed out');
      if (viewport) await page.setViewportSize(viewport);
      const targetId = await getTargetId(page);
      entry = { page, targetId };
      registry.set(name, entry);
      page.on('close', () => registry.delete(name));
    }

    res.json({ wsEndpoint, name, targetId: entry.targetId } as GetPageResponse);
  });

  app.delete('/pages/:name', async (req: Request<{ name: string }>, res: Response) => {
    const name = decodeURIComponent(req.params.name);
    const entry = registry.get(name);
    if (entry) {
      await entry.page.close();
      registry.delete(name);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'page not found' });
    }
  });

  const server = app.listen(port, () => console.log(`Browser server running on port ${port}`));

  const connections = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
  });

  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    console.log('\nShutting down...');
    for (const socket of connections) socket.destroy();
    connections.clear();
    for (const entry of registry.values()) {
      try { await entry.page.close(); } catch {}
    }
    registry.clear();
    try { await context.close(); } catch {}
    server.close();
  };

  const signalHandler = async () => { await cleanup(); process.exit(0); };
  const errorHandler = async (err: unknown) => { console.error('Error:', err); await cleanup(); process.exit(1); };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  process.on('uncaughtException', errorHandler);
  process.on('unhandledRejection', errorHandler);

  return {
    wsEndpoint,
    port,
    async stop() {
      process.off('SIGINT', signalHandler);
      process.off('SIGTERM', signalHandler);
      await cleanup();
    },
  };
}
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/browser/src/index.ts
git commit -m "feat(browser): add HTTP server module"
```

---

## Task 4: Create browser/package.json

**Files:**
- Create: `apps/desktop/skills/browser/package.json`

**Step 1: Create package.json**

```json
{
  "name": "browser",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "npx tsx src/index.ts",
    "dev": "npx tsx --watch src/index.ts"
  },
  "dependencies": {
    "express": "^4.21.0",
    "playwright": "npm:rebrowser-playwright@^1.52.0",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `apps/desktop/skills/browser/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Commit**

```bash
git add apps/desktop/skills/browser/package.json apps/desktop/skills/browser/tsconfig.json
git commit -m "feat(browser): add package configuration"
```

---

## Task 5: Create browser-mcp/src/index.ts

New MCP server with agent-browser's tool API.

**Files:**
- Create: `apps/desktop/skills/browser-mcp/src/index.ts`

**Step 1: Create the MCP server**

```typescript
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
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/browser-mcp/src/index.ts
git commit -m "feat(browser-mcp): add MCP server with new tool API"
```

---

## Task 6: Create browser-mcp/package.json

**Files:**
- Create: `apps/desktop/skills/browser-mcp/package.json`
- Create: `apps/desktop/skills/browser-mcp/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "browser-mcp",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "npx tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.11.0",
    "playwright": "npm:rebrowser-playwright@^1.52.0",
    "tsx": "^4.21.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Commit**

```bash
git add apps/desktop/skills/browser-mcp/package.json apps/desktop/skills/browser-mcp/tsconfig.json
git commit -m "feat(browser-mcp): add package configuration"
```

---

## Task 7: Update SKILL.md

**Files:**
- Create: `apps/desktop/skills/browser/SKILL.md`

**Step 1: Write SKILL.md**

```markdown
---
name: browser
description: Browser automation via MCP tools. Use these tools for ANY web task.
---

# Browser Automation

## CRITICAL: No Shell Commands

**NEVER use bash/shell commands to open browsers or URLs.** This includes `open`, `xdg-open`, `start`, Python `webbrowser`.

## Tools

**Navigation:**
- `browser_open(url, wait?, page_name?)` - Navigate to URL
- `browser_back()` / `browser_forward()` / `browser_reload()`

**Snapshot & Interaction:**
- `browser_snapshot(interactive?, compact?)` - Get ARIA tree with refs like `[ref=e5]`
- `browser_click(ref|selector)` - Click element
- `browser_type(ref|selector, text, clear?)` - Type into input
- `browser_fill(ref|selector, value)` - Fill input (faster)
- `browser_press(key)` - Press key (Enter, Tab, Ctrl+a)
- `browser_hover(ref|selector)` - Hover over element
- `browser_select(ref|selector, value)` - Select dropdown option

**Content:**
- `browser_screenshot(full?, selector?)` - Take screenshot
- `browser_get(ref|selector, attr?)` - Get text/value/attribute

**Other:**
- `browser_wait(selector?, text?, url?, timeout?)` - Wait for condition
- `browser_evaluate(script)` - Run JavaScript
- `browser_tabs(action)` - List or close pages

## Workflow

1. `browser_open("google.com")`
2. `browser_snapshot()` - find refs like `[ref=e12]`
3. `browser_type(ref="e12", text="search query")` then `browser_press(key="Enter")`
4. `browser_screenshot()` to verify

## Using Refs

Refs from `browser_snapshot` can be used as: `e5`, `@e5`, or `ref=e5`

## Login Pages

When you reach a login page, ASK the user to log in manually, then continue.
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/browser/SKILL.md
git commit -m "docs(browser): add SKILL.md documentation"
```

---

## Task 8: Update config-generator.ts

Update system prompt and MCP config paths.

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Update MCP server config**

Find the `dev-browser-mcp` config and rename to `browser-mcp`:

```typescript
// Old:
'dev-browser-mcp': {
  type: 'local',
  command: ['npx', 'tsx', path.join(skillsPath, 'dev-browser-mcp', 'src', 'index.ts')],
  ...
}

// New:
'browser-mcp': {
  type: 'local',
  command: ['npx', 'tsx', path.join(skillsPath, 'browser-mcp', 'src', 'index.ts')],
  enabled: true,
  timeout: 30000,
}
```

**Step 2: Update system prompt tool references**

Replace mentions of `browser_navigate` with `browser_open` and update tool names in the prompt.

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat(config): update to use browser-mcp with new tool API"
```

---

## Task 9: Update task-manager.ts

Update browser server startup paths.

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts`

**Step 1: Update path references**

Find references to `dev-browser` and change to `browser`:

```typescript
// Old:
const devBrowserDir = path.join(skillsPath, 'dev-browser');

// New:
const browserDir = path.join(skillsPath, 'browser');
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "feat(task-manager): update to use browser package"
```

---

## Task 10: Update postinstall scripts

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Update postinstall to install browser and browser-mcp**

Find the postinstall script and update package paths:

```json
"postinstall": "electron-rebuild && npm --prefix skills/browser install && npm --prefix skills/browser-mcp install && ..."
```

**Step 2: Commit**

```bash
git add apps/desktop/package.json
git commit -m "build: update postinstall for browser packages"
```

---

## Task 11: Delete old packages

**Files:**
- Delete: `apps/desktop/skills/dev-browser/`
- Delete: `apps/desktop/skills/dev-browser-mcp/`

**Step 1: Remove old directories**

```bash
rm -rf apps/desktop/skills/dev-browser
rm -rf apps/desktop/skills/dev-browser-mcp
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove old dev-browser packages"
```

---

## Task 12: Install dependencies and test

**Step 1: Install new package dependencies**

```bash
cd apps/desktop/skills/browser && npm install
cd ../browser-mcp && npm install
```

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors

**Step 3: Build the app**

```bash
pnpm build:desktop
```

Expected: Build succeeds

**Step 4: Commit any fixes**

If there are issues, fix them and commit.

---

## Task 13: Manual testing

**Step 1: Start the app in dev mode**

```bash
pnpm dev
```

**Step 2: Test browser tools**

Run a task that uses:
- `browser_open("google.com")`
- `browser_snapshot()`
- `browser_click(ref="...")` or `browser_type(ref="...", text="...")`
- `browser_screenshot()`

**Step 3: Verify**

- [ ] Navigation works
- [ ] Snapshot returns refs
- [ ] Click by ref works
- [ ] Type by ref works
- [ ] Screenshot returns image

---

## Task 14: Version bump and changelog

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version to 0.4.0**

This is a breaking change (new tool API).

**Step 2: Update CHANGELOG if present**

Document:
- New browser tool API (breaking change)
- Replaced dev-browser with browser package
- Uses Playwright's native ariaSnapshot() for better reliability

**Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump version to 0.4.0"
```
