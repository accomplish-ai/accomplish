import type { SnapshotElement } from './types';

const CHARS_PER_TOKEN = 2;
const YAML_OVERHEAD = 5;
const ATTRIBUTE_TOKENS = 2;
const MAX_NAME_TOKENS = 50;

export function estimateElementTokens(element: Partial<SnapshotElement>): number {
  let tokens = YAML_OVERHEAD;

  tokens += Math.ceil((element.role?.length ?? 0) / CHARS_PER_TOKEN);

  const nameLength = element.name?.length ?? 0;
  const nameTokens = Math.ceil(nameLength / CHARS_PER_TOKEN);
  tokens += Math.min(nameTokens, MAX_NAME_TOKENS);

  tokens += 2;

  if (element.checked !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.disabled !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.expanded !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.selected !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.pressed !== undefined) tokens += ATTRIBUTE_TOKENS;

  if (element.value) {
    const valueTokens = Math.ceil(element.value.length / CHARS_PER_TOKEN);
    tokens += Math.min(valueTokens, MAX_NAME_TOKENS);
  }

  return tokens;
}

export function estimateTokens(yaml: string): number {
  if (!yaml) return 0;
  return Math.ceil(yaml.length / CHARS_PER_TOKEN);
}
