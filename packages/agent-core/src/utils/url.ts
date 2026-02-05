export function validateHttpUrl(urlString: string, fieldName = 'URL'): URL {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`${fieldName} must use http or https protocol`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('protocol')) {
      throw error;
    }
    throw new Error(`${fieldName} is not a valid URL`);
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
