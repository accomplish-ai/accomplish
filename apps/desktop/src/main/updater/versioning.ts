/**
 * Pure version/manifest helpers for the manual update-check path. Kept separate
 * from the orchestrator so (a) the per-file LOC cap stays honored and (b) these
 * pure functions can be exercised in isolation by unit tests without pulling in
 * Electron, Sentry, or network mocks.
 */

import { load as yamlLoad } from 'js-yaml';
import { coerce, gt as semverGt, valid } from 'semver';

/**
 * Minimal fields we actually consume on the manual path. `releaseDate` and `sha512`
 * are deliberately omitted: the dialog never displays `releaseDate`, and `sha512`
 * is not verified (the user downloads via their browser). Keeping the shape minimal
 * defends against upstream manifest schema drift.
 */
export interface ManifestShape {
  version: string;
  path: string;
}

/** Returns null on malformed YAML, non-object roots, or missing/wrong-typed version/path fields. */
export function parseManifest(raw: string): ManifestShape | null {
  let doc: unknown;
  try {
    doc = yamlLoad(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') {
    return null;
  }
  const { version, path: p } = doc as Record<string, unknown>;
  if (typeof version !== 'string' || typeof p !== 'string') {
    return null;
  }
  return { version, path: p };
}

/**
 * Coerce a semver-looking string to a canonical version.
 *   - `valid()` preserves pre-release qualifiers: "1.2.3-beta.1" stays as-is so
 *     release-vs-pre-release ordering is correct.
 *   - `coerce()` handles "1.2", "v1.2.3" etc. without throwing.
 * Returns null for genuinely uncoerceable strings (including empty); callers
 * distinguish this from "no newer version" to track manifest bugs separately.
 */
export function normalizeVersion(v: string): string | null {
  return valid(v) ?? coerce(v)?.version ?? null;
}

/**
 * True when both sides normalize AND the normalized remote is strictly greater.
 * Returns false for uncoerceable inputs (callers should check `normalizeVersion`
 * first when they need to distinguish "not newer" from "invalid").
 */
export function isNewer(remote: string, current: string): boolean {
  const r = normalizeVersion(remote);
  const c = normalizeVersion(current);
  if (!r || !c) {
    return false;
  }
  try {
    return semverGt(r, c);
  } catch {
    return false;
  }
}
