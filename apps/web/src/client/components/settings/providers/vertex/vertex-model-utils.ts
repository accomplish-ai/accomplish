export const CURATED_VERTEX_PREFIXES = ['vertex/google/', 'vertex/anthropic/', 'vertex/mistralai/'];

export function isCuratedVertexModel(modelId: string): boolean {
  return CURATED_VERTEX_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}
