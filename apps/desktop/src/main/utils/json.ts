export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Safely parse a JSON string, returning a result object with error details on failure.
 */
export function safeParseJson<T>(json: string | null): SafeParseResult<T> {
  if (!json) {
    return { success: false, error: 'Input is null or empty' };
  }
  try {
    return { success: true, data: JSON.parse(json) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Safely parse a JSON string, returning the data or a fallback value on failure.
 */
export function safeParseJsonWithFallback<T>(json: string | null, fallback: T | null = null): T | null {
  const result = safeParseJson<T>(json);
  return result.success ? result.data : fallback;
}
