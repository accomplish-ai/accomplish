export function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}. Only http and https are supported.`);
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw error;
  }
}

export function isValidRequestPath(pathname: string): boolean {
  if (pathname === '/health') {
    return true;
  }
  if (pathname === '/chat/completions' || pathname.startsWith('/chat/')) {
    return true;
  }
  if (pathname === '/completions' || pathname.startsWith('/completions/')) {
    return true;
  }
  if (pathname === '/embeddings' || pathname.startsWith('/embeddings/')) {
    return true;
  }
  if (pathname === '/models' || pathname.startsWith('/models/')) {
    return true;
  }
  return false;
}

export function shouldTransformBody(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('application/json');
}
