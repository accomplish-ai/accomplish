#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dev-Browser MCP Server
 *
 * Exposes browser automation as direct MCP tools, eliminating the need
 * for agents to write scripts. Connects to the dev-browser server on port 9224.
 */

// Early startup logging - this should appear immediately if the script is executed
console.error('[dev-browser-mcp] Script starting...');
console.error('[dev-browser-mcp] Node version:', process.version);
console.error('[dev-browser-mcp] CWD:', process.cwd());
console.error('[dev-browser-mcp] ACCOMPLISH_TASK_ID:', process.env.ACCOMPLISH_TASK_ID || '(not set)');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, type Browser, type Page, type ElementHandle } from 'playwright';
import { getSnapshotManager, resetSnapshotManager } from './snapshot/index.js';

console.error('[dev-browser-mcp] All imports completed successfully');

// Port can be overridden via environment variable for isolated testing
const DEV_BROWSER_PORT = parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
const DEV_BROWSER_URL = `http://localhost:${DEV_BROWSER_PORT}`;

// Task ID for page name prefixing (supports parallel tasks)
const TASK_ID = process.env.ACCOMPLISH_TASK_ID || 'default';

/**
 * Translate Playwright errors into AI-friendly messages with actionable guidance.
 * Based on Vercel agent-browser pattern: https://github.com/vercel-labs/agent-browser/blob/main/src/actions.ts
 */
function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  // Handle strict mode violation (multiple elements match)
  if (message.includes('strict mode violation')) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';
    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
      `Run browser_snapshot() to get updated refs, or use a more specific CSS selector.`
    );
  }

  // Handle element not interactable (blocked by overlay)
  if (message.includes('intercepts pointer events') || message.includes('element is not visible')) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal, overlay, or cookie banner). ` +
      `Try: 1) Look for close/dismiss buttons in the snapshot, 2) Press Escape with browser_keyboard, ` +
      `3) Click outside the overlay. Then retry your action.`
    );
  }

  // Handle element not visible
  if (message.includes('not visible') && !message.includes('Timeout')) {
    return new Error(
      `Element "${selector}" exists but is not visible. ` +
      `Try: 1) Use browser_scroll to scroll it into view, 2) Check if it's behind an overlay, ` +
      `3) Use browser_wait(condition="selector") to wait for it to appear.`
    );
  }

  // Handle element not found / timeout waiting for element
  if (message.includes('waiting for') && (message.includes('to be visible') || message.includes('Timeout'))) {
    return new Error(
      `Element "${selector}" not found or not visible within timeout. ` +
      `The page may have changed. Run browser_snapshot() to see current page elements.`
    );
  }

  // Handle page/target closed
  if (message.includes('Target closed') || message.includes('Session closed') || message.includes('Page closed')) {
    return new Error(
      `The page or tab was closed unexpectedly. ` +
      `Use browser_tabs(action="list") to see open tabs and browser_tabs(action="switch") to switch to the correct one.`
    );
  }

  // Handle navigation errors
  if (message.includes('net::ERR_') || message.includes('Navigation failed')) {
    return new Error(
      `Navigation failed: ${message}. ` +
      `Check if the URL is correct and the site is accessible. Try browser_screenshot() to see current state.`
    );
  }

  // Default: return original error with suggestion
  return new Error(
    `${message}. ` +
    `Try taking a new browser_snapshot() to see the current page state before retrying.`
  );
}

// Browser connection state
let browser: Browser | null = null;
let connectingPromise: Promise<Browser> | null = null;
// Cached server mode (fetched once at connection time)
let cachedServerMode: string | null = null;
// Active page override for tab switching (dev-browser server doesn't track this)
let activePageOverride: Page | null = null;
// Track the page that currently has the active glow effect
let glowingPage: Page | null = null;

// Track pages with navigation listeners to avoid duplicates
const pagesWithGlowListeners = new WeakSet<Page>();

/**
 * Inject the glow CSS/DOM into the page
 */
