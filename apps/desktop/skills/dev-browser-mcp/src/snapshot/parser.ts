// apps/desktop/skills/dev-browser-mcp/src/snapshot/parser.ts

import type { SnapshotElement, ParsedSnapshot } from './types.js';

/**
 * Parse a YAML snapshot string into a structured format with elements indexed by ref.
 *
 * Example input line:
 * - button "Submit" [ref=e5] [disabled]:
 *
 * Extracts: { ref: 'e5', role: 'button', name: 'Submit', disabled: true }
 */
export function parseSnapshot(
  yamlSnapshot: string,
  url: string,
  title: string
): ParsedSnapshot {
  const elements = new Map<string, SnapshotElement>();
  const lines = yamlSnapshot.split('\n');

  // Regex to match element lines with refs
  // Matches: - role "name" [ref=eN] [optional-attrs]:
  const elementRegex = /^(\s*)-\s+(\w+)(?:\s+"([^"]*)"|\s+'([^']*)')?(.*)$/;
  const refRegex = /\[ref=(e\d+)\]/;
  const valueRegex = /:\s*"([^"]*)"\s*$/;
  const checkedRegex = /\[checked(?:=(\w+))?\]/;
  const disabledRegex = /\[disabled\]/;
  const expandedRegex = /\[expanded\]/;
  const selectedRegex = /\[selected\]/;
  const levelRegex = /\[level=(\d+)\]/;
  const pressedRegex = /\[pressed(?:=(\w+))?\]/;

  for (const line of lines) {
    const match = line.match(elementRegex);
    if (!match) continue;

    const [, , role, nameDouble, nameSingle, rest] = match;
    const name = nameDouble ?? nameSingle ?? '';

    const refMatch = rest.match(refRegex);
    if (!refMatch) continue; // Skip elements without refs

    const ref = refMatch[1];
    const element: SnapshotElement = { ref, role, name };

    // Extract value (for inputs with content after colon)
    const valueMatch = line.match(valueRegex);
    if (valueMatch) {
      element.value = valueMatch[1];
    }

    // Extract boolean attributes
    const checkedMatch = rest.match(checkedRegex);
    if (checkedMatch) {
      element.checked = checkedMatch[1] === 'mixed' ? 'mixed' : true;
    }

    if (disabledRegex.test(rest)) {
      element.disabled = true;
    }

    if (expandedRegex.test(rest)) {
      element.expanded = true;
    }

    if (selectedRegex.test(rest)) {
      element.selected = true;
    }

    const levelMatch = rest.match(levelRegex);
    if (levelMatch) {
      element.level = parseInt(levelMatch[1], 10);
    }

    const pressedMatch = rest.match(pressedRegex);
    if (pressedMatch) {
      element.pressed = pressedMatch[1] === 'mixed' ? 'mixed' : true;
    }

    elements.set(ref, element);
  }

  return {
    url,
    title,
    timestamp: Date.now(),
    elements,
    rawYaml: yamlSnapshot,
  };
}

/**
 * Extract the page title from snapshot metadata header.
 * Looks for "Page Title: ..." or similar patterns.
 */
export function extractTitleFromSnapshot(snapshot: string): string {
  const titleMatch = snapshot.match(/(?:Page Title|Title):\s*(.+)/i);
  return titleMatch ? titleMatch[1].trim() : '';
}
