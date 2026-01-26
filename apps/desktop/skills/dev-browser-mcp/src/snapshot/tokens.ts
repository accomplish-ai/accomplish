/**
 * Token estimation for snapshot output.
 * Uses heuristics calibrated against actual tokenizer results.
 */

import type { SnapshotElement } from './types';

/** Average characters per token (Claude tokenizer approximation) */
const CHARS_PER_TOKEN = 2;

/** Base tokens for YAML structure per element */
const YAML_OVERHEAD = 5;

/** Tokens for each boolean attribute */
const ATTRIBUTE_TOKENS = 2;

/** Maximum tokens from element name */
const MAX_NAME_TOKENS = 50;

/**
 * Estimate tokens for a single element.
 */
export function estimateElementTokens(element: Partial<SnapshotElement>): number {
  let tokens = YAML_OVERHEAD;

  // Role: usually 1-2 tokens
  tokens += Math.ceil((element.role?.length ?? 0) / CHARS_PER_TOKEN);

  // Name: capped contribution
  const nameLength = element.name?.length ?? 0;
  const nameTokens = Math.ceil(nameLength / CHARS_PER_TOKEN);
  tokens += Math.min(nameTokens, MAX_NAME_TOKENS);

  // Ref: usually 2 tokens ([ref=e123])
  tokens += 2;

  // Boolean attributes
  if (element.checked !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.disabled !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.expanded !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.selected !== undefined) tokens += ATTRIBUTE_TOKENS;
  if (element.pressed !== undefined) tokens += ATTRIBUTE_TOKENS;

  // Value: additional tokens
  if (element.value) {
    const valueTokens = Math.ceil(element.value.length / CHARS_PER_TOKEN);
    tokens += Math.min(valueTokens, MAX_NAME_TOKENS);
  }

  return tokens;
}

/**
 * Estimate total tokens for YAML string.
 * Uses simple character-based heuristic.
 */
export function estimateTokens(yaml: string): number {
  if (!yaml) return 0;
  return Math.ceil(yaml.length / CHARS_PER_TOKEN);
}
