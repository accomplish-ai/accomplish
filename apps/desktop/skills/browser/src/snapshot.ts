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
