import type { SnapshotElement, ParsedSnapshot } from './types.js';

export function parseSnapshot(
  yamlSnapshot: string,
  url: string,
  title: string
): ParsedSnapshot {
  const elements = new Map<string, SnapshotElement>();
  const lines = yamlSnapshot.split('\n');

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
    if (!refMatch) continue;

    const ref = refMatch[1];
    const element: SnapshotElement = { ref, role, name };

    const valueMatch = line.match(valueRegex);
    if (valueMatch) {
      element.value = valueMatch[1];
    }

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

export function extractTitleFromSnapshot(snapshot: string): string {
  const titleMatch = snapshot.match(/(?:Page Title|Title):\s*(.+)/i);
  return titleMatch ? titleMatch[1].trim() : '';
}
