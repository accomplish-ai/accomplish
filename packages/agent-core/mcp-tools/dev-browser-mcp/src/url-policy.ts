export function parseAllowedDomainsFromEnv(
  raw: string | undefined,
): string[] | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(normalized));
  } catch {
    // Fail closed for malformed policy values.
    return [];
  }
}

export function normalizeNavigationUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export function matchesDomainPattern(hostname: string, pattern: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Match any subdomain, but not the base domain itself.
  if (normalizedPattern.startsWith('*.')) {
    const baseDomain = normalizedPattern.slice(2);
    return normalizedHost.endsWith(`.${baseDomain}`);
  }

  return normalizedHost === normalizedPattern;
}

export function isNavigationAllowed(
  targetUrl: string,
  allowedDomains: string[] | null,
): boolean {
  if (allowedDomains === null) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return allowedDomains.some((pattern) => matchesDomainPattern(hostname, pattern));
}

export function assertNavigationAllowed(
  targetUrl: string,
  allowedDomains: string[] | null,
): void {
  if (isNavigationAllowed(targetUrl, allowedDomains)) {
    return;
  }

  let hostname = targetUrl;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
  }

  throw new Error(
    `Navigation blocked by sandbox allowlist: "${hostname}" is not in the allowed domains list.`,
  );
}
