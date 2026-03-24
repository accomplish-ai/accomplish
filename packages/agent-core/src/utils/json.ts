export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: string };

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

export function safeParseJsonWithFallback<T>(
  json: string | null,
  fallback: T | null = null,
): T | null {
  const result = safeParseJson<T>(json);
  return result.success ? result.data : fallback;
}
