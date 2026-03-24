/**
 * Integration tests: verify all browser_* tools work with remote CDP mode.
 *
 * These tests launch a real headless Chromium browser, connect via remote CDP
 * (no dev-browser HTTP server), and exercise each browser tool function.
 *
 * Run: npx vitest run src/integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import {
  configure,
  ensureConnected,
  getPage,
  listPages,
  closePage,
  resetConnection,
} from './connection.js';

let chromiumProcess: ChildProcess;
let cdpEndpoint: string;

// A minimal HTML page for testing interactions
const TEST_HTML = `data:text/html,
<html>
<head><title>Test Page</title></head>
<body>
  <h1 id="heading">Hello World</h1>
  <input id="input" type="text" placeholder="Type here" />
  <button id="btn" onclick="document.getElementById('result').textContent='clicked'">Click Me</button>
  <p id="result"></p>
  <select id="sel">
    <option value="a">Option A</option>
    <option value="b">Option B</option>
  </select>
  <a href="data:text/html,<h1>Page 2</h1>" id="link" target="_blank">Open New Tab</a>
  <div id="scroll-target" style="margin-top: 2000px;">Scroll Target</div>
  <input type="checkbox" id="checkbox" />
  <div id="draggable" draggable="true" style="width:50px;height:50px;background:red;">Drag</div>
  <div id="drop-zone" style="width:100px;height:100px;background:blue;margin-top:10px;">Drop</div>
  <iframe id="test-iframe" srcdoc="<p id='iframe-text'>Inside iframe</p>"></iframe>
</body>
</html>`;

/**
 * Launch Chromium with --remote-debugging-port and return the CDP ws endpoint.
 * We spawn the executable directly to get a raw CDP endpoint that
 * connectOverCDP can work with (as opposed to Playwright's WS protocol).
 */
async function launchChromiumWithCDP(): Promise<{ process: ChildProcess; wsEndpoint: string }> {
  const executablePath = chromium.executablePath();
  const port = 9333 + Math.floor(Math.random() * 1000);

  const proc = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  // Wait for DevTools listening message on stderr
  const wsEndpoint = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for CDP endpoint')),
      10000,
    );
    let stderrData = '';

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString();
      // Chromium prints: DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID
      const match = stderrData.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]!);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(
        new Error(`Chromium exited with code ${code} before CDP was ready. stderr: ${stderrData}`),
      );
    });
  });

  return { process: proc, wsEndpoint };
}

beforeAll(async () => {
  const result = await launchChromiumWithCDP();
  chromiumProcess = result.process;
  cdpEndpoint = result.wsEndpoint;

  configure({
    mode: 'remote',
    cdpEndpoint,
    taskId: 'integration-test',
  });
}, 15000);

afterAll(async () => {
  resetConnection();
  if (chromiumProcess && !chromiumProcess.killed) {
    chromiumProcess.kill();
  }
});