async function injectGlowElements(page: Page): Promise<void> {
  if (page.isClosed()) return;

  try {
    await page.evaluate(() => {
    // Remove existing glow if any
    document.getElementById('__dev-browser-active-glow')?.remove();
    document.getElementById('__dev-browser-active-glow-style')?.remove();

    // Create style element for keyframes - cycles through colors with enhanced visibility
    const style = document.createElement('style');
    style.id = '__dev-browser-active-glow-style';
    style.textContent = `
      @keyframes devBrowserGlowColor {
        0%, 100% {
          border-color: rgba(59, 130, 246, 0.9);
          box-shadow:
            inset 0 0 30px rgba(59, 130, 246, 0.6),
            inset 0 0 60px rgba(59, 130, 246, 0.3),
            0 0 20px rgba(59, 130, 246, 0.4);
        }
        25% {
          border-color: rgba(168, 85, 247, 0.9);
          box-shadow:
            inset 0 0 30px rgba(168, 85, 247, 0.6),
            inset 0 0 60px rgba(168, 85, 247, 0.3),
            0 0 20px rgba(168, 85, 247, 0.4);
        }
        50% {
          border-color: rgba(236, 72, 153, 0.9);
          box-shadow:
            inset 0 0 30px rgba(236, 72, 153, 0.6),
            inset 0 0 60px rgba(236, 72, 153, 0.3),
            0 0 20px rgba(236, 72, 153, 0.4);
        }
        75% {
          border-color: rgba(34, 211, 238, 0.9);
          box-shadow:
            inset 0 0 30px rgba(34, 211, 238, 0.6),
            inset 0 0 60px rgba(34, 211, 238, 0.3),
            0 0 20px rgba(34, 211, 238, 0.4);
        }
      }
    `;
    document.head.appendChild(style);

    // Create enhanced glow overlay - thicker border, stronger effect
    const overlay = document.createElement('div');
    overlay.id = '__dev-browser-active-glow';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      border: 5px solid rgba(59, 130, 246, 0.9);
      border-radius: 4px;
      box-shadow:
        inset 0 0 30px rgba(59, 130, 246, 0.6),
        inset 0 0 60px rgba(59, 130, 246, 0.3),
        0 0 20px rgba(59, 130, 246, 0.4);
      animation: devBrowserGlowColor 6s ease-in-out infinite;
    `;
    document.body.appendChild(overlay);
  });
  } catch (err) {
    console.error('[dev-browser-mcp] Error injecting glow elements:', err);
  }
}

/**
 * Inject active tab glow effect into a page (with navigation listener)
 */
async function injectActiveTabGlow(page: Page): Promise<void> {
  // Remove glow from previous page if different
  if (glowingPage && glowingPage !== page && !glowingPage.isClosed()) {
    await removeActiveTabGlow(glowingPage);
  }

  glowingPage = page;

  // Inject glow elements now
  await injectGlowElements(page);

  // Set up listener to re-inject glow after navigation (only once per page)
  if (!pagesWithGlowListeners.has(page)) {
    pagesWithGlowListeners.add(page);

    page.on('load', async () => {
      // Re-inject glow if this page is still the active glowing page
      if (glowingPage === page && !page.isClosed()) {
        console.error('[dev-browser-mcp] Page navigated, re-injecting glow...');
        await injectGlowElements(page);
      }
    });
  }
}

/**
 * Remove active tab glow effect from a page
 */
async function removeActiveTabGlow(page: Page): Promise<void> {
  if (page.isClosed()) {
    if (glowingPage === page) {
      glowingPage = null;
    }
    return;
  }

  try {
    await page.evaluate(() => {
      document.getElementById('__dev-browser-active-glow')?.remove();
      document.getElementById('__dev-browser-active-glow-style')?.remove();
    });
  } catch {
    // Page may have been closed or navigated, ignore errors
  }

  if (glowingPage === page) {
    glowingPage = null;
  }
}

/**
 * Fetch with retry for handling concurrent connection issues
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isConnectionError = lastError.message.includes('fetch failed') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('socket') ||
        lastError.message.includes('UND_ERR');
      if (!isConnectionError || i >= maxRetries - 1) {
        throw lastError;
      }
      const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error('fetchWithRetry failed');
}

/**
 * Ensure browser is connected and server mode is cached
 */
async function ensureConnected(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      const res = await fetchWithRetry(DEV_BROWSER_URL);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${await res.text()}`);
      }
      const info = await res.json() as { wsEndpoint: string; mode?: string };
      // Cache the server mode once at connection time
      cachedServerMode = info.mode || 'normal';
      browser = await chromium.connectOverCDP(info.wsEndpoint);

      // Set up listener for new pages - auto-inject glow when tabs open
      for (const context of browser.contexts()) {
        context.on('page', async (page) => {
          console.error('[dev-browser-mcp] New page detected, injecting glow immediately...');
          // Small delay to ensure page has a body element, then inject
          setTimeout(async () => {
            try {
              if (!page.isClosed()) {
                await injectActiveTabGlow(page);
                console.error('[dev-browser-mcp] Glow injected on new page');
              }
            } catch (err) {
              console.error('[dev-browser-mcp] Failed to inject glow on new page:', err);
            }
          }, 100);
        });

        // Also inject glow on existing pages
        for (const page of context.pages()) {
          if (!page.isClosed() && !glowingPage) {
            try {
              await injectActiveTabGlow(page);
            } catch (err) {
              console.error('[dev-browser-mcp] Failed to inject glow on existing page:', err);
            }
          }
        }
      }

      return browser;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

/**
 * Get full page name with task prefix
 */
function getFullPageName(pageName?: string): string {
  const name = pageName || 'main';
  return `${TASK_ID}-${name}`;
}

/**
 * Find page by CDP targetId
 */
async function findPageByTargetId(b: Browser, targetId: string): Promise<Page | null> {
  for (const context of b.contexts()) {
    for (const page of context.pages()) {
      let cdpSession;
      try {
        cdpSession = await context.newCDPSession(page);
        const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
        if (targetInfo.targetId === targetId) {
          return page;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Target closed') && !msg.includes('Session closed')) {
          console.warn(`Unexpected error checking page target: ${msg}`);
        }
      } finally {
        if (cdpSession) {
          try {
            await cdpSession.detach();
          } catch {
            // Ignore detach errors
          }
        }
      }
    }
  }
  return null;
}

interface GetPageRequest {
  name: string;
  viewport?: { width: number; height: number };
}

interface GetPageResponse {
  targetId: string;
  url?: string;
}

/**
 * Get or create a page by name
 */
async function getPage(pageName?: string): Promise<Page> {
  // If we have an active page override from tab switching, use it
  if (activePageOverride) {
    if (!activePageOverride.isClosed()) {
      return activePageOverride;
    }
    // Page closed, clear override
    activePageOverride = null;
  }

  const fullName = getFullPageName(pageName);

  const res = await fetchWithRetry(`${DEV_BROWSER_URL}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fullName } satisfies GetPageRequest),
  });

  if (!res.ok) {
    throw new Error(`Failed to get page: ${await res.text()}`);
  }

  const pageInfo = await res.json() as GetPageResponse;
  const { targetId } = pageInfo;

  const b = await ensureConnected();

  // Use cached server mode (fetched once at connection time)
  const isExtensionMode = cachedServerMode === 'extension';

  if (isExtensionMode) {
    const allPages = b.contexts().flatMap((ctx) => ctx.pages());
    if (allPages.length === 0) {
      throw new Error('No pages available in browser');
    }
    if (allPages.length === 1) {
      return allPages[0]!;
    }
    if (pageInfo.url) {
      const matchingPage = allPages.find((p) => p.url() === pageInfo.url);
      if (matchingPage) {
        return matchingPage;
      }
    }
    return allPages[0]!;
  }

  const page = await findPageByTargetId(b, targetId);
  if (!page) {
    throw new Error(`Page "${fullName}" not found in browser contexts`);
  }

  return page;
}

/**
 * Wait for page to finish loading using Playwright's built-in function
 */
async function waitForPageLoad(page: Page, timeout = 3000): Promise<void> {
  try {
    // Use Playwright's optimized wait which monitors network activity
    await page.waitForLoadState('domcontentloaded', { timeout });
  } catch {
    // Ignore timeout errors - page may be slow but still usable
  }
}

/**
 * Cached snapshot script (module-level constant to avoid re-creating the string)
 */
const SNAPSHOT_SCRIPT = `
(function() {
  if (window.__devBrowser_getAISnapshot) return;

  // === domUtils ===
  let cacheStyle;
  let cachesCounter = 0;

  function beginDOMCaches() {
    ++cachesCounter;
    cacheStyle = cacheStyle || new Map();
  }

  function endDOMCaches() {
    if (!--cachesCounter) {
      cacheStyle = undefined;
    }
  }

  function getElementComputedStyle(element, pseudo) {
    const cache = cacheStyle;
    const cacheKey = pseudo ? undefined : element;
    if (cache && cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
    const style = element.ownerDocument && element.ownerDocument.defaultView
      ? element.ownerDocument.defaultView.getComputedStyle(element, pseudo)
      : undefined;
    if (cache && cacheKey) cache.set(cacheKey, style);
    return style;
  }

  function parentElementOrShadowHost(element) {
    if (element.parentElement) return element.parentElement;
    if (!element.parentNode) return;
    if (element.parentNode.nodeType === 11 && element.parentNode.host)
      return element.parentNode.host;
  }

  function enclosingShadowRootOrDocument(element) {
    let node = element;
    while (node.parentNode) node = node.parentNode;
    if (node.nodeType === 11 || node.nodeType === 9)
      return node;
  }

  function closestCrossShadow(element, css, scope) {
    while (element) {
      const closest = element.closest(css);
      if (scope && closest !== scope && closest?.contains(scope)) return;
      if (closest) return closest;
      element = enclosingShadowHost(element);
    }
  }

  function enclosingShadowHost(element) {
    while (element.parentElement) element = element.parentElement;
    return parentElementOrShadowHost(element);
  }

  function isElementStyleVisibilityVisible(element, style) {
    style = style || getElementComputedStyle(element);
    if (!style) return true;
    if (style.visibility !== "visible") return false;
    const detailsOrSummary = element.closest("details,summary");
    if (detailsOrSummary !== element && detailsOrSummary?.nodeName === "DETAILS" && !detailsOrSummary.open)
      return false;
    return true;
  }

  function computeBox(element) {
    const style = getElementComputedStyle(element);
    if (!style) return { visible: true, inline: false };
    const cursor = style.cursor;
    if (style.display === "contents") {
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1 && isElementVisible(child))
          return { visible: true, inline: false, cursor };
        if (child.nodeType === 3 && isVisibleTextNode(child))
          return { visible: true, inline: true, cursor };
      }
      return { visible: false, inline: false, cursor };
    }
    if (!isElementStyleVisibilityVisible(element, style))
      return { cursor, visible: false, inline: false };
    const rect = element.getBoundingClientRect();
    return { rect, cursor, visible: rect.width > 0 && rect.height > 0, inline: style.display === "inline" };
  }

  function isElementVisible(element) {
    return computeBox(element).visible;
  }

  function isVisibleTextNode(node) {
    const range = node.ownerDocument.createRange();
    range.selectNode(node);
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementSafeTagName(element) {
    const tagName = element.tagName;
    if (typeof tagName === "string") return tagName.toUpperCase();
    if (element instanceof HTMLFormElement) return "FORM";
    return element.tagName.toUpperCase();
  }

  function normalizeWhiteSpace(text) {
    return text.split("\\u00A0").map(chunk =>
      chunk.replace(/\\r\\n/g, "\\n").replace(/[\\u200b\\u00ad]/g, "").replace(/\\s\\s*/g, " ")
    ).join("\\u00A0").trim();
  }

  // === yaml ===
  function yamlEscapeKeyIfNeeded(str) {
    if (!yamlStringNeedsQuotes(str)) return str;
    return "'" + str.replace(/'/g, "''") + "'";
  }

  function yamlEscapeValueIfNeeded(str) {
    if (!yamlStringNeedsQuotes(str)) return str;
    return '"' + str.replace(/[\\\\"\x00-\\x1f\\x7f-\\x9f]/g, c => {
      switch (c) {
        case "\\\\": return "\\\\\\\\";
        case '"': return '\\\\"';
        case "\\b": return "\\\\b";
        case "\\f": return "\\\\f";
        case "\\n": return "\\\\n";
        case "\\r": return "\\\\r";
        case "\\t": return "\\\\t";
        default:
          const code = c.charCodeAt(0);
          return "\\\\x" + code.toString(16).padStart(2, "0");
      }
    }) + '"';
  }

  function yamlStringNeedsQuotes(str) {
    if (str.length === 0) return true;
    if (/^\\s|\\s$/.test(str)) return true;
    if (/[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f]/.test(str)) return true;
    if (/^-/.test(str)) return true;
    if (/[\\n:](\\s|$)/.test(str)) return true;
    if (/\\s#/.test(str)) return true;
    if (/[\\n\\r]/.test(str)) return true;
    if (/^[&*\\],?!>|@"'#%]/.test(str)) return true;
    if (/[{}\`]/.test(str)) return true;
    if (/^\\[/.test(str)) return true;
    if (!isNaN(Number(str)) || ["y","n","yes","no","true","false","on","off","null"].includes(str.toLowerCase())) return true;
    return false;
  }

  // === roleUtils ===
  const validRoles = ["alert","alertdialog","application","article","banner","blockquote","button","caption","cell","checkbox","code","columnheader","combobox","complementary","contentinfo","definition","deletion","dialog","directory","document","emphasis","feed","figure","form","generic","grid","gridcell","group","heading","img","insertion","link","list","listbox","listitem","log","main","mark","marquee","math","meter","menu","menubar","menuitem","menuitemcheckbox","menuitemradio","navigation","none","note","option","paragraph","presentation","progressbar","radio","radiogroup","region","row","rowgroup","rowheader","scrollbar","search","searchbox","separator","slider","spinbutton","status","strong","subscript","superscript","switch","tab","table","tablist","tabpanel","term","textbox","time","timer","toolbar","tooltip","tree","treegrid","treeitem"];

  let cacheAccessibleName;
  let cacheIsHidden;
  let cachePointerEvents;
  let ariaCachesCounter = 0;

  function beginAriaCaches() {
    beginDOMCaches();
    ++ariaCachesCounter;
    cacheAccessibleName = cacheAccessibleName || new Map();
    cacheIsHidden = cacheIsHidden || new Map();
    cachePointerEvents = cachePointerEvents || new Map();
  }

  function endAriaCaches() {
    if (!--ariaCachesCounter) {
      cacheAccessibleName = undefined;
      cacheIsHidden = undefined;
      cachePointerEvents = undefined;
    }
    endDOMCaches();
  }

  function hasExplicitAccessibleName(e) {
    return e.hasAttribute("aria-label") || e.hasAttribute("aria-labelledby");
  }

  const kAncestorPreventingLandmark = "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";

  const kGlobalAriaAttributes = [
    ["aria-atomic", undefined],["aria-busy", undefined],["aria-controls", undefined],["aria-current", undefined],
    ["aria-describedby", undefined],["aria-details", undefined],["aria-dropeffect", undefined],["aria-flowto", undefined],
    ["aria-grabbed", undefined],["aria-hidden", undefined],["aria-keyshortcuts", undefined],
    ["aria-label", ["caption","code","deletion","emphasis","generic","insertion","paragraph","presentation","strong","subscript","superscript"]],
    ["aria-labelledby", ["caption","code","deletion","emphasis","generic","insertion","paragraph","presentation","strong","subscript","superscript"]],
    ["aria-live", undefined],["aria-owns", undefined],["aria-relevant", undefined],["aria-roledescription", ["generic"]]
  ];

  function hasGlobalAriaAttribute(element, forRole) {
    return kGlobalAriaAttributes.some(([attr, prohibited]) => !prohibited?.includes(forRole || "") && element.hasAttribute(attr));
  }

  function hasTabIndex(element) {
    return !Number.isNaN(Number(String(element.getAttribute("tabindex"))));
  }

  function isFocusable(element) {
    return !isNativelyDisabled(element) && (isNativelyFocusable(element) || hasTabIndex(element));
  }

  function isNativelyFocusable(element) {
    const tagName = elementSafeTagName(element);
    if (["BUTTON","DETAILS","SELECT","TEXTAREA"].includes(tagName)) return true;
    if (tagName === "A" || tagName === "AREA") return element.hasAttribute("href");
    if (tagName === "INPUT") return !element.hidden;
    return false;
  }

  function isNativelyDisabled(element) {
    const isNativeFormControl = ["BUTTON","INPUT","SELECT","TEXTAREA","OPTION","OPTGROUP"].includes(elementSafeTagName(element));
    return isNativeFormControl && (element.hasAttribute("disabled") || belongsToDisabledFieldSet(element));
  }

  function belongsToDisabledFieldSet(element) {
    const fieldSetElement = element?.closest("FIELDSET[DISABLED]");
    if (!fieldSetElement) return false;
    const legendElement = fieldSetElement.querySelector(":scope > LEGEND");
    return !legendElement || !legendElement.contains(element);
  }

  const inputTypeToRole = {button:"button",checkbox:"checkbox",image:"button",number:"spinbutton",radio:"radio",range:"slider",reset:"button",submit:"button"};

  function getIdRefs(element, ref) {
    if (!ref) return [];
    const root = enclosingShadowRootOrDocument(element);
    if (!root) return [];
    try {
      const ids = ref.split(" ").filter(id => !!id);
      const result = [];
      for (const id of ids) {
        const firstElement = root.querySelector("#" + CSS.escape(id));
        if (firstElement && !result.includes(firstElement)) result.push(firstElement);
      }
      return result;
    } catch { return []; }
  }

  const kImplicitRoleByTagName = {
    A: e => e.hasAttribute("href") ? "link" : null,
    AREA: e => e.hasAttribute("href") ? "link" : null,
    ARTICLE: () => "article", ASIDE: () => "complementary", BLOCKQUOTE: () => "blockquote", BUTTON: () => "button",
    CAPTION: () => "caption", CODE: () => "code", DATALIST: () => "listbox", DD: () => "definition",
    DEL: () => "deletion", DETAILS: () => "group", DFN: () => "term", DIALOG: () => "dialog", DT: () => "term",
    EM: () => "emphasis", FIELDSET: () => "group", FIGURE: () => "figure",
    FOOTER: e => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : "contentinfo",
    FORM: e => hasExplicitAccessibleName(e) ? "form" : null,
    H1: () => "heading", H2: () => "heading", H3: () => "heading", H4: () => "heading", H5: () => "heading", H6: () => "heading",
    HEADER: e => closestCrossShadow(e, kAncestorPreventingLandmark) ? null : "banner",
    HR: () => "separator", HTML: () => "document",
    IMG: e => e.getAttribute("alt") === "" && !e.getAttribute("title") && !hasGlobalAriaAttribute(e) && !hasTabIndex(e) ? "presentation" : "img",
    INPUT: e => {
      const type = e.type.toLowerCase();
      if (type === "search") return e.hasAttribute("list") ? "combobox" : "searchbox";
      if (["email","tel","text","url",""].includes(type)) {
        const list = getIdRefs(e, e.getAttribute("list"))[0];
        return list && elementSafeTagName(list) === "DATALIST" ? "combobox" : "textbox";
      }
      if (type === "hidden") return null;
      if (type === "file") return "button";
      return inputTypeToRole[type] || "textbox";
    },
    INS: () => "insertion", LI: () => "listitem", MAIN: () => "main", MARK: () => "mark", MATH: () => "math",
    MENU: () => "list", METER: () => "meter", NAV: () => "navigation", OL: () => "list", OPTGROUP: () => "group",
    OPTION: () => "option", OUTPUT: () => "status", P: () => "paragraph", PROGRESS: () => "progressbar",
    SEARCH: () => "search", SECTION: e => hasExplicitAccessibleName(e) ? "region" : null,
    SELECT: e => e.hasAttribute("multiple") || e.size > 1 ? "listbox" : "combobox",
    STRONG: () => "strong", SUB: () => "subscript", SUP: () => "superscript", SVG: () => "img",
    TABLE: () => "table", TBODY: () => "rowgroup",
    TD: e => { const table = closestCrossShadow(e, "table"); const role = table ? getExplicitAriaRole(table) : ""; return role === "grid" || role === "treegrid" ? "gridcell" : "cell"; },
    TEXTAREA: () => "textbox", TFOOT: () => "rowgroup",
    TH: e => { const scope = e.getAttribute("scope"); if (scope === "col" || scope === "colgroup") return "columnheader"; if (scope === "row" || scope === "rowgroup") return "rowheader"; return "columnheader"; },
    THEAD: () => "rowgroup", TIME: () => "time", TR: () => "row", UL: () => "list"
  };

  function getExplicitAriaRole(element) {
    const roles = (element.getAttribute("role") || "").split(" ").map(role => role.trim());
    return roles.find(role => validRoles.includes(role)) || null;
  }

  function getImplicitAriaRole(element) {
    const fn = kImplicitRoleByTagName[elementSafeTagName(element)];
    return fn ? fn(element) : null;
  }

  function hasPresentationConflictResolution(element, role) {
    return hasGlobalAriaAttribute(element, role) || isFocusable(element);
  }

  function getAriaRole(element) {
    const explicitRole = getExplicitAriaRole(element);
    if (!explicitRole) return getImplicitAriaRole(element);
    if (explicitRole === "none" || explicitRole === "presentation") {
      const implicitRole = getImplicitAriaRole(element);
      if (hasPresentationConflictResolution(element, implicitRole)) return implicitRole;
    }
    return explicitRole;
  }

  function getAriaBoolean(attr) {
    return attr === null ? undefined : attr.toLowerCase() === "true";
  }

  function isElementIgnoredForAria(element) {
    return ["STYLE","SCRIPT","NOSCRIPT","TEMPLATE"].includes(elementSafeTagName(element));
  }

  function isElementHiddenForAria(element) {
    if (isElementIgnoredForAria(element)) return true;
    const style = getElementComputedStyle(element);
    const isSlot = element.nodeName === "SLOT";
    if (style?.display === "contents" && !isSlot) {
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1 && !isElementHiddenForAria(child)) return false;
        if (child.nodeType === 3 && isVisibleTextNode(child)) return false;
      }
      return true;
    }
    const isOptionInsideSelect = element.nodeName === "OPTION" && !!element.closest("select");
    if (!isOptionInsideSelect && !isSlot && !isElementStyleVisibilityVisible(element, style)) return true;
    return belongsToDisplayNoneOrAriaHiddenOrNonSlotted(element);
  }

  function belongsToDisplayNoneOrAriaHiddenOrNonSlotted(element) {
    let hidden = cacheIsHidden?.get(element);
    if (hidden === undefined) {
      hidden = false;
      if (element.parentElement && element.parentElement.shadowRoot && !element.assignedSlot) hidden = true;
      if (!hidden) {
        const style = getElementComputedStyle(element);
        hidden = !style || style.display === "none" || getAriaBoolean(element.getAttribute("aria-hidden")) === true;
      }
      if (!hidden) {
        const parent = parentElementOrShadowHost(element);
        if (parent) hidden = belongsToDisplayNoneOrAriaHiddenOrNonSlotted(parent);
      }
      cacheIsHidden?.set(element, hidden);
    }
    return hidden;
  }

  function getAriaLabelledByElements(element) {
    const ref = element.getAttribute("aria-labelledby");
    if (ref === null) return null;
    const refs = getIdRefs(element, ref);
    return refs.length ? refs : null;
  }

  function getElementAccessibleName(element, includeHidden) {
    let accessibleName = cacheAccessibleName?.get(element);
    if (accessibleName === undefined) {
      accessibleName = "";
      const elementProhibitsNaming = ["caption","code","definition","deletion","emphasis","generic","insertion","mark","paragraph","presentation","strong","subscript","suggestion","superscript","term","time"].includes(getAriaRole(element) || "");
      if (!elementProhibitsNaming) {
        accessibleName = normalizeWhiteSpace(getTextAlternativeInternal(element, { includeHidden, visitedElements: new Set(), embeddedInTargetElement: "self" }));
      }
      cacheAccessibleName?.set(element, accessibleName);
    }
    return accessibleName;
  }

  function getTextAlternativeInternal(element, options) {
    if (options.visitedElements.has(element)) return "";
    const childOptions = { ...options, embeddedInTargetElement: options.embeddedInTargetElement === "self" ? "descendant" : options.embeddedInTargetElement };

    if (!options.includeHidden) {
      const isEmbeddedInHiddenReferenceTraversal = !!options.embeddedInLabelledBy?.hidden || !!options.embeddedInLabel?.hidden;
      if (isElementIgnoredForAria(element) || (!isEmbeddedInHiddenReferenceTraversal && isElementHiddenForAria(element))) {
        options.visitedElements.add(element);
        return "";
      }
    }

    const labelledBy = getAriaLabelledByElements(element);
    if (!options.embeddedInLabelledBy) {
      const accessibleName = (labelledBy || []).map(ref => getTextAlternativeInternal(ref, { ...options, embeddedInLabelledBy: { element: ref, hidden: isElementHiddenForAria(ref) }, embeddedInTargetElement: undefined, embeddedInLabel: undefined })).join(" ");
      if (accessibleName) return accessibleName;
    }

    const role = getAriaRole(element) || "";
    const tagName = elementSafeTagName(element);

    const ariaLabel = element.getAttribute("aria-label") || "";
    if (ariaLabel.trim()) { options.visitedElements.add(element); return ariaLabel; }

    if (!["presentation","none"].includes(role)) {
      if (tagName === "INPUT" && ["button","submit","reset"].includes(element.type)) {
        options.visitedElements.add(element);
        const value = element.value || "";
        if (value.trim()) return value;
        if (element.type === "submit") return "Submit";
        if (element.type === "reset") return "Reset";
        return element.getAttribute("title") || "";
      }
      if (tagName === "INPUT" && element.type === "image") {
        options.visitedElements.add(element);
        const alt = element.getAttribute("alt") || "";
        if (alt.trim()) return alt;
        const title = element.getAttribute("title") || "";
        if (title.trim()) return title;
        return "Submit";
      }
      if (tagName === "IMG") {
        options.visitedElements.add(element);
        const alt = element.getAttribute("alt") || "";
        if (alt.trim()) return alt;
        return element.getAttribute("title") || "";
      }
      if (!labelledBy && ["BUTTON","INPUT","TEXTAREA","SELECT"].includes(tagName)) {
        const labels = element.labels;
        if (labels?.length) {
          options.visitedElements.add(element);
          return [...labels].map(label => getTextAlternativeInternal(label, { ...options, embeddedInLabel: { element: label, hidden: isElementHiddenForAria(label) }, embeddedInLabelledBy: undefined, embeddedInTargetElement: undefined })).filter(name => !!name).join(" ");
        }
      }
    }

    const allowsNameFromContent = ["button","cell","checkbox","columnheader","gridcell","heading","link","menuitem","menuitemcheckbox","menuitemradio","option","radio","row","rowheader","switch","tab","tooltip","treeitem"].includes(role);
    if (allowsNameFromContent || !!options.embeddedInLabelledBy || !!options.embeddedInLabel) {
      options.visitedElements.add(element);
      const accessibleName = innerAccumulatedElementText(element, childOptions);
      const maybeTrimmedAccessibleName = options.embeddedInTargetElement === "self" ? accessibleName.trim() : accessibleName;
      if (maybeTrimmedAccessibleName) return accessibleName;
    }

    if (!["presentation","none"].includes(role) || tagName === "IFRAME") {
      options.visitedElements.add(element);
      const title = element.getAttribute("title") || "";
      if (title.trim()) return title;
    }

    options.visitedElements.add(element);
    return "";
  }

  function innerAccumulatedElementText(element, options) {
    const tokens = [];
    const visit = (node, skipSlotted) => {
      if (skipSlotted && node.assignedSlot) return;
      if (node.nodeType === 1) {
        const display = getElementComputedStyle(node)?.display || "inline";
        let token = getTextAlternativeInternal(node, options);
        if (display !== "inline" || node.nodeName === "BR") token = " " + token + " ";
        tokens.push(token);
      } else if (node.nodeType === 3) {
        tokens.push(node.textContent || "");
      }
    };
    const assignedNodes = element.nodeName === "SLOT" ? element.assignedNodes() : [];
    if (assignedNodes.length) {
      for (const child of assignedNodes) visit(child, false);
    } else {
      for (let child = element.firstChild; child; child = child.nextSibling) visit(child, true);
      if (element.shadowRoot) {
        for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) visit(child, true);
      }
    }
    return tokens.join("");
  }

  const kAriaCheckedRoles = ["checkbox","menuitemcheckbox","option","radio","switch","menuitemradio","treeitem"];
  function getAriaChecked(element) {
    const tagName = elementSafeTagName(element);
    if (tagName === "INPUT" && element.indeterminate) return "mixed";
    if (tagName === "INPUT" && ["checkbox","radio"].includes(element.type)) return element.checked;
    if (kAriaCheckedRoles.includes(getAriaRole(element) || "")) {
      const checked = element.getAttribute("aria-checked");
      if (checked === "true") return true;
      if (checked === "mixed") return "mixed";
      return false;
    }
    return false;
  }

  const kAriaDisabledRoles = ["application","button","composite","gridcell","group","input","link","menuitem","scrollbar","separator","tab","checkbox","columnheader","combobox","grid","listbox","menu","menubar","menuitemcheckbox","menuitemradio","option","radio","radiogroup","row","rowheader","searchbox","select","slider","spinbutton","switch","tablist","textbox","toolbar","tree","treegrid","treeitem"];
  function getAriaDisabled(element) {
    return isNativelyDisabled(element) || hasExplicitAriaDisabled(element);
  }
  function hasExplicitAriaDisabled(element, isAncestor) {
    if (!element) return false;
    if (isAncestor || kAriaDisabledRoles.includes(getAriaRole(element) || "")) {
      const attribute = (element.getAttribute("aria-disabled") || "").toLowerCase();
      if (attribute === "true") return true;
      if (attribute === "false") return false;
      return hasExplicitAriaDisabled(parentElementOrShadowHost(element), true);
    }
    return false;
  }

  const kAriaExpandedRoles = ["application","button","checkbox","combobox","gridcell","link","listbox","menuitem","row","rowheader","tab","treeitem","columnheader","menuitemcheckbox","menuitemradio","switch"];
  function getAriaExpanded(element) {
    if (elementSafeTagName(element) === "DETAILS") return element.open;
    if (kAriaExpandedRoles.includes(getAriaRole(element) || "")) {
      const expanded = element.getAttribute("aria-expanded");
      if (expanded === null) return undefined;
      if (expanded === "true") return true;
      return false;
    }
    return undefined;
  }

  const kAriaLevelRoles = ["heading","listitem","row","treeitem"];
  function getAriaLevel(element) {
    const native = {H1:1,H2:2,H3:3,H4:4,H5:5,H6:6}[elementSafeTagName(element)];
    if (native) return native;
    if (kAriaLevelRoles.includes(getAriaRole(element) || "")) {
      const attr = element.getAttribute("aria-level");
      const value = attr === null ? Number.NaN : Number(attr);
      if (Number.isInteger(value) && value >= 1) return value;
    }
    return 0;
  }

  const kAriaPressedRoles = ["button"];
  function getAriaPressed(element) {
    if (kAriaPressedRoles.includes(getAriaRole(element) || "")) {
      const pressed = element.getAttribute("aria-pressed");
      if (pressed === "true") return true;
      if (pressed === "mixed") return "mixed";
    }
    return false;
  }

  const kAriaSelectedRoles = ["gridcell","option","row","tab","rowheader","columnheader","treeitem"];
  function getAriaSelected(element) {
    if (elementSafeTagName(element) === "OPTION") return element.selected;
    if (kAriaSelectedRoles.includes(getAriaRole(element) || "")) return getAriaBoolean(element.getAttribute("aria-selected")) === true;
    return false;
  }

  function receivesPointerEvents(element) {
    const cache = cachePointerEvents;
    let e = element;
    let result;
    const parents = [];
    for (; e; e = parentElementOrShadowHost(e)) {
      const cached = cache?.get(e);
      if (cached !== undefined) { result = cached; break; }
      parents.push(e);
      const style = getElementComputedStyle(e);
      if (!style) { result = true; break; }
      const value = style.pointerEvents;
      if (value) { result = value !== "none"; break; }
    }
    if (result === undefined) result = true;
    for (const parent of parents) cache?.set(parent, result);
    return result;
  }

  function getCSSContent(element, pseudo) {
    const style = getElementComputedStyle(element, pseudo);
    if (!style) return undefined;
    const contentValue = style.content;
    if (!contentValue || contentValue === "none" || contentValue === "normal") return undefined;
    if (style.display === "none" || style.visibility === "hidden") return undefined;
    const match = contentValue.match(/^"(.*)"$/);
    if (match) {
      const content = match[1].replace(/\\\\"/g, '"');
      if (pseudo) {
        const display = style.display || "inline";
        if (display !== "inline") return " " + content + " ";
      }
      return content;
    }
    return undefined;
  }

  // === ariaSnapshot ===
  let lastRef = 0;

  function generateAriaTree(rootElement) {
    const options = { visibility: "ariaOrVisible", refs: "interactable", refPrefix: "", includeGenericRole: true, renderActive: true, renderCursorPointer: true };
    const visited = new Set();
    const snapshot = {
      root: { role: "fragment", name: "", children: [], element: rootElement, props: {}, box: computeBox(rootElement), receivesPointerEvents: true },
      elements: new Map(),
      refs: new Map(),
      iframeRefs: []
    };

    const visit = (ariaNode, node, parentElementVisible) => {
      if (visited.has(node)) return;
      visited.add(node);
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (!parentElementVisible) return;
        const text = node.nodeValue;
        if (ariaNode.role !== "textbox" && text) ariaNode.children.push(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      const isElementVisibleForAria = !isElementHiddenForAria(element);
      let visible = isElementVisibleForAria;
      if (options.visibility === "ariaOrVisible") visible = isElementVisibleForAria || isElementVisible(element);
      if (options.visibility === "ariaAndVisible") visible = isElementVisibleForAria && isElementVisible(element);
      if (options.visibility === "aria" && !visible) return;
      const ariaChildren = [];
      if (element.hasAttribute("aria-owns")) {
        const ids = element.getAttribute("aria-owns").split(/\\s+/);
        for (const id of ids) {
          const ownedElement = rootElement.ownerDocument.getElementById(id);
          if (ownedElement) ariaChildren.push(ownedElement);
        }
      }
      const childAriaNode = visible ? toAriaNode(element, options) : null;
      if (childAriaNode) {
        if (childAriaNode.ref) {
          snapshot.elements.set(childAriaNode.ref, element);
          snapshot.refs.set(element, childAriaNode.ref);
          if (childAriaNode.role === "iframe") snapshot.iframeRefs.push(childAriaNode.ref);
        }
        ariaNode.children.push(childAriaNode);
      }
      processElement(childAriaNode || ariaNode, element, ariaChildren, visible);
    };

    function processElement(ariaNode, element, ariaChildren, parentElementVisible) {
      const display = getElementComputedStyle(element)?.display || "inline";
      const treatAsBlock = display !== "inline" || element.nodeName === "BR" ? " " : "";
      if (treatAsBlock) ariaNode.children.push(treatAsBlock);
      ariaNode.children.push(getCSSContent(element, "::before") || "");
      const assignedNodes = element.nodeName === "SLOT" ? element.assignedNodes() : [];
      if (assignedNodes.length) {
        for (const child of assignedNodes) visit(ariaNode, child, parentElementVisible);
      } else {
        for (let child = element.firstChild; child; child = child.nextSibling) {
          if (!child.assignedSlot) visit(ariaNode, child, parentElementVisible);
        }
        if (element.shadowRoot) {
          for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling) visit(ariaNode, child, parentElementVisible);
        }
      }
      for (const child of ariaChildren) visit(ariaNode, child, parentElementVisible);
      ariaNode.children.push(getCSSContent(element, "::after") || "");
      if (treatAsBlock) ariaNode.children.push(treatAsBlock);
      if (ariaNode.children.length === 1 && ariaNode.name === ariaNode.children[0]) ariaNode.children = [];
      if (ariaNode.role === "link" && element.hasAttribute("href")) ariaNode.props["url"] = element.getAttribute("href");
      if (ariaNode.role === "textbox" && element.hasAttribute("placeholder") && element.getAttribute("placeholder") !== ariaNode.name) ariaNode.props["placeholder"] = element.getAttribute("placeholder");
    }

    beginAriaCaches();
    try { visit(snapshot.root, rootElement, true); }
    finally { endAriaCaches(); }
    normalizeStringChildren(snapshot.root);
    normalizeGenericRoles(snapshot.root);
    return snapshot;
  }

  function computeAriaRef(ariaNode, options) {
    if (options.refs === "none") return;
    if (options.refs === "interactable" && (!ariaNode.box.visible || !ariaNode.receivesPointerEvents)) return;
    let ariaRef = ariaNode.element._ariaRef;
    if (!ariaRef || ariaRef.role !== ariaNode.role || ariaRef.name !== ariaNode.name) {
      ariaRef = { role: ariaNode.role, name: ariaNode.name, ref: (options.refPrefix || "") + "e" + (++lastRef) };
      ariaNode.element._ariaRef = ariaRef;
    }
    ariaNode.ref = ariaRef.ref;
  }

  function toAriaNode(element, options) {
    const active = element.ownerDocument.activeElement === element;
    if (element.nodeName === "IFRAME") {
      const ariaNode = { role: "iframe", name: "", children: [], props: {}, element, box: computeBox(element), receivesPointerEvents: true, active };
      computeAriaRef(ariaNode, options);
      return ariaNode;
    }
    const defaultRole = options.includeGenericRole ? "generic" : null;
    const role = getAriaRole(element) || defaultRole;
    if (!role || role === "presentation" || role === "none") return null;
    const name = normalizeWhiteSpace(getElementAccessibleName(element, false) || "");
    const receivesPointerEventsValue = receivesPointerEvents(element);
    const box = computeBox(element);
    if (role === "generic" && box.inline && element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) return null;
    const result = { role, name, children: [], props: {}, element, box, receivesPointerEvents: receivesPointerEventsValue, active };
    computeAriaRef(result, options);
    if (kAriaCheckedRoles.includes(role)) result.checked = getAriaChecked(element);
    if (kAriaDisabledRoles.includes(role)) result.disabled = getAriaDisabled(element);
    if (kAriaExpandedRoles.includes(role)) result.expanded = getAriaExpanded(element);
    if (kAriaLevelRoles.includes(role)) result.level = getAriaLevel(element);
    if (kAriaPressedRoles.includes(role)) result.pressed = getAriaPressed(element);
    if (kAriaSelectedRoles.includes(role)) result.selected = getAriaSelected(element);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.type !== "checkbox" && element.type !== "radio" && element.type !== "file") result.children = [element.value];
    }
    return result;
  }

  function normalizeGenericRoles(node) {
    const normalizeChildren = (node) => {
      const result = [];
      for (const child of node.children || []) {
        if (typeof child === "string") { result.push(child); continue; }
        const normalized = normalizeChildren(child);
        result.push(...normalized);
      }
      const removeSelf = node.role === "generic" && !node.name && result.length <= 1 && result.every(c => typeof c !== "string" && !!c.ref);
      if (removeSelf) return result;
      node.children = result;
      return [node];
    };
    normalizeChildren(node);
  }

  function normalizeStringChildren(rootA11yNode) {
    const flushChildren = (buffer, normalizedChildren) => {
      if (!buffer.length) return;
      const text = normalizeWhiteSpace(buffer.join(""));
      if (text) normalizedChildren.push(text);
      buffer.length = 0;
    };
    const visit = (ariaNode) => {
      const normalizedChildren = [];
      const buffer = [];
      for (const child of ariaNode.children || []) {
        if (typeof child === "string") { buffer.push(child); }
        else { flushChildren(buffer, normalizedChildren); visit(child); normalizedChildren.push(child); }
      }
      flushChildren(buffer, normalizedChildren);
      ariaNode.children = normalizedChildren.length ? normalizedChildren : [];
      if (ariaNode.children.length === 1 && ariaNode.children[0] === ariaNode.name) ariaNode.children = [];
    };
    visit(rootA11yNode);
  }

  function hasPointerCursor(ariaNode) { return ariaNode.box.cursor === "pointer"; }

  // Interactive ARIA roles that agents typically want to interact with
  const INTERACTIVE_ROLES = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'searchbox', 'slider', 'spinbutton', 'switch', 'dialog', 'alertdialog', 'menu', 'navigation', 'form'];

  // === Token optimization: Priority scoring and truncation ===
  const ROLE_PRIORITIES = {
    button: 100, textbox: 95, searchbox: 95,
    checkbox: 90, radio: 90, switch: 90,
    combobox: 85, listbox: 85, slider: 85, spinbutton: 85,
    link: 80, tab: 75,
    menuitem: 70, menuitemcheckbox: 70, menuitemradio: 70, option: 70,
    navigation: 60, menu: 60, tablist: 55,
    form: 50, dialog: 50, alertdialog: 50
  };
  const VIEWPORT_BONUS = 50;
  const DEFAULT_PRIORITY = 50;

  function isInViewport(box) {
    if (!box || !box.rect) return false;
    const rect = box.rect;
    if (rect.width === 0 || rect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return rect.x < vw && rect.y < vh && rect.x + rect.width > 0 && rect.y + rect.height > 0;
  }

  function getElementPriority(role, inViewport) {
    const base = ROLE_PRIORITIES[role] || DEFAULT_PRIORITY;
    return inViewport ? base + VIEWPORT_BONUS : base;
  }

  function collectScoredElements(root, opts) {
    const elements = [];
    const interactiveOnly = opts.interactiveOnly !== false;
    const viewportOnlyOpt = opts.viewportOnly === true;

    function visit(node) {
      const isInteractive = INTERACTIVE_ROLES.includes(node.role);
      if (interactiveOnly && !isInteractive) {
        if (node.children) node.children.forEach(c => typeof c !== 'string' && visit(c));
        return;
      }
      const inVp = isInViewport(node.box);
      if (viewportOnlyOpt && !inVp) {
        if (node.children) node.children.forEach(c => typeof c !== 'string' && visit(c));
        return;
      }
      elements.push({ node, score: getElementPriority(node.role, inVp), inViewport: inVp });
      if (node.children) node.children.forEach(c => typeof c !== 'string' && visit(c));
    }
    visit(root);
    return elements;
  }

  function truncateWithBudget(elements, maxElements, maxTokens) {
    const sorted = elements.slice().sort((a, b) => b.score - a.score);
    const included = [];
    let tokenCount = 0;
    let truncationReason = null;

    for (const el of sorted) {
      if (included.length >= maxElements) { truncationReason = 'maxElements'; break; }
      const elementTokens = 15; // Estimate per element
      if (maxTokens && tokenCount + elementTokens > maxTokens) { truncationReason = 'maxTokens'; break; }
      included.push(el);
      tokenCount += elementTokens;
    }

    return {
      elements: included,
      totalElements: elements.length,
      estimatedTokens: tokenCount,
      truncated: included.length < elements.length,
      truncationReason
    };
  }

  function renderAriaTree(ariaSnapshot, snapshotOptions) {
    snapshotOptions = snapshotOptions || {};
    const maxElements = snapshotOptions.maxElements || 300;
    const maxTokens = snapshotOptions.maxTokens || 8000;
    const options = { visibility: "ariaOrVisible", refs: "interactable", refPrefix: "", includeGenericRole: true, renderActive: true, renderCursorPointer: true };
    const lines = [];
    let nodesToRender = ariaSnapshot.root.role === "fragment" ? ariaSnapshot.root.children : [ariaSnapshot.root];

    // Collect and score all elements
    const scoredElements = collectScoredElements(ariaSnapshot.root, snapshotOptions);

    // Truncate with token budget
    const truncateResult = truncateWithBudget(scoredElements, maxElements, maxTokens);

    // Build set of refs to include
    const includedRefs = {};
    for (const el of truncateResult.elements) {
      if (el.node.ref) includedRefs[el.node.ref] = true;
    }

    // Add header with truncation info
    if (truncateResult.truncated) {
      const reason = truncateResult.truncationReason === 'maxTokens' ? 'token budget' : 'element limit';
      lines.push("# Elements: " + truncateResult.elements.length + " of " + truncateResult.totalElements + " (truncated: " + reason + ")");
      lines.push("# Tokens: ~" + truncateResult.estimatedTokens);
    }

    const isInteractiveRole = (role) => INTERACTIVE_ROLES.includes(role);

    const visitText = (text, indent) => {
      // Skip text nodes in interactive_only mode
      if (snapshotOptions.interactiveOnly) return;
      const escaped = yamlEscapeValueIfNeeded(text);
      if (escaped) lines.push(indent + "- text: " + escaped);
    };

    const createKey = (ariaNode, renderCursorPointer) => {
      let key = ariaNode.role;
      if (ariaNode.name && ariaNode.name.length <= 900) {
        const name = ariaNode.name;
        if (name) {
          const stringifiedName = name.startsWith("/") && name.endsWith("/") ? name : JSON.stringify(name);
          key += " " + stringifiedName;
        }
      }
      if (ariaNode.checked === "mixed") key += " [checked=mixed]";
      if (ariaNode.checked === true) key += " [checked]";
      if (ariaNode.disabled) key += " [disabled]";
      if (ariaNode.expanded) key += " [expanded]";
      if (ariaNode.active && options.renderActive) key += " [active]";
      if (ariaNode.level) key += " [level=" + ariaNode.level + "]";
      if (ariaNode.pressed === "mixed") key += " [pressed=mixed]";
      if (ariaNode.pressed === true) key += " [pressed]";
      if (ariaNode.selected === true) key += " [selected]";
      if (ariaNode.ref) {
        key += " [ref=" + ariaNode.ref + "]";
        if (renderCursorPointer && hasPointerCursor(ariaNode)) key += " [cursor=pointer]";
      }
      return key;
    };

    const getSingleInlinedTextChild = (ariaNode) => {
      return ariaNode?.children.length === 1 && typeof ariaNode.children[0] === "string" && !Object.keys(ariaNode.props).length ? ariaNode.children[0] : undefined;
    };

    const visit = (ariaNode, indent, renderCursorPointer) => {
      const isInteractive = isInteractiveRole(ariaNode.role);
      // In interactive_only mode, skip non-interactive elements but still recurse into children
      if (snapshotOptions.interactiveOnly && !isInteractive) {
        // Still visit children to find nested interactive elements
        const childIndent = indent;
        for (const child of ariaNode.children) {
          if (typeof child === "string") continue; // Skip text in interactive_only mode
          else visit(child, childIndent, renderCursorPointer);
        }
        return;
      }

      // Skip elements not in included refs (truncation), but still visit children
      if (ariaNode.ref && !includedRefs[ariaNode.ref]) {
        for (const child of ariaNode.children) {
          if (typeof child === "string") continue;
          else visit(child, indent, renderCursorPointer);
        }
        return;
      }

      const escapedKey = indent + "- " + yamlEscapeKeyIfNeeded(createKey(ariaNode, renderCursorPointer));
      const singleInlinedTextChild = getSingleInlinedTextChild(ariaNode);
      if (!ariaNode.children.length && !Object.keys(ariaNode.props).length) {
        lines.push(escapedKey);
      } else if (singleInlinedTextChild !== undefined) {
        lines.push(escapedKey + ": " + yamlEscapeValueIfNeeded(singleInlinedTextChild));
      } else {
        lines.push(escapedKey + ":");
        for (const [name, value] of Object.entries(ariaNode.props)) lines.push(indent + "  - /" + name + ": " + yamlEscapeValueIfNeeded(value));
        const childIndent = indent + "  ";
        const inCursorPointer = !!ariaNode.ref && renderCursorPointer && hasPointerCursor(ariaNode);
        for (const child of ariaNode.children) {
          if (typeof child === "string") visitText(child, childIndent);
          else visit(child, childIndent, renderCursorPointer && !inCursorPointer);
        }
      }
    };

    for (const nodeToRender of nodesToRender) {
      if (typeof nodeToRender === "string") visitText(nodeToRender, "");
      else visit(nodeToRender, "", !!options.renderCursorPointer);
    }
    return lines.join("\\n");
  }

  function getAISnapshot(options) {
    options = options || {};
    const snapshot = generateAriaTree(document.body);
    const refsObject = {};
    for (const [ref, element] of snapshot.elements) refsObject[ref] = element;
    window.__devBrowserRefs = refsObject;
    return renderAriaTree(snapshot, options);
  }

  function selectSnapshotRef(ref) {
    const refs = window.__devBrowserRefs;
    if (!refs) throw new Error("No snapshot refs found. Call getAISnapshot first.");
    const element = refs[ref];
    if (!element) throw new Error('Ref "' + ref + '" not found. Available refs: ' + Object.keys(refs).join(", "));
    return element;
  }

  // Expose main functions
  window.__devBrowser_getAISnapshot = getAISnapshot;
  window.__devBrowser_selectSnapshotRef = selectSnapshotRef;
})();
`;

interface SnapshotOptions {
  interactiveOnly?: boolean;
  maxElements?: number;
  viewportOnly?: boolean;
  maxTokens?: number;
  fullSnapshot?: boolean;
}

/**
 * Default snapshot options for token optimization.
 * Used by browser_script and other internal snapshot calls.
 */
const DEFAULT_SNAPSHOT_OPTIONS: SnapshotOptions = {
  interactiveOnly: true,
  maxElements: 300,
  maxTokens: 8000,
};

/**
 * Get a snapshot with session history header and diff support.
 * Used by browser_script to include Tier 3 context management.
 * Behaves like browser_snapshot - returns diff when on same page with few changes.
 */
async function getSnapshotWithHistory(page: Page, options: SnapshotOptions = {}): Promise<string> {
  const rawSnapshot = await getAISnapshot(page, options);
  const url = page.url();
  const title = await page.title();

  // Process through snapshot manager for diffing (same as browser_snapshot)
  const manager = getSnapshotManager();
  const result = manager.processSnapshot(rawSnapshot, url, title, {
    fullSnapshot: options.fullSnapshot ?? false,
    interactiveOnly: options.interactiveOnly ?? true,
  });

  // Build output with session history
  let output = '';
  const sessionSummary = manager.getSessionSummary();
  if (sessionSummary.history) {
    output += `# ${sessionSummary.history}\n\n`;
  }

  // Use diff result when available, otherwise full snapshot
  if (result.type === 'diff') {
    output += `# Changes Since Last Snapshot\n${result.content}`;
  } else {
    output += result.content;
  }

  return output;
}

/**
 * Get ARIA snapshot for a page
 * Optimized: checks if script is already injected before sending
 */
async function getAISnapshot(page: Page, options: SnapshotOptions = {}): Promise<string> {
  // Check if script is already injected to avoid sending large script on every call
  const isInjected = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(globalThis as any).__devBrowser_getAISnapshot;
  });

  if (!isInjected) {
    // Inject the script only once per page
    await page.evaluate((script: string) => {
      // eslint-disable-next-line no-eval
      eval(script);
    }, SNAPSHOT_SCRIPT);
  }

  // Now call the snapshot function with options
  const snapshot = await page.evaluate((opts) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).__devBrowser_getAISnapshot(opts);
  }, {
    interactiveOnly: options.interactiveOnly || false,
    maxElements: options.maxElements,
    viewportOnly: options.viewportOnly || false,
    maxTokens: options.maxTokens,
  });
  return snapshot;
}

/**
 * Get element by ref from the last snapshot
 */
async function selectSnapshotRef(page: Page, ref: string): Promise<ElementHandle | null> {
  const elementHandle = await page.evaluateHandle((refId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = globalThis as any;
    const refs = w.__devBrowserRefs;
    if (!refs) {
      throw new Error('No snapshot refs found. Call browser_snapshot first.');
    }
    const element = refs[refId];
    if (!element) {
      throw new Error(
        `Ref "${refId}" not found. Available refs: ${Object.keys(refs).join(', ')}`
      );
    }
    return element;
  }, ref);

  const element = elementHandle.asElement();
  if (!element) {
    await elementHandle.dispose();
    return null;
  }

  return element;
}

// Tool input types
interface BrowserNavigateInput {
  url: string;
  page_name?: string;
}

interface BrowserSnapshotInput {
  page_name?: string;
  interactive_only?: boolean;
  full_snapshot?: boolean;
  max_elements?: number;
  viewport_only?: boolean;
  include_history?: boolean;
  max_tokens?: number;
}

interface BrowserClickInput {
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  position?: 'center' | 'center-lower';
  button?: 'left' | 'right' | 'middle';
  click_count?: number;
  page_name?: string;
}

interface BrowserTypeInput {
  ref?: string;
  selector?: string;
  text: string;
  press_enter?: boolean;
  page_name?: string;
}

interface BrowserScreenshotInput {
  page_name?: string;
  full_page?: boolean;
}

interface BrowserEvaluateInput {
  script: string;
  page_name?: string;
}

interface BrowserPagesInput {
  action: 'list' | 'close';
  page_name?: string;
}

interface BrowserKeyboardInput {
  text?: string;
  key?: string;
  typing_delay?: number;
  page_name?: string;
}

interface SequenceAction {
  action: 'click' | 'type' | 'snapshot' | 'screenshot' | 'wait';
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  press_enter?: boolean;
  full_page?: boolean;
  timeout?: number;
}

interface BrowserSequenceInput {
  actions: SequenceAction[];
  page_name?: string;
}

/**
 * Script action for browser_script tool.
 * These actions find elements at runtime, enabling single-roundtrip workflows.
 */
interface ScriptAction {
  action:
    | 'goto'           // Navigate to URL
    | 'waitForLoad'    // Wait for page load
    | 'waitForSelector' // Wait for element to appear
    | 'waitForNavigation' // Wait for navigation to complete
    | 'findAndFill'    // Find element by selector, fill if exists
    | 'findAndClick'   // Find element by selector, click if exists
    | 'fillByRef'      // Fill using ref from previous snapshot
    | 'clickByRef'     // Click using ref from previous snapshot
    | 'snapshot'       // Get ARIA snapshot
    | 'screenshot'     // Take screenshot
    | 'keyboard'       // Press key or type text
    | 'evaluate';      // Run JavaScript
  // Parameters for different actions
  url?: string;           // For goto
  selector?: string;      // For waitForSelector, findAndFill, findAndClick
  ref?: string;           // For fillByRef, clickByRef
  text?: string;          // For findAndFill, fillByRef, keyboard (type mode)
  key?: string;           // For keyboard (press mode)
  pressEnter?: boolean;   // For findAndFill, fillByRef
  timeout?: number;       // For waitForSelector, waitForNavigation
  fullPage?: boolean;     // For screenshot
  code?: string;          // For evaluate
  skipIfNotFound?: boolean; // For findAndFill, findAndClick - don't fail if element missing
}

interface BrowserScriptInput {
  actions: ScriptAction[];
  page_name?: string;
}

interface BrowserKeyboardInput {
  action: 'press' | 'type' | 'down' | 'up';
  key?: string;
  text?: string;
  typing_delay?: number;
  page_name?: string;
}

interface BrowserScrollInput {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  ref?: string;
  selector?: string;
  position?: 'top' | 'bottom';
  page_name?: string;
}

interface BrowserHoverInput {
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  page_name?: string;
}

interface BrowserSelectInput {
  ref?: string;
  selector?: string;
  value?: string;
  label?: string;
  index?: number;
  page_name?: string;
}

interface BrowserWaitInput {
  condition: 'selector' | 'hidden' | 'navigation' | 'network_idle' | 'timeout' | 'function';
  selector?: string;
  script?: string;
  timeout?: number;
  page_name?: string;
}

interface BrowserFileUploadInput {
  ref?: string;
  selector?: string;
  files: string[];
  page_name?: string;
}

interface BrowserDragInput {
  source_ref?: string;
  source_selector?: string;
  source_x?: number;
  source_y?: number;
  target_ref?: string;
  target_selector?: string;
  target_x?: number;
  target_y?: number;
  page_name?: string;
}

interface BrowserGetTextInput {
  ref?: string;
  selector?: string;
  page_name?: string;
}

interface BrowserIsVisibleInput {
  ref?: string;
  selector?: string;
  page_name?: string;
}

interface BrowserIsEnabledInput {
  ref?: string;
  selector?: string;
  page_name?: string;
}

interface BrowserIsCheckedInput {
  ref?: string;
  selector?: string;
  page_name?: string;
}

interface BrowserIframeInput {
  action: 'enter' | 'exit';
  ref?: string;
  selector?: string;
  page_name?: string;
}

interface BrowserTabsInput {
  action: 'list' | 'switch' | 'close' | 'wait_for_new';
  index?: number;
  timeout?: number;
  page_name?: string;
}

interface BrowserCanvasTypeInput {
  text: string;
  position?: 'start' | 'current';
  page_name?: string;
}

interface BrowserHighlightInput {
  enabled: boolean;
  page_name?: string;
}

// Create MCP server
const server = new Server(
  { name: 'dev-browser-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL. TIP: For multi-step workflows (navigate + fill + click), use browser_script instead - it\'s 5-10x faster.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to navigate to (e.g., "https://google.com" or "google.com")',
          },
          page_name: {
            type: 'string',
            description: 'Optional name for the page (default: "main"). Use different names to manage multiple pages.',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_snapshot',
      description: 'Get ARIA accessibility tree with element refs like [ref=e5]. NOTE: browser_script auto-returns a snapshot, so you rarely need this separately.',
      inputSchema: {
        type: 'object',
        properties: {
          page_name: {
            type: 'string',
            description: 'Optional name of the page to snapshot (default: "main")',
          },
          interactive_only: {
            type: 'boolean',
            description: 'If true, only show interactive elements (buttons, links, inputs, etc.). Default: true.',
          },
          full_snapshot: {
            type: 'boolean',
            description: 'Force a complete snapshot instead of a diff. Use after major page changes (modal opened, dynamic content loaded) or when element refs seem incorrect. Default: false.',
          },
          max_elements: {
            type: 'number',
            description: 'Maximum elements to include (1-1000). Default: 300',
          },
          viewport_only: {
            type: 'boolean',
            description: 'Only include elements visible in viewport. Default: false',
          },
          include_history: {
            type: 'boolean',
            description: 'Include navigation history in output. Default: true',
          },
          max_tokens: {
            type: 'number',
            description: 'Maximum estimated tokens (1000-50000). Default: 8000',
          },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click on the page. TIP: For multi-step workflows, use browser_script with findAndClick instead - it\'s faster.',
      inputSchema: {
        type: 'object',
        properties: {
          position: {
            type: 'string',
            enum: ['center', 'center-lower'],
            description: '"center" clicks viewport center. "center-lower" clicks 2/3 down (preferred for Google Docs).',
          },
          x: {
            type: 'number',
            description: 'X coordinate in pixels from left.',
          },
          y: {
            type: 'number',
            description: 'Y coordinate in pixels from top.',
          },
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot (e.g., "e5").',
          },
          selector: {
            type: 'string',
            description: 'CSS selector (e.g., "button.submit").',
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            description: 'Mouse button to click (default: "left"). Use "right" for context menus.',
          },
          click_count: {
            type: 'number',
            description: 'Number of clicks (default: 1). Use 2 for double-click, 3 for triple-click.',
          },
          page_name: {
            type: 'string',
            description: 'Optional name of the page (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into an input. TIP: For form filling, use browser_script with findAndFill instead - it\'s faster and finds elements at runtime.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot (e.g., "e5"). Preferred over selector.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector to find the input (e.g., "input[name=search]"). Use ref when available.',
          },
          text: {
            type: 'string',
            description: 'The text to type into the field',
          },
          press_enter: {
            type: 'boolean',
            description: 'Whether to press Enter after typing (default: false)',
          },
          page_name: {
            type: 'string',
            description: 'Optional name of the page (default: "main")',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot. AVOID using this - browser_script auto-returns a snapshot which is faster and more useful. Only use screenshots to show the user what the page looks like.',
      inputSchema: {
        type: 'object',
        properties: {
          page_name: {
            type: 'string',
            description: 'Optional name of the page to screenshot (default: "main")',
          },
          full_page: {
            type: 'boolean',
            description: 'Whether to capture the full scrollable page (default: false, captures viewport only)',
          },
        },
      },
    },
    {
      name: 'browser_evaluate',
      description: 'Execute custom JavaScript in the page context. Use for advanced operations not covered by other tools.',
      inputSchema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'JavaScript code to execute in the page. Must be plain JS (no TypeScript). Use return to get a value back.',
          },
          page_name: {
            type: 'string',
            description: 'Optional name of the page (default: "main")',
          },
        },
        required: ['script'],
      },
    },
    {
      name: 'browser_pages',
      description: 'List all open pages or close a specific page.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'close'],
            description: '"list" to get all page names, "close" to close a specific page',
          },
          page_name: {
            type: 'string',
            description: 'Required when action is "close" - the name of the page to close',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'browser_keyboard',
      description: 'Type text or press keys on the currently focused element. Use this for complex editors like Google Docs that don\'t have simple input elements. First click to focus, then use this to type.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to type. Each character is typed with proper key events.',
          },
          key: {
            type: 'string',
            description: 'Special key to press (e.g., "Enter", "Tab", "Escape", "Backspace", "ArrowDown"). Can be combined with modifiers like "Control+a", "Shift+Enter".',
          },
          typing_delay: {
            type: 'number',
            description: 'Delay in ms between keystrokes when typing text (default: 20). Set to 0 for instant typing.',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_sequence',
      description: 'Execute actions in sequence. NOTE: browser_script is better - it finds elements at runtime and auto-returns snapshot. Use browser_sequence only if you already have refs.',
      inputSchema: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            description: 'Array of actions to execute in order',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['click', 'type', 'snapshot', 'screenshot', 'wait'],
                  description: 'The action to perform',
                },
                ref: { type: 'string', description: 'Element ref for click/type' },
                selector: { type: 'string', description: 'CSS selector for click/type' },
                x: { type: 'number', description: 'X coordinate for click' },
                y: { type: 'number', description: 'Y coordinate for click' },
                text: { type: 'string', description: 'Text to type' },
                press_enter: { type: 'boolean', description: 'Press Enter after typing' },
                full_page: { type: 'boolean', description: 'Full page screenshot' },
                timeout: { type: 'number', description: 'Wait timeout in ms (default: 1000)' },
              },
              required: ['action'],
            },
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['actions'],
      },
    },
    {
      name: 'browser_keyboard',
      description: 'Send keyboard input. Use for shortcuts (Cmd+V, Ctrl+C), special keys (Enter, Tab, Escape), or typing into canvas apps like Google Docs where browser_type does not work.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['press', 'type', 'down', 'up'],
            description: '"press" for key combo (Enter, Meta+v), "type" for raw text character by character, "down"/"up" for hold/release',
          },
          key: {
            type: 'string',
            description: 'Key to press: "Enter", "Tab", "Escape", "Meta+v", "Control+c", "Shift+ArrowDown"',
          },
          text: {
            type: 'string',
            description: 'Text to type character by character (for action="type")',
          },
          typing_delay: {
            type: 'number',
            description: 'Delay in ms between keystrokes when typing text (default: 20). Set to 0 for instant typing.',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'browser_scroll',
      description: 'Scroll the page or scroll an element into view.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Scroll direction',
          },
          amount: {
            type: 'number',
            description: 'Pixels to scroll (default: 500)',
          },
          ref: {
            type: 'string',
            description: 'Element ref to scroll into view (from browser_snapshot)',
          },
          selector: {
            type: 'string',
            description: 'CSS selector to scroll into view',
          },
          position: {
            type: 'string',
            enum: ['top', 'bottom'],
            description: 'Scroll to page top or bottom',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_hover',
      description: 'Hover over an element to trigger hover states, dropdowns, or tooltips.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector',
          },
          x: {
            type: 'number',
            description: 'X coordinate to hover at',
          },
          y: {
            type: 'number',
            description: 'Y coordinate to hover at',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_select',
      description: 'Select an option from a <select> dropdown. Native select elements require this tool - browser_click will not work.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for the select element',
          },
          value: {
            type: 'string',
            description: 'Option value attribute to select',
          },
          label: {
            type: 'string',
            description: 'Option visible text to select',
          },
          index: {
            type: 'number',
            description: 'Option index to select (0-based)',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_wait',
      description: 'Wait for a condition. TIP: browser_script has built-in waitForLoad, waitForSelector, waitForNavigation - prefer using those.',
      inputSchema: {
        type: 'object',
        properties: {
          condition: {
            type: 'string',
            enum: ['selector', 'hidden', 'navigation', 'network_idle', 'timeout', 'function'],
            description: '"selector" waits for element to appear, "hidden" waits for element to disappear, "navigation" waits for page navigation, "network_idle" waits for network to settle, "timeout" waits fixed time, "function" waits for custom JS condition to return true',
          },
          selector: {
            type: 'string',
            description: 'CSS selector (required for "selector" and "hidden" conditions)',
          },
          script: {
            type: 'string',
            description: 'JavaScript expression that returns true when condition is met (required for "function" condition). Example: "document.querySelector(\'.loaded\') !== null"',
          },
          timeout: {
            type: 'number',
            description: 'Max wait time in ms (default: 30000). For "timeout" condition, this is the wait duration.',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['condition'],
      },
    },
    {
      name: 'browser_file_upload',
      description: 'Upload files to a file input element.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for input[type=file]',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of absolute file paths to upload',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['files'],
      },
    },
    {
      name: 'browser_drag',
      description: 'Drag and drop from source to target location.',
      inputSchema: {
        type: 'object',
        properties: {
          source_ref: {
            type: 'string',
            description: 'Source element ref from browser_snapshot',
          },
          source_selector: {
            type: 'string',
            description: 'Source CSS selector',
          },
          source_x: {
            type: 'number',
            description: 'Source X coordinate',
          },
          source_y: {
            type: 'number',
            description: 'Source Y coordinate',
          },
          target_ref: {
            type: 'string',
            description: 'Target element ref from browser_snapshot',
          },
          target_selector: {
            type: 'string',
            description: 'Target CSS selector',
          },
          target_x: {
            type: 'number',
            description: 'Target X coordinate',
          },
          target_y: {
            type: 'number',
            description: 'Target Y coordinate',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_get_text',
      description: 'Get text content or input value from an element. Faster than browser_snapshot when you just need one element\'s text.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_is_visible',
      description: 'Check if an element is visible on the page. Returns true/false. Use this to verify actions succeeded before proceeding.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_is_enabled',
      description: 'Check if an element is enabled (not disabled). Returns true/false. Use to verify buttons/inputs are interactive.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_is_checked',
      description: 'Check if a checkbox or radio button is checked. Returns true/false. Use to verify form state.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_iframe',
      description: 'Enter or exit an iframe to interact with its content.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['enter', 'exit'],
            description: '"enter" to switch into an iframe, "exit" to return to main page',
          },
          ref: {
            type: 'string',
            description: 'Iframe element ref (for action="enter")',
          },
          selector: {
            type: 'string',
            description: 'Iframe CSS selector (for action="enter")',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'browser_tabs',
      description: 'Manage browser tabs/popups. Handle new windows that open from clicks.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'switch', 'close', 'wait_for_new'],
            description: '"list" shows all tabs, "switch" to tab by index, "close" closes tab by index, "wait_for_new" waits for a popup',
          },
          index: {
            type: 'number',
            description: 'Tab index (0-based) for switch/close actions',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in ms for wait_for_new (default: 5000)',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['action'],
      },
    },
    {
      name: 'browser_canvas_type',
      description: 'Type text into canvas apps like Google Docs, Sheets, Figma. Clicks in the document, optionally jumps to start, then types.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to type',
          },
          position: {
            type: 'string',
            enum: ['start', 'current'],
            description: '"start" jumps to document beginning first (Cmd/Ctrl+Home), "current" types at current cursor position (default: "start")',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'browser_script',
      description: `⚡ PREFERRED: Execute complete browser workflows in ONE call. 5-10x faster than individual tools.

ALWAYS use this for multi-step tasks. Actions find elements at RUNTIME using CSS selectors.
Final page snapshot is AUTO-RETURNED - no need to add snapshot action.

Example - complete login:
{"actions": [
  {"action": "goto", "url": "example.com/login"},
  {"action": "waitForLoad"},
  {"action": "findAndFill", "selector": "input[type='email']", "text": "user@example.com"},
  {"action": "findAndFill", "selector": "input[type='password']", "text": "secret"},
  {"action": "findAndClick", "selector": "button[type='submit']"},
  {"action": "waitForNavigation"}
]}

Actions: goto, waitForLoad, waitForSelector, waitForNavigation, findAndFill, findAndClick, fillByRef, clickByRef, snapshot, screenshot, keyboard, evaluate
}`,
      inputSchema: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            description: 'Array of actions to execute in order',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'goto',
                    'waitForLoad',
                    'waitForSelector',
                    'waitForNavigation',
                    'findAndFill',
                    'findAndClick',
                    'fillByRef',
                    'clickByRef',
                    'snapshot',
                    'screenshot',
                    'keyboard',
                    'evaluate',
                  ],
                  description: 'The action to perform',
                },
                url: { type: 'string', description: 'URL for goto action' },
                selector: {
                  type: 'string',
                  description: 'CSS selector for waitForSelector, findAndFill, findAndClick',
                },
                ref: { type: 'string', description: 'Element ref for fillByRef, clickByRef' },
                text: { type: 'string', description: 'Text to type for fill actions or keyboard type' },
                key: { type: 'string', description: 'Key to press for keyboard action (e.g., "Enter", "Tab")' },
                pressEnter: { type: 'boolean', description: 'Press Enter after filling' },
                timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' },
                fullPage: { type: 'boolean', description: 'Full page screenshot' },
                code: { type: 'string', description: 'JavaScript code for evaluate action' },
                skipIfNotFound: {
                  type: 'boolean',
                  description: 'Skip action if element not found (default: false - will fail)',
                },
              },
              required: ['action'],
            },
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['actions'],
      },
    },
    {
      name: 'browser_highlight',
      description: 'Toggle the visual highlight glow on the current tab. Use to indicate when automation is active on a tab, and turn off when done.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'true to show the highlight glow, false to hide it',
          },
          page_name: {
            type: 'string',
            description: 'Optional page name (default: "main")',
          },
        },
        required: ['enabled'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Tool called: ${name}`, JSON.stringify(args, null, 2));

  try {
    switch (name) {
      case 'browser_navigate': {
        const { url, page_name } = args as BrowserNavigateInput;

        // Add protocol if missing
        let fullUrl = url;
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
          fullUrl = 'https://' + fullUrl;
        }

        // Reset snapshot state - we're navigating to a new page
        resetSnapshotManager();

        const page = await getPage(page_name);
        await page.goto(fullUrl);
        await waitForPageLoad(page);
        await injectActiveTabGlow(page);  // Add visual indicator for active tab

        const title = await page.title();
        const currentUrl = page.url();
        const viewport = page.viewportSize();

        const result = {
          content: [{
            type: 'text' as const,
            text: `Navigation successful.
URL: ${currentUrl}
Title: ${title}
Viewport: ${viewport?.width || 1280}x${viewport?.height || 720}

The page has loaded. Use browser_snapshot() to see the page elements and find interactive refs, or browser_screenshot() to see what the page looks like visually.`,
          }],
          isError: false,
        };
        console.error(`[MCP] browser_navigate result:`, JSON.stringify(result, null, 2));
        return result;
      }

      case 'browser_snapshot': {
        const { page_name, interactive_only, full_snapshot, max_elements, viewport_only, include_history, max_tokens } = args as BrowserSnapshotInput;
        const page = await getPage(page_name);

        // Parse and validate max_elements (1-1000, default 300)
        // If full_snapshot is true, use Infinity to bypass element limits
        const validatedMaxElements = full_snapshot
          ? Infinity
          : Math.min(Math.max(max_elements ?? 300, 1), 1000);

        // Parse and validate max_tokens (1000-50000, default 8000)
        // If full_snapshot is true, use Infinity to bypass token limits
        const validatedMaxTokens = full_snapshot
          ? Infinity
          : Math.min(Math.max(max_tokens ?? 8000, 1000), 50000);

        const snapshotOptions: SnapshotOptions = {
          interactiveOnly: interactive_only ?? true,
          maxElements: validatedMaxElements,
          viewportOnly: viewport_only ?? false,
          maxTokens: validatedMaxTokens,
        };

        const rawSnapshot = await getAISnapshot(page, snapshotOptions);
        const viewport = page.viewportSize();
        const url = page.url();
        const title = await page.title();

        // Detect canvas-based apps that need special handling
        const canvasApps = [
          { pattern: /docs\.google\.com/, name: 'Google Docs' },
          { pattern: /sheets\.google\.com/, name: 'Google Sheets' },
          { pattern: /slides\.google\.com/, name: 'Google Slides' },
          { pattern: /figma\.com/, name: 'Figma' },
          { pattern: /canva\.com/, name: 'Canva' },
          { pattern: /miro\.com/, name: 'Miro' },
        ];
        const detectedApp = canvasApps.find(app => app.pattern.test(url));

        // Process through snapshot manager for diffing
        const manager = getSnapshotManager();
        const result = manager.processSnapshot(rawSnapshot, url, title, {
          fullSnapshot: full_snapshot,
          interactiveOnly: interactive_only ?? true,
        });

        // Build output with optional session history
        let output = '';

        // Include session history if requested (default: true)
        const includeHistory = include_history !== false;
        if (includeHistory) {
          const sessionSummary = manager.getSessionSummary();
          if (sessionSummary.history) {
            output += `# ${sessionSummary.history}\n\n`;
          }
        }

        output += `# Page Info\n`;
        output += `URL: ${url}\n`;
        output += `Viewport: ${viewport?.width || 1280}x${viewport?.height || 720} (center: ${Math.round((viewport?.width || 1280) / 2)}, ${Math.round((viewport?.height || 720) / 2)})\n`;

        if (result.type === 'diff') {
          output += `Mode: Diff (showing changes since last snapshot)\n`;
        } else if (interactive_only ?? true) {
          output += `Mode: Interactive elements only (buttons, links, inputs)\n`;
        }

        if (detectedApp) {
          output += `\n⚠️ CANVAS APP DETECTED: ${detectedApp.name}\n`;
          output += `This app uses canvas rendering. Element refs may not work for the main content area.\n`;
          output += `Use: browser_click(position="center-lower") then browser_keyboard(action="type", text="...")\n`;
          output += `(center-lower avoids UI overlays like Google Docs AI suggestions)\n`;
        }

        if (result.type === 'diff') {
          output += `\n# Changes Since Last Snapshot\n${result.content}`;
        } else {
          output += `\n# Accessibility Tree\n${result.content}`;
        }

        return {
          content: [{
            type: 'text',
            text: output,
          }],
        };
      }

      case 'browser_click': {
        const { ref, selector, x, y, position, button, click_count, page_name } = args as BrowserClickInput;
        const page = await getPage(page_name);

        // Build click options
        const clickOptions: { button?: 'left' | 'right' | 'middle'; clickCount?: number } = {};
        if (button) clickOptions.button = button;
        if (click_count) clickOptions.clickCount = click_count;

        // Build description suffix for button/click_count
        const descParts: string[] = [];
        if (click_count === 2) descParts.push('double-click');
        else if (click_count === 3) descParts.push('triple-click');
        else if (click_count && click_count > 1) descParts.push(`${click_count}x click`);
        if (button === 'right') descParts.push('right-click');
        else if (button === 'middle') descParts.push('middle-click');
        const clickDesc = descParts.length > 0 ? ` (${descParts.join(', ')})` : '';

        try {
          // Position-based click (e.g., center for canvas apps)
          if (position === 'center' || position === 'center-lower') {
            const viewport = page.viewportSize();
            const clickX = (viewport?.width || 1280) / 2;
            const clickY = position === 'center-lower'
              ? (viewport?.height || 720) * 2 / 3
              : (viewport?.height || 720) / 2;
            await page.mouse.click(clickX, clickY, clickOptions);
            await waitForPageLoad(page);
            const positionName = position === 'center-lower' ? 'center-lower (2/3 down)' : 'center';
            return { content: [{ type: 'text' as const, text: `Clicked viewport ${positionName} (${Math.round(clickX)}, ${Math.round(clickY)})${clickDesc}` }] };
          }

          // Explicit x/y coordinates
          if (x !== undefined && y !== undefined) {
            await page.mouse.click(x, y, clickOptions);
            await waitForPageLoad(page);
            return { content: [{ type: 'text' as const, text: `Clicked at coordinates (${x}, ${y})${clickDesc}` }] };
          } else if (ref) {
            const element = await selectSnapshotRef(page, ref);
            if (!element) {
              return {
                content: [{ type: 'text', text: `Element [ref=${ref}] not found. Run browser_snapshot() to get updated refs - the page may have changed.` }],
                isError: true,
              };
            }
            await element.click(clickOptions);
            await waitForPageLoad(page);
            return { content: [{ type: 'text' as const, text: `Clicked element [ref=${ref}]${clickDesc}` }] };
          } else if (selector) {
            await page.click(selector, clickOptions);
            await waitForPageLoad(page);
            return { content: [{ type: 'text' as const, text: `Clicked element matching "${selector}"${clickDesc}` }] };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Provide x/y coordinates, ref, selector, or position' }],
              isError: true,
            };
          }
        } catch (err) {
          const targetDesc = ref ? `[ref=${ref}]` : selector ? `"${selector}"` : `(${x}, ${y})`;
          const friendlyError = toAIFriendlyError(err, targetDesc);
          return {
            content: [{ type: 'text', text: friendlyError.message }],
            isError: true,
          };
        }
      }

      case 'browser_type': {
        const { ref, selector, text, press_enter, page_name } = args as BrowserTypeInput;
        const page = await getPage(page_name);

        try {
          let element: ElementHandle | null = null;

          if (ref) {
            element = await selectSnapshotRef(page, ref);
            if (!element) {
              return {
                content: [{ type: 'text', text: `Element [ref=${ref}] not found. Run browser_snapshot() to get updated refs - the page may have changed.` }],
                isError: true,
              };
            }
          } else if (selector) {
            element = await page.$(selector);
            if (!element) {
              return {
                content: [{ type: 'text', text: `Element "${selector}" not found. Run browser_snapshot() to see current page elements.` }],
                isError: true,
              };
            }
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Either ref or selector is required' }],
              isError: true,
            };
          }

          // Clear existing text and type new text
          await element.click();
          await element.fill(text);

          if (press_enter) {
            await element.press('Enter');
            await waitForPageLoad(page);
          }

          const target = ref ? `[ref=${ref}]` : `"${selector}"`;
          const enterNote = press_enter ? ' and pressed Enter' : '';
          return {
            content: [{ type: 'text', text: `Typed "${text}" into ${target}${enterNote}` }],
          };
        } catch (err) {
          const targetDesc = ref ? `[ref=${ref}]` : selector || 'element';
          const friendlyError = toAIFriendlyError(err, targetDesc);
          return {
            content: [{ type: 'text', text: friendlyError.message }],
            isError: true,
          };
        }
      }

      case 'browser_screenshot': {
        const { page_name, full_page } = args as BrowserScreenshotInput;
        const page = await getPage(page_name);

        // Use JPEG with 80% quality to keep screenshots under 5MB API limit
        // PNG screenshots of image-heavy pages can exceed 6MB after base64 encoding
        const screenshotBuffer = await page.screenshot({
          fullPage: full_page ?? false,
          type: 'jpeg',
          quality: 80,
        });

        const base64 = screenshotBuffer.toString('base64');

        return {
          content: [{
            type: 'image',
            data: base64,
            mimeType: 'image/jpeg',
          }],
        };
      }

      case 'browser_evaluate': {
        const { script, page_name } = args as BrowserEvaluateInput;
        const page = await getPage(page_name);

        // Wrap script to handle return values
        const wrappedScript = `(async () => { ${script} })()`;
        const result = await page.evaluate(wrappedScript);

        return {
          content: [{
            type: 'text',
            text: result !== undefined ? JSON.stringify(result, null, 2) : 'Script executed (no return value)',
          }],
        };
      }

      case 'browser_pages': {
        const { action, page_name } = args as BrowserPagesInput;

        if (action === 'list') {
          const res = await fetchWithRetry(`${DEV_BROWSER_URL}/pages`);
          const data = await res.json() as { pages: string[] };

          // Filter to show only pages for this task
          const taskPrefix = `${TASK_ID}-`;
          const taskPages = data.pages
            .filter(name => name.startsWith(taskPrefix))
            .map(name => name.substring(taskPrefix.length));

          return {
            content: [{
              type: 'text',
              text: taskPages.length > 0
                ? `Open pages: ${taskPages.join(', ')}`
                : 'No pages open',
            }],
          };
        } else if (action === 'close') {
          if (!page_name) {
            return {
              content: [{ type: 'text', text: 'Error: page_name is required for close action' }],
              isError: true,
            };
          }

          const fullName = getFullPageName(page_name);
          const res = await fetchWithRetry(`${DEV_BROWSER_URL}/pages/${encodeURIComponent(fullName)}`, {
            method: 'DELETE',
          });

          if (!res.ok) {
            return {
              content: [{ type: 'text', text: `Error: Failed to close page: ${await res.text()}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: `Closed page "${page_name}"` }],
          };
        }

        return {
          content: [{ type: 'text', text: `Error: Unknown action "${action}"` }],
          isError: true,
        };
      }

      case 'browser_keyboard': {
        const { text, key, typing_delay, page_name } = args as BrowserKeyboardInput;
        const page = await getPage(page_name);

        if (!text && !key) {
          return {
            content: [{ type: 'text', text: 'Error: Either text or key must be provided' }],
            isError: true,
          };
        }

        const results: string[] = [];

        // Type text if provided
        if (text) {
          await page.keyboard.type(text, { delay: typing_delay ?? 20 });
          results.push(`Typed: "${text}"`);
        }

        // Press key if provided
        if (key) {
          await page.keyboard.press(key);
          results.push(`Pressed: ${key}`);
        }

        return {
          content: [{ type: 'text', text: results.join(', ') }],
        };
      }

      case 'browser_sequence': {
        const { actions, page_name } = args as BrowserSequenceInput;
        const page = await getPage(page_name);
        const results: string[] = [];

        for (let i = 0; i < actions.length; i++) {
          const step = actions[i];
          const stepNum = i + 1;

          try {
            switch (step.action) {
              case 'click': {
                if (step.x !== undefined && step.y !== undefined) {
                  await page.mouse.click(step.x, step.y);
                  results.push(`${stepNum}. Clicked at (${step.x}, ${step.y})`);
                } else if (step.ref) {
                  const element = await selectSnapshotRef(page, step.ref);
                  if (!element) throw new Error(`Ref "${step.ref}" not found`);
                  await element.click();
                  results.push(`${stepNum}. Clicked [ref=${step.ref}]`);
                } else if (step.selector) {
                  await page.click(step.selector);
                  results.push(`${stepNum}. Clicked "${step.selector}"`);
                } else {
                  throw new Error('Click requires x/y, ref, or selector');
                }
                await waitForPageLoad(page);
                break;
              }

              case 'type': {
                let element: ElementHandle | null = null;
                if (step.ref) {
                  element = await selectSnapshotRef(page, step.ref);
                  if (!element) throw new Error(`Ref "${step.ref}" not found`);
                } else if (step.selector) {
                  element = await page.$(step.selector);
                  if (!element) throw new Error(`Selector "${step.selector}" not found`);
                } else {
                  throw new Error('Type requires ref or selector');
                }
                await element.click();
                await element.fill(step.text || '');
                if (step.press_enter) {
                  await element.press('Enter');
                  await waitForPageLoad(page);
                }
                const target = step.ref ? `[ref=${step.ref}]` : `"${step.selector}"`;
                results.push(`${stepNum}. Typed "${step.text}" into ${target}${step.press_enter ? ' + Enter' : ''}`);
                break;
              }

              case 'snapshot': {
                await getSnapshotWithHistory(page, DEFAULT_SNAPSHOT_OPTIONS);
                results.push(`${stepNum}. Snapshot taken (refs updated)`);
                break;
              }

              case 'screenshot': {
                results.push(`${stepNum}. Screenshot taken`);
                break;
              }

              case 'wait': {
                const timeout = step.timeout || 1000;
                await new Promise(resolve => setTimeout(resolve, timeout));
                results.push(`${stepNum}. Waited ${timeout}ms`);
                break;
              }

              default:
                results.push(`${stepNum}. Unknown action: ${step.action}`);
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            results.push(`${stepNum}. FAILED: ${errMsg}`);
            // Stop sequence on error
            return {
              content: [{ type: 'text', text: `Sequence stopped at step ${stepNum}:\n${results.join('\n')}` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Sequence completed (${actions.length} actions):\n${results.join('\n')}` }],
        };
      }

      case 'browser_script': {
        const { actions, page_name } = args as BrowserScriptInput;
        let page = await getPage(page_name);
        const results: string[] = [];
        let snapshotResult = '';
        let screenshotData: { type: 'image'; mimeType: string; data: string } | null = null;

        for (let i = 0; i < actions.length; i++) {
          const step = actions[i];
          const stepNum = i + 1;

          try {
            switch (step.action) {
              case 'goto': {
                if (!step.url) throw new Error('goto requires url parameter');
                let fullUrl = step.url;
                if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                  fullUrl = 'https://' + fullUrl;
                }
                await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: step.timeout || 30000 });
                results.push(`${stepNum}. Navigated to ${fullUrl}`);
                break;
              }

              case 'waitForLoad': {
                await waitForPageLoad(page, step.timeout || 10000);
                results.push(`${stepNum}. Page loaded`);
                break;
              }

              case 'waitForSelector': {
                if (!step.selector) throw new Error('waitForSelector requires selector parameter');
                await page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
                results.push(`${stepNum}. Found "${step.selector}"`);
                break;
              }

              case 'waitForNavigation': {
                await page.waitForNavigation({ timeout: step.timeout || 10000 }).catch(() => {
                  // Ignore timeout - navigation may have already completed
                });
                results.push(`${stepNum}. Navigation completed`);
                break;
              }

              case 'findAndFill': {
                if (!step.selector) throw new Error('findAndFill requires selector parameter');
                const element = await page.$(step.selector);
                if (element) {
                  await element.click();
                  await element.fill(step.text || '');
                  if (step.pressEnter) {
                    await element.press('Enter');
                    await waitForPageLoad(page);
                  }
                  results.push(`${stepNum}. Filled "${step.selector}" with "${step.text || ''}"${step.pressEnter ? ' + Enter' : ''}`);
                } else if (step.skipIfNotFound) {
                  results.push(`${stepNum}. Skipped (not found): "${step.selector}"`);
                } else {
                  throw new Error(`Element not found: "${step.selector}"`);
                }
                break;
              }

              case 'findAndClick': {
                if (!step.selector) throw new Error('findAndClick requires selector parameter');
                const element = await page.$(step.selector);
                if (element) {
                  await element.click();
                  await waitForPageLoad(page);
                  results.push(`${stepNum}. Clicked "${step.selector}"`);
                } else if (step.skipIfNotFound) {
                  results.push(`${stepNum}. Skipped (not found): "${step.selector}"`);
                } else {
                  throw new Error(`Element not found: "${step.selector}"`);
                }
                break;
              }

              case 'fillByRef': {
                if (!step.ref) throw new Error('fillByRef requires ref parameter');
                const element = await selectSnapshotRef(page, step.ref);
                if (element) {
                  await element.click();
                  await element.fill(step.text || '');
                  if (step.pressEnter) {
                    await element.press('Enter');
                    await waitForPageLoad(page);
                  }
                  results.push(`${stepNum}. Filled [ref=${step.ref}] with "${step.text || ''}"${step.pressEnter ? ' + Enter' : ''}`);
                } else if (step.skipIfNotFound) {
                  results.push(`${stepNum}. Skipped (ref not found): "${step.ref}"`);
                } else {
                  throw new Error(`Ref not found: "${step.ref}". Run snapshot first.`);
                }
                break;
              }

              case 'clickByRef': {
                if (!step.ref) throw new Error('clickByRef requires ref parameter');
                const element = await selectSnapshotRef(page, step.ref);
                if (element) {
                  await element.click();
                  await waitForPageLoad(page);
                  results.push(`${stepNum}. Clicked [ref=${step.ref}]`);
                } else if (step.skipIfNotFound) {
                  results.push(`${stepNum}. Skipped (ref not found): "${step.ref}"`);
                } else {
                  throw new Error(`Ref not found: "${step.ref}". Run snapshot first.`);
                }
                break;
              }

              case 'snapshot': {
                snapshotResult = await getSnapshotWithHistory(page, DEFAULT_SNAPSHOT_OPTIONS);
                results.push(`${stepNum}. Snapshot taken`);
                break;
              }

              case 'screenshot': {
                const buffer = await page.screenshot({
                  fullPage: step.fullPage ?? false,
                  type: 'jpeg',
                  quality: 80,
                });
                screenshotData = {
                  type: 'image',
                  mimeType: 'image/jpeg',
                  data: buffer.toString('base64'),
                };
                results.push(`${stepNum}. Screenshot taken`);
                break;
              }

              case 'keyboard': {
                if (step.key) {
                  await page.keyboard.press(step.key);
                  results.push(`${stepNum}. Pressed key: ${step.key}`);
                } else if (step.text) {
                  await page.keyboard.type(step.text);
                  results.push(`${stepNum}. Typed: "${step.text}"`);
                } else {
                  throw new Error('keyboard requires key or text parameter');
                }
                break;
              }

              case 'evaluate': {
                if (!step.code) throw new Error('evaluate requires code parameter');
                const evalResult = await page.evaluate((code: string) => {
                  // eslint-disable-next-line no-eval
                  return eval(code);
                }, step.code);
                results.push(`${stepNum}. Evaluated: ${JSON.stringify(evalResult)}`);
                break;
              }

              default:
                results.push(`${stepNum}. Unknown action: ${(step as any).action}`);
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            results.push(`${stepNum}. FAILED: ${errMsg}`);

            // Try to capture page state on failure for debugging (with session history)
            try {
              snapshotResult = await getSnapshotWithHistory(page, DEFAULT_SNAPSHOT_OPTIONS);
              results.push(`→ Captured page state at failure`);
            } catch {
              // Ignore - page might be in bad state
            }

            // Build response with error info
            const content: CallToolResult['content'] = [
              { type: 'text', text: `Script stopped at step ${stepNum}:\n${results.join('\n')}` },
            ];
            if (snapshotResult) {
              content.push({ type: 'text', text: `\nPage state:\n${snapshotResult}` });
            }
            if (screenshotData) {
              content.push(screenshotData);
            }
            return { content, isError: true };
          }
        }

        // Always get final snapshot for agent feedback (unless one was just taken)
        const lastAction = actions[actions.length - 1];
        if (lastAction?.action !== 'snapshot') {
          try {
            // Wait for page to stabilize before capturing final state
            await waitForPageLoad(page, 2000);
            snapshotResult = await getSnapshotWithHistory(page, DEFAULT_SNAPSHOT_OPTIONS);
            results.push(`→ Auto-captured final page state`);
          } catch {
            // Ignore snapshot errors - page might be navigating
          }
        }

        // Build successful response
        const content: CallToolResult['content'] = [
          { type: 'text', text: `Script completed (${actions.length} actions):\n${results.join('\n')}` },
        ];
        if (snapshotResult) {
          content.push({ type: 'text', text: `\nPage state:\n${snapshotResult}` });
        }
        if (screenshotData) {
          content.push(screenshotData);
        }
        return { content };
      }

      case 'browser_keyboard': {
        const { action, key, text, typing_delay, page_name } = args as BrowserKeyboardInput;
        const page = await getPage(page_name);

        switch (action) {
          case 'press': {
            if (!key) {
              return {
                content: [{ type: 'text', text: 'Error: "key" is required for press action' }],
                isError: true,
              };
            }
            await page.keyboard.press(key);
            return {
              content: [{ type: 'text', text: `Pressed key: ${key}` }],
            };
          }
          case 'type': {
            if (!text) {
              return {
                content: [{ type: 'text', text: 'Error: "text" is required for type action' }],
                isError: true,
              };
            }
            await page.keyboard.type(text, { delay: typing_delay ?? 20 });
            return {
              content: [{ type: 'text', text: `Typed text: "${text}"` }],
            };
          }
          case 'down': {
            if (!key) {
              return {
                content: [{ type: 'text', text: 'Error: "key" is required for down action' }],
                isError: true,
              };
            }
            await page.keyboard.down(key);
            return {
              content: [{ type: 'text', text: `Key down: ${key}` }],
            };
          }
          case 'up': {
            if (!key) {
              return {
                content: [{ type: 'text', text: 'Error: "key" is required for up action' }],
                isError: true,
              };
            }
            await page.keyboard.up(key);
            return {
              content: [{ type: 'text', text: `Key up: ${key}` }],
            };
          }
          default:
            return {
              content: [{ type: 'text', text: `Error: Unknown keyboard action "${action}"` }],
              isError: true,
            };
        }
      }

      case 'browser_scroll': {
        const { direction, amount, ref, selector, position, page_name } = args as BrowserScrollInput;
        const page = await getPage(page_name);

        // Scroll element into view
        if (ref) {
          const element = await selectSnapshotRef(page, ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
          await element.scrollIntoViewIfNeeded();
          // Reset snapshot state after scroll - content likely changed
          resetSnapshotManager();
          return {
            content: [{ type: 'text', text: `Scrolled [ref=${ref}] into view` }],
          };
        }

        if (selector) {
          const element = await page.$(selector);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element matching "${selector}"` }],
              isError: true,
            };
          }
          await element.scrollIntoViewIfNeeded();
          // Reset snapshot state after scroll - content likely changed
          resetSnapshotManager();
          return {
            content: [{ type: 'text', text: `Scrolled "${selector}" into view` }],
          };
        }

        // Scroll to position
        if (position) {
          if (position === 'top') {
            await page.evaluate(() => window.scrollTo(0, 0));
            // Reset snapshot state after scroll - content likely changed
            resetSnapshotManager();
            return {
              content: [{ type: 'text', text: 'Scrolled to top of page' }],
            };
          } else if (position === 'bottom') {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            // Reset snapshot state after scroll - content likely changed
            resetSnapshotManager();
            return {
              content: [{ type: 'text', text: 'Scrolled to bottom of page' }],
            };
          }
        }

        // Scroll by direction and amount
        if (direction) {
          const scrollAmount = amount || 500;
          let deltaX = 0;
          let deltaY = 0;

          switch (direction) {
            case 'up':
              deltaY = -scrollAmount;
              break;
            case 'down':
              deltaY = scrollAmount;
              break;
            case 'left':
              deltaX = -scrollAmount;
              break;
            case 'right':
              deltaX = scrollAmount;
              break;
          }

          await page.mouse.wheel(deltaX, deltaY);
          // Reset snapshot state after scroll - content likely changed
          resetSnapshotManager();
          return {
            content: [{ type: 'text', text: `Scrolled ${direction} by ${scrollAmount}px` }],
          };
        }

        return {
          content: [{ type: 'text', text: 'Error: Provide direction, ref, selector, or position' }],
          isError: true,
        };
      }

      case 'browser_hover': {
        const { ref, selector, x, y, page_name } = args as BrowserHoverInput;
        const page = await getPage(page_name);

        if (x !== undefined && y !== undefined) {
          await page.mouse.move(x, y);
          return {
            content: [{ type: 'text', text: `Hovered at coordinates (${x}, ${y})` }],
          };
        }

        if (ref) {
          const element = await selectSnapshotRef(page, ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
          await element.hover();
          return {
            content: [{ type: 'text', text: `Hovered over [ref=${ref}]` }],
          };
        }

        if (selector) {
          await page.hover(selector);
          return {
            content: [{ type: 'text', text: `Hovered over "${selector}"` }],
          };
        }

        return {
          content: [{ type: 'text', text: 'Error: Provide ref, selector, or x/y coordinates' }],
          isError: true,
        };
      }

      case 'browser_select': {
        const { ref, selector, value, label, index, page_name } = args as BrowserSelectInput;
        const page = await getPage(page_name);

        // Build selection option
        let selectOption: { value?: string; label?: string; index?: number } | undefined;
        if (value !== undefined) {
          selectOption = { value };
        } else if (label !== undefined) {
          selectOption = { label };
        } else if (index !== undefined) {
          selectOption = { index };
        }

        if (!selectOption) {
          return {
            content: [{ type: 'text', text: 'Error: Provide value, label, or index to select' }],
            isError: true,
          };
        }

        let selectSelector: string;
        if (ref) {
          const element = await selectSnapshotRef(page, ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
          // Use evaluate to select on the element directly
          await element.selectOption(selectOption);
          const selectedBy = value ? `value="${value}"` : label ? `label="${label}"` : `index=${index}`;
          return {
            content: [{ type: 'text', text: `Selected option (${selectedBy}) in [ref=${ref}]` }],
          };
        }

        if (selector) {
          selectSelector = selector;
        } else {
          return {
            content: [{ type: 'text', text: 'Error: Provide ref or selector for the select element' }],
            isError: true,
          };
        }

        await page.selectOption(selectSelector, selectOption);
        const selectedBy = value ? `value="${value}"` : label ? `label="${label}"` : `index=${index}`;
        return {
          content: [{ type: 'text', text: `Selected option (${selectedBy}) in "${selectSelector}"` }],
        };
      }

      case 'browser_wait': {
        const { condition, selector, script, timeout, page_name } = args as BrowserWaitInput;
        const page = await getPage(page_name);
        const waitTimeout = timeout || 30000;

        switch (condition) {
          case 'selector': {
            if (!selector) {
              return {
                content: [{ type: 'text', text: 'Error: "selector" is required for selector condition' }],
                isError: true,
              };
            }
            await page.waitForSelector(selector, { timeout: waitTimeout });
            return {
              content: [{ type: 'text', text: `Element "${selector}" appeared` }],
            };
          }
          case 'hidden': {
            if (!selector) {
              return {
                content: [{ type: 'text', text: 'Error: "selector" is required for hidden condition' }],
                isError: true,
              };
            }
            await page.waitForSelector(selector, { state: 'hidden', timeout: waitTimeout });
            return {
              content: [{ type: 'text', text: `Element "${selector}" is now hidden` }],
            };
          }
          case 'navigation': {
            await page.waitForNavigation({ timeout: waitTimeout });
            return {
              content: [{ type: 'text', text: `Navigation completed. Now at: ${page.url()}` }],
            };
          }
          case 'network_idle': {
            await page.waitForLoadState('networkidle', { timeout: waitTimeout });
            return {
              content: [{ type: 'text', text: 'Network is idle' }],
            };
          }
          case 'timeout': {
            const waitMs = timeout || 1000;
            await page.waitForTimeout(waitMs);
            return {
              content: [{ type: 'text', text: `Waited ${waitMs}ms` }],
            };
          }
          case 'function': {
            if (!script) {
              return {
                content: [{ type: 'text', text: 'Error: "script" is required for function condition. Provide a JS expression that returns true when ready.' }],
                isError: true,
              };
            }
            try {
              await page.waitForFunction(script, { timeout: waitTimeout });
              return {
                content: [{ type: 'text', text: `Custom condition met: ${script.substring(0, 50)}${script.length > 50 ? '...' : ''}` }],
              };
            } catch (err) {
              const friendlyError = toAIFriendlyError(err, script);
              return {
                content: [{ type: 'text', text: friendlyError.message }],
                isError: true,
              };
            }
          }
          default:
            return {
              content: [{ type: 'text', text: `Error: Unknown wait condition "${condition}"` }],
              isError: true,
            };
        }
      }

      case 'browser_file_upload': {
        const { ref, selector, files, page_name } = args as BrowserFileUploadInput;
        const page = await getPage(page_name);

        if (!files || files.length === 0) {
          return {
            content: [{ type: 'text', text: 'Error: At least one file path is required' }],
            isError: true,
          };
        }

        let element: ElementHandle | null = null;

        if (ref) {
          element = await selectSnapshotRef(page, ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
        } else if (selector) {
          element = await page.$(selector);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element matching "${selector}"` }],
              isError: true,
            };
          }
        } else {
          return {
            content: [{ type: 'text', text: 'Error: Provide ref or selector for the file input' }],
            isError: true,
          };
        }

        await element.setInputFiles(files);
        const target = ref ? `[ref=${ref}]` : `"${selector}"`;
        const fileCount = files.length;
        return {
          content: [{ type: 'text', text: `Uploaded ${fileCount} file(s) to ${target}` }],
        };
      }

      case 'browser_drag': {
        const {
          source_ref, source_selector, source_x, source_y,
          target_ref, target_selector, target_x, target_y,
          page_name
        } = args as BrowserDragInput;
        const page = await getPage(page_name);

        // Determine source position
        let sourcePos: { x: number; y: number } | null = null;

        if (source_x !== undefined && source_y !== undefined) {
          sourcePos = { x: source_x, y: source_y };
        } else if (source_ref) {
          const element = await selectSnapshotRef(page, source_ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find source element with ref "${source_ref}"` }],
              isError: true,
            };
          }
          const box = await element.boundingBox();
          if (!box) {
            return {
              content: [{ type: 'text', text: `Error: Source element [ref=${source_ref}] has no bounding box` }],
              isError: true,
            };
          }
          sourcePos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        } else if (source_selector) {
          const element = await page.$(source_selector);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find source element "${source_selector}"` }],
              isError: true,
            };
          }
          const box = await element.boundingBox();
          if (!box) {
            return {
              content: [{ type: 'text', text: `Error: Source element "${source_selector}" has no bounding box` }],
              isError: true,
            };
          }
          sourcePos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }

        if (!sourcePos) {
          return {
            content: [{ type: 'text', text: 'Error: Provide source_ref, source_selector, or source_x/source_y' }],
            isError: true,
          };
        }

        // Determine target position
        let targetPos: { x: number; y: number } | null = null;

        if (target_x !== undefined && target_y !== undefined) {
          targetPos = { x: target_x, y: target_y };
        } else if (target_ref) {
          const element = await selectSnapshotRef(page, target_ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find target element with ref "${target_ref}"` }],
              isError: true,
            };
          }
          const box = await element.boundingBox();
          if (!box) {
            return {
              content: [{ type: 'text', text: `Error: Target element [ref=${target_ref}] has no bounding box` }],
              isError: true,
            };
          }
          targetPos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        } else if (target_selector) {
          const element = await page.$(target_selector);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find target element "${target_selector}"` }],
              isError: true,
            };
          }
          const box = await element.boundingBox();
          if (!box) {
            return {
              content: [{ type: 'text', text: `Error: Target element "${target_selector}" has no bounding box` }],
              isError: true,
            };
          }
          targetPos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }

        if (!targetPos) {
          return {
            content: [{ type: 'text', text: 'Error: Provide target_ref, target_selector, or target_x/target_y' }],
            isError: true,
          };
        }

        // Perform drag and drop using mouse events
        await page.mouse.move(sourcePos.x, sourcePos.y);
        await page.mouse.down();
        await page.mouse.move(targetPos.x, targetPos.y, { steps: 10 });
        await page.mouse.up();

        const sourceDesc = source_ref ? `[ref=${source_ref}]` : source_selector ? `"${source_selector}"` : `(${source_x}, ${source_y})`;
        const targetDesc = target_ref ? `[ref=${target_ref}]` : target_selector ? `"${target_selector}"` : `(${target_x}, ${target_y})`;
        return {
          content: [{ type: 'text', text: `Dragged from ${sourceDesc} to ${targetDesc}` }],
        };
      }

      case 'browser_get_text': {
        const { ref, selector, page_name } = args as BrowserGetTextInput;
        const page = await getPage(page_name);

        let element: ElementHandle | null = null;
        let target: string;

        if (ref) {
          element = await selectSnapshotRef(page, ref);
          target = `[ref=${ref}]`;
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
        } else if (selector) {
          element = await page.$(selector);
          target = `"${selector}"`;
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element matching "${selector}"` }],
              isError: true,
            };
          }
        } else {
          return {
            content: [{ type: 'text', text: 'Error: Provide ref or selector' }],
            isError: true,
          };
        }

        // Try to get input value first, then fall back to text content
        const value = await element.evaluate((el) => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return { type: 'value', text: el.value };
          }
          if (el instanceof HTMLSelectElement) {
            return { type: 'value', text: el.options[el.selectedIndex]?.text || '' };
          }
          return { type: 'text', text: el.textContent || '' };
        });

        return {
          content: [{ type: 'text', text: `${target} ${value.type}: "${value.text}"` }],
        };
      }

      case 'browser_is_visible': {
        const { ref, selector, page_name } = args as BrowserIsVisibleInput;
        const page = await getPage(page_name);

        try {
          if (ref) {
            const element = await selectSnapshotRef(page, ref);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element [ref=${ref}] not found - run browser_snapshot() to get updated refs)` }],
              };
            }
            const isVisible = await element.isVisible();
            return {
              content: [{ type: 'text', text: `${isVisible}` }],
            };
          } else if (selector) {
            const element = await page.$(selector);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element "${selector}" not found)` }],
              };
            }
            const isVisible = await element.isVisible();
            return {
              content: [{ type: 'text', text: `${isVisible}` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Provide ref or selector' }],
              isError: true,
            };
          }
        } catch (err) {
          const targetDesc = ref ? `[ref=${ref}]` : selector || 'element';
          const friendlyError = toAIFriendlyError(err, targetDesc);
          return {
            content: [{ type: 'text', text: friendlyError.message }],
            isError: true,
          };
        }
      }

      case 'browser_is_enabled': {
        const { ref, selector, page_name } = args as BrowserIsEnabledInput;
        const page = await getPage(page_name);

        try {
          if (ref) {
            const element = await selectSnapshotRef(page, ref);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element [ref=${ref}] not found - run browser_snapshot() to get updated refs)` }],
              };
            }
            const isEnabled = await element.isEnabled();
            return {
              content: [{ type: 'text', text: `${isEnabled}` }],
            };
          } else if (selector) {
            const element = await page.$(selector);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element "${selector}" not found)` }],
              };
            }
            const isEnabled = await element.isEnabled();
            return {
              content: [{ type: 'text', text: `${isEnabled}` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Provide ref or selector' }],
              isError: true,
            };
          }
        } catch (err) {
          const targetDesc = ref ? `[ref=${ref}]` : selector || 'element';
          const friendlyError = toAIFriendlyError(err, targetDesc);
          return {
            content: [{ type: 'text', text: friendlyError.message }],
            isError: true,
          };
        }
      }

      case 'browser_is_checked': {
        const { ref, selector, page_name } = args as BrowserIsCheckedInput;
        const page = await getPage(page_name);

        try {
          if (ref) {
            const element = await selectSnapshotRef(page, ref);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element [ref=${ref}] not found - run browser_snapshot() to get updated refs)` }],
              };
            }
            const isChecked = await element.isChecked();
            return {
              content: [{ type: 'text', text: `${isChecked}` }],
            };
          } else if (selector) {
            const element = await page.$(selector);
            if (!element) {
              return {
                content: [{ type: 'text', text: `false (element "${selector}" not found)` }],
              };
            }
            const isChecked = await element.isChecked();
            return {
              content: [{ type: 'text', text: `${isChecked}` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Provide ref or selector' }],
              isError: true,
            };
          }
        } catch (err) {
          const targetDesc = ref ? `[ref=${ref}]` : selector || 'element';
          const friendlyError = toAIFriendlyError(err, targetDesc);
          return {
            content: [{ type: 'text', text: friendlyError.message }],
            isError: true,
          };
        }
      }

      case 'browser_iframe': {
        const { action, ref, selector, page_name } = args as BrowserIframeInput;
        const page = await getPage(page_name);

        if (action === 'enter') {
          let frameElement: ElementHandle | null = null;

          if (ref) {
            frameElement = await selectSnapshotRef(page, ref);
            if (!frameElement) {
              return {
                content: [{ type: 'text', text: `Error: Could not find iframe with ref "${ref}"` }],
                isError: true,
              };
            }
          } else if (selector) {
            frameElement = await page.$(selector);
            if (!frameElement) {
              return {
                content: [{ type: 'text', text: `Error: Could not find iframe matching "${selector}"` }],
                isError: true,
              };
            }
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Provide ref or selector for the iframe' }],
              isError: true,
            };
          }

          const frame = await frameElement.contentFrame();
          if (!frame) {
            return {
              content: [{ type: 'text', text: 'Error: Element is not an iframe or frame is not accessible' }],
              isError: true,
            };
          }

          // Store the frame reference for subsequent operations
          // Note: In Playwright, we work with frames directly, not by "entering" them
          // The frame URL is returned so the agent can use it for context
          const frameUrl = frame.url();
          return {
            content: [{ type: 'text', text: `Entered iframe. Frame URL: ${frameUrl}\nNote: Use browser_evaluate with frame-aware selectors, or take a snapshot to see iframe content.` }],
          };
        } else if (action === 'exit') {
          // In Playwright, there's no explicit "exit" - you just work with the main page again
          return {
            content: [{ type: 'text', text: 'Exited iframe. Now working with main page.' }],
          };
        }

        return {
          content: [{ type: 'text', text: `Error: Unknown iframe action "${action}"` }],
          isError: true,
        };
      }

      case 'browser_tabs': {
        const { action, index, timeout, page_name } = args as BrowserTabsInput;
        const b = await ensureConnected();

        if (action === 'list') {
          const allPages = b.contexts().flatMap((ctx) => ctx.pages());
          const pageList = allPages.map((p, i) => `${i}: ${p.url()}`).join('\n');
          let output = `Open tabs (${allPages.length}):\n${pageList}`;
          if (allPages.length > 1) {
            output += `\n\nMultiple tabs detected! Use browser_tabs(action="switch", index=N) to switch to another tab.`;
          }
          return {
            content: [{ type: 'text', text: output }],
          };
        }

        if (action === 'switch') {
          if (index === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: index is required for switch action' }],
              isError: true,
            };
          }
          const allPages = b.contexts().flatMap((ctx) => ctx.pages());
          if (index < 0 || index >= allPages.length) {
            return {
              content: [{ type: 'text', text: `Error: Invalid tab index ${index}. Valid range: 0-${allPages.length - 1}` }],
              isError: true,
            };
          }
          const targetPage = allPages[index]!;
          await targetPage.bringToFront();
          activePageOverride = targetPage;  // Set the override so getPage() returns this tab
          await injectActiveTabGlow(targetPage);  // Add visual indicator for active tab
          return {
            content: [{ type: 'text', text: `Switched to tab ${index}: ${targetPage.url()}\n\nNow use browser_snapshot() to see the content of this tab.` }],
          };
        }

        if (action === 'close') {
          if (index === undefined) {
            return {
              content: [{ type: 'text', text: 'Error: index is required for close action' }],
              isError: true,
            };
          }
          const allPages = b.contexts().flatMap((ctx) => ctx.pages());
          if (index < 0 || index >= allPages.length) {
            return {
              content: [{ type: 'text', text: `Error: Invalid tab index ${index}. Valid range: 0-${allPages.length - 1}` }],
              isError: true,
            };
          }
          const targetPage = allPages[index]!;
          const closedUrl = targetPage.url();
          // Clear override if closing the active tab
          if (activePageOverride === targetPage) {
            activePageOverride = null;
          }
          await targetPage.close();
          return {
            content: [{ type: 'text', text: `Closed tab ${index}: ${closedUrl}` }],
          };
        }

        if (action === 'wait_for_new') {
          const waitTimeout = timeout || 5000;
          const context = b.contexts()[0];
          if (!context) {
            return {
              content: [{ type: 'text', text: 'Error: No browser context available' }],
              isError: true,
            };
          }

          try {
            const newPage = await context.waitForEvent('page', { timeout: waitTimeout });
            await newPage.waitForLoadState('domcontentloaded');
            const allPages = context.pages();
            const newIndex = allPages.indexOf(newPage);
            activePageOverride = newPage;  // Set the new tab as active
            await injectActiveTabGlow(newPage);  // Add visual indicator for new tab
            return {
              content: [{ type: 'text', text: `New tab opened at index ${newIndex}: ${newPage.url()}` }],
            };
          } catch {
            return {
              content: [{ type: 'text', text: `No new tab opened within ${waitTimeout}ms` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: 'text', text: `Error: Unknown tabs action "${action}"` }],
          isError: true,
        };
      }

      case 'browser_canvas_type': {
        const { text, position, page_name } = args as BrowserCanvasTypeInput;
        const page = await getPage(page_name);
        const jumpToStart = position !== 'current'; // Default to 'start'

        // Step 1: Click in the document area (center-lower to avoid overlays)
        const viewport = page.viewportSize();
        const clickX = (viewport?.width || 1280) / 2;
        const clickY = (viewport?.height || 720) * 2 / 3;
        await page.mouse.click(clickX, clickY);

        // Small delay to ensure focus
        await page.waitForTimeout(100);

        // Step 2: Jump to document start if requested
        if (jumpToStart) {
          const isMac = process.platform === 'darwin';
          const modifier = isMac ? 'Meta' : 'Control';
          await page.keyboard.press(`${modifier}+Home`);
          await page.waitForTimeout(50);
        }

        // Step 3: Type the text
        await page.keyboard.type(text);

        const positionDesc = jumpToStart ? 'at document start' : 'at current position';
        return {
          content: [{ type: 'text', text: `Typed "${text.length > 50 ? text.slice(0, 50) + '...' : text}" ${positionDesc}` }],
        };
      }

      case 'browser_highlight': {
        const { enabled, page_name } = args as BrowserHighlightInput;
        const page = await getPage(page_name);

        if (enabled) {
          await injectActiveTabGlow(page);
          return {
            content: [{ type: 'text', text: 'Highlight enabled - tab now shows color-cycling glow border' }],
          };
        } else {
          await removeActiveTabGlow(page);
          return {
            content: [{ type: 'text', text: 'Highlight disabled - glow removed from tab' }],
          };
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `Error: Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the MCP server
async function main() {
  console.error('[dev-browser-mcp] main() called, creating transport...');
  const transport = new StdioServerTransport();
  console.error('[dev-browser-mcp] Transport created, connecting server...');
  await server.connect(transport);
  console.error('[dev-browser-mcp] Server connected successfully!');
  console.error('[dev-browser-mcp] MCP Server ready and listening for tool calls');

  // Connect to browser immediately to set up page listeners for auto-glow
  console.error('[dev-browser-mcp] Connecting to browser for auto-glow setup...');
  try {
    await ensureConnected();
    console.error('[dev-browser-mcp] Browser connected, page listeners active');
  } catch (err) {
    console.error('[dev-browser-mcp] Could not connect to browser yet (will retry on first tool call):', err);
  }
}

console.error('[dev-browser-mcp] Calling main()...');
main().catch((error) => {
  console.error('[dev-browser-mcp] Failed to start server:', error);
  process.exit(1);
});
