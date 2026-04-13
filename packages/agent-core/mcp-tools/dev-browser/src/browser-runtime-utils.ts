export function isClosedPageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Target page, context or browser has been closed/i.test(message) ||
    /\bTarget closed\b/i.test(message) ||
    /\bPage closed\b/i.test(message) ||
    /\bSession closed\b/i.test(message) ||
    /Page\.createIsolatedWorld/i.test(message) ||
    /\bNo target with given id\b/i.test(message) ||
    /\bBrowser window not found\b/i.test(message)
  );
}

export function isTransientNavigationContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // Only match Cannot read properties of null (reading '...') which is common in navigation context errors
  return (
    /Execution context was destroyed/i.test(message) ||
    /Cannot read properties of null \(reading '.+'\)/i.test(message)
  );
}

export function isTimeoutError(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)).startsWith('Timeout: ');
}

export async function fetchWithRetry(
  url: string,
  maxRetries = 5,
  delayMs = 500,
): Promise<Response> {
  maxRetries = Math.max(1, Math.floor(maxRetries));
  delayMs = Math.max(0, delayMs);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    try {
      const response = await withTimeout(
        fetch(url, { signal: controller.signal }),
        30000,
        `fetch timed out for ${url}`,
        () => controller.abort(),
      );
      if (response.ok) {
        return response;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      onTimeout?.();
      reject(new Error(`Timeout: ${message}`));
    }, ms);
    promise
      .then((value) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      })
      .catch((err) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(err);
      });
  });
}

export function respondInternalError(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  error: unknown,
): void {
  console.error('[dev-browser] internal error', error);
  res.status(500).json({ error: 'Internal server error' });
}
