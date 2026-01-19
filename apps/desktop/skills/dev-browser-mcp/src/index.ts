#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dev-Browser MCP Server
 *
 * Exposes browser automation as direct MCP tools, eliminating the need
 * for agents to write scripts. Connects to the dev-browser server on port 9224.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, type Browser, type Page, type ElementHandle } from 'playwright';

const DEV_BROWSER_PORT = 9224;
const DEV_BROWSER_URL = `http://localhost:${DEV_BROWSER_PORT}`;

// Task ID for page name prefixing (supports parallel tasks)
const TASK_ID = process.env.ACCOMPLISH_TASK_ID || 'default';

// Browser connection state
let browser: Browser | null = null;
let connectingPromise: Promise<Browser> | null = null;

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
 * Ensure browser is connected
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
      const info = await res.json() as { wsEndpoint: string };
      browser = await chromium.connectOverCDP(info.wsEndpoint);
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

  // Check if we're in extension mode
  const infoRes = await fetchWithRetry(DEV_BROWSER_URL);
  const info = await infoRes.json() as { mode?: string };
  const isExtensionMode = info.mode === 'extension';

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
 * Wait for page to finish loading
 */
async function waitForPageLoad(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now();

  // Wait minimum time
  await new Promise((resolve) => setTimeout(resolve, 100));

  while (Date.now() - startTime < timeout) {
    try {
      const readyState = await page.evaluate(() => document.readyState);
      if (readyState === 'complete') {
        return;
      }
    } catch {
      // Page may be navigating
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Get the snapshot script that can be injected into the browser
 */
function getSnapshotScript(): string {
  // Inlined snapshot script from dev-browser
  return `
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

  function renderAriaTree(ariaSnapshot) {
    const options = { visibility: "ariaOrVisible", refs: "interactable", refPrefix: "", includeGenericRole: true, renderActive: true, renderCursorPointer: true };
    const lines = [];
    let nodesToRender = ariaSnapshot.root.role === "fragment" ? ariaSnapshot.root.children : [ariaSnapshot.root];

    const visitText = (text, indent) => {
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

  function getAISnapshot() {
    const snapshot = generateAriaTree(document.body);
    const refsObject = {};
    for (const [ref, element] of snapshot.elements) refsObject[ref] = element;
    window.__devBrowserRefs = refsObject;
    return renderAriaTree(snapshot);
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
}

/**
 * Get ARIA snapshot for a page
 */
async function getAISnapshot(page: Page): Promise<string> {
  const snapshotScript = getSnapshotScript();
  const snapshot = await page.evaluate((script: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = globalThis as any;
    if (!w.__devBrowser_getAISnapshot) {
      // eslint-disable-next-line no-eval
      eval(script);
    }
    return w.__devBrowser_getAISnapshot();
  }, snapshotScript);
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
}

interface BrowserClickInput {
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
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
      description: 'Navigate to a URL in the browser. Opens a new page if needed and waits for the page to load.',
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
      description: 'Get the ARIA accessibility tree of the current page. Returns elements with refs like [ref=e5] that can be used with browser_click and browser_type.',
      inputSchema: {
        type: 'object',
        properties: {
          page_name: {
            type: 'string',
            description: 'Optional name of the page to snapshot (default: "main")',
          },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click on the page. Default: use x/y coordinates. Alternatively use ref from browser_snapshot or CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'X coordinate in pixels from left (default method).',
          },
          y: {
            type: 'number',
            description: 'Y coordinate in pixels from top (default method).',
          },
          ref: {
            type: 'string',
            description: 'Element ref from browser_snapshot (e.g., "e5"). Alternative to coordinates.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector (e.g., "button.submit"). Alternative to coordinates.',
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
      description: 'Type text into an input field. Use either a ref from browser_snapshot (preferred) or a CSS selector.',
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
      description: 'Take a screenshot of the current page. Returns the image for visual inspection.',
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
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'browser_navigate': {
        const { url, page_name } = args as BrowserNavigateInput;

        // Add protocol if missing
        let fullUrl = url;
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
          fullUrl = 'https://' + fullUrl;
        }

        const page = await getPage(page_name);
        await page.goto(fullUrl);
        await waitForPageLoad(page);

        const title = await page.title();
        const currentUrl = page.url();

        return {
          content: [{
            type: 'text',
            text: `Navigated to ${currentUrl}\nTitle: ${title}`,
          }],
        };
      }

      case 'browser_snapshot': {
        const { page_name } = args as BrowserSnapshotInput;
        const page = await getPage(page_name);
        const snapshot = await getAISnapshot(page);

        return {
          content: [{
            type: 'text',
            text: snapshot,
          }],
        };
      }

      case 'browser_click': {
        const { ref, selector, x, y, page_name } = args as BrowserClickInput;
        const page = await getPage(page_name);

        // Default: x/y coordinates
        if (x !== undefined && y !== undefined) {
          await page.mouse.click(x, y);
          await waitForPageLoad(page);
          return {
            content: [{ type: 'text', text: `Clicked at coordinates (${x}, ${y})` }],
          };
        } else if (ref) {
          const element = await selectSnapshotRef(page, ref);
          if (!element) {
            return {
              content: [{ type: 'text', text: `Error: Could not find element with ref "${ref}"` }],
              isError: true,
            };
          }
          await element.click();
          await waitForPageLoad(page);
          return {
            content: [{ type: 'text', text: `Clicked element [ref=${ref}]` }],
          };
        } else if (selector) {
          await page.click(selector);
          await waitForPageLoad(page);
          return {
            content: [{ type: 'text', text: `Clicked element matching "${selector}"` }],
          };
        } else {
          return {
            content: [{ type: 'text', text: 'Error: Provide x/y coordinates, ref, or selector' }],
            isError: true,
          };
        }
      }

      case 'browser_type': {
        const { ref, selector, text, press_enter, page_name } = args as BrowserTypeInput;
        const page = await getPage(page_name);

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
      }

      case 'browser_screenshot': {
        const { page_name, full_page } = args as BrowserScreenshotInput;
        const page = await getPage(page_name);

        const screenshotBuffer = await page.screenshot({
          fullPage: full_page ?? false,
          type: 'png',
        });

        const base64 = screenshotBuffer.toString('base64');

        return {
          content: [{
            type: 'image',
            data: base64,
            mimeType: 'image/png',
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Dev-Browser MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