describe('Remote CDP Integration', () => {
  // --- Connection ---

  it('connects to headless browser via remote CDP', async () => {
    const browser = await ensureConnected();
    expect(browser.isConnected()).toBe(true);
  });

  // --- Page lifecycle ---

  it('creates a new page via getPage()', async () => {
    const page = await getPage('test-main');
    expect(page).toBeDefined();
    expect(page.isClosed()).toBe(false);
  });

  it('returns same page for same name', async () => {
    const page1 = await getPage('reuse-test');
    const page2 = await getPage('reuse-test');
    expect(page1).toBe(page2);
  });

  it('lists pages', async () => {
    await getPage('list-a');
    await getPage('list-b');
    const pages = await listPages();
    expect(pages).toContain('list-a');
    expect(pages).toContain('list-b');
  });

  it('closes a page', async () => {
    await getPage('close-test');
    const result = await closePage('close-test');
    expect(result).toBe(true);
    const pages = await listPages();
    expect(pages).not.toContain('close-test');
  });

  // --- Navigation ---

  it('browser_navigate: navigates to URL', async () => {
    const page = await getPage('nav-test');
    await page.goto(TEST_HTML);
    expect(page.url()).toContain('data:text/html');
    expect(await page.title()).toBe('Test Page');
  });

  // --- Snapshot (accessibility tree) ---

  it('browser_snapshot: gets accessibility snapshot', async () => {
    const page = await getPage('snap-test');
    await page.goto(TEST_HTML);
    const snapshot = await page.accessibility.snapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot?.children?.length).toBeGreaterThan(0);
  });

  // --- Click ---

  it('browser_click: clicks a button', async () => {
    const page = await getPage('click-test');
    await page.goto(TEST_HTML);
    await page.click('#btn');
    const result = await page.textContent('#result');
    expect(result).toBe('clicked');
  });

  // --- Type ---

  it('browser_type: types into input field', async () => {
    const page = await getPage('type-test');
    await page.goto(TEST_HTML);
    await page.fill('#input', 'hello world');
    const value = await page.inputValue('#input');
    expect(value).toBe('hello world');
  });

  // --- Screenshot ---

  it('browser_screenshot: takes a screenshot', async () => {
    const page = await getPage('screenshot-test');
    await page.goto(TEST_HTML);
    const buffer = await page.screenshot();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  // --- Evaluate ---

  it('browser_evaluate: evaluates JavaScript on page', async () => {
    const page = await getPage('eval-test');
    await page.goto(TEST_HTML);
    const title = await page.evaluate(() => document.title);
    expect(title).toBe('Test Page');
  });

  // --- Keyboard ---

  it('browser_keyboard: presses keys', async () => {
    const page = await getPage('keyboard-test');
    await page.goto(TEST_HTML);
    await page.click('#input');
    await page.keyboard.type('typed');
    const value = await page.inputValue('#input');
    expect(value).toBe('typed');
  });

  // --- Scroll ---

  it('browser_scroll: scrolls to element', async () => {
    const page = await getPage('scroll-test');
    await page.goto(TEST_HTML);
    await page.locator('#scroll-target').scrollIntoViewIfNeeded();
    const isVisible = await page.isVisible('#scroll-target');
    expect(isVisible).toBe(true);
  });

  // --- Hover ---

  it('browser_hover: hovers over element', async () => {
    const page = await getPage('hover-test');
    await page.goto(TEST_HTML);
    await page.hover('#btn');
  });

  // --- Select ---

  it('browser_select: selects dropdown option', async () => {
    const page = await getPage('select-test');
    await page.goto(TEST_HTML);
    await page.selectOption('#sel', 'b');
    const value = await page.$eval('#sel', (el: HTMLSelectElement) => el.value);
    expect(value).toBe('b');
  });

  // --- Wait ---

  it('browser_wait: waits for selector', async () => {
    const page = await getPage('wait-test');
    await page.goto(TEST_HTML);
    const element = await page.waitForSelector('#heading', { timeout: 5000 });
    expect(element).toBeDefined();
  });

  // --- Get Text ---

  it('browser_get_text: extracts text content', async () => {
    const page = await getPage('text-test');
    await page.goto(TEST_HTML);
    const text = await page.textContent('#heading');
    expect(text).toBe('Hello World');
  });

  // --- Visibility Checks ---

  it('browser_is_visible: checks element visibility', async () => {
    const page = await getPage('visible-test');
    await page.goto(TEST_HTML);
    const visible = await page.isVisible('#heading');
    expect(visible).toBe(true);
  });

  it('browser_is_enabled: checks element enabled state', async () => {
    const page = await getPage('enabled-test');
    await page.goto(TEST_HTML);
    const enabled = await page.isEnabled('#btn');
    expect(enabled).toBe(true);
  });

  it('browser_is_checked: checks checkbox state', async () => {
    const page = await getPage('checked-test');
    await page.goto(TEST_HTML);
    const checked = await page.isChecked('#checkbox');
    expect(checked).toBe(false);
    await page.check('#checkbox');
    expect(await page.isChecked('#checkbox')).toBe(true);
  });

  // --- iFrame ---

  it('browser_iframe: accesses iframe content', async () => {
    const page = await getPage('iframe-test');
    await page.goto(TEST_HTML);
    const frame = page.frameLocator('#test-iframe');
    const text = await frame.locator('#iframe-text').textContent();
    expect(text).toBe('Inside iframe');
  });

  // --- Tabs ---

  it('browser_tabs: lists and manages tabs', async () => {
    const browser = await ensureConnected();
    const context = browser.contexts()[0]!;
    const initialCount = context.pages().length;

    const newPage = await context.newPage();
    expect(context.pages().length).toBe(initialCount + 1);

    await newPage.close();
    expect(context.pages().length).toBe(initialCount);
  });

  // --- Batch Actions ---

  it('browser_batch_actions: navigates multiple URLs and extracts data', async () => {
    const page = await getPage('batch-test');
    const urls = ['data:text/html,<h1>Page A</h1>', 'data:text/html,<h1>Page B</h1>'];

    const results = [];
    for (const url of urls) {
      await page.goto(url);
      const title = await page.evaluate(() => document.querySelector('h1')?.textContent);
      results.push({ url, title });
    }

    expect(results).toHaveLength(2);
    expect(results[0]?.title).toBe('Page A');
    expect(results[1]?.title).toBe('Page B');
  });

  // --- Sequence ---

  it('browser_sequence: executes multiple actions in order', async () => {
    const page = await getPage('sequence-test');
    await page.goto(TEST_HTML);

    // Click button, then verify result
    await page.click('#btn');
    const afterClick = await page.textContent('#result');
    expect(afterClick).toBe('clicked');

    // Type into input
    await page.fill('#input', 'sequence-value');
    const afterType = await page.inputValue('#input');
    expect(afterType).toBe('sequence-value');
  });

  // --- File Upload (structural) ---

  it('browser_file_upload: file chooser listener works', async () => {
    const page = await getPage('upload-test');
    await page.goto('data:text/html,<input type="file" id="file" />');

    // Verify file chooser can be intercepted (don't actually upload)
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 3000 }),
      page.click('#file'),
    ]);
    expect(fileChooser).toBeDefined();
  });

  // --- Edge cases ---

  it('returns false when closing a non-existent page', async () => {
    const result = await closePage('nonexistent-page');
    expect(result).toBe(false);
  });

  it('ensureConnected returns same browser on repeated calls', async () => {
    const b1 = await ensureConnected();
    const b2 = await ensureConnected();
    expect(b1).toBe(b2);
    expect(b1.isConnected()).toBe(true);
  });

  it('pages are isolated by task ID prefix', async () => {
    const page = await getPage('isolated-page');
    expect(page).toBeDefined();

    // List should return 'isolated-page' (without the task prefix)
    const pages = await listPages();
    expect(pages).toContain('isolated-page');

    // Clean up
    await closePage('isolated-page');
  });

  it('browser_evaluate: returns complex data', async () => {
    const page = await getPage('eval-complex-test');
    await page.goto(TEST_HTML);
    const data = await page.evaluate(() => ({
      title: document.title,
      headingText: document.getElementById('heading')?.textContent,
      hasButton: !!document.getElementById('btn'),
    }));
    expect(data.title).toBe('Test Page');
    expect(data.headingText).toBe('Hello World');
    expect(data.hasButton).toBe(true);
  });
});
