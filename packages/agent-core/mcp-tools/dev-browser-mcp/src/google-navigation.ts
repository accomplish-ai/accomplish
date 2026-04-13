export function normalizeNavigationUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export interface NavigationPlan {
  finalUrl: string;
  steps: string[];
  requiresLogin: boolean;
}

export function buildGoogleNavigationPlan(url: string): NavigationPlan {
  const normalized = normalizeNavigationUrl(url);
  // Use normalized URL for checks
  let requiresLogin = false;
  try {
    const parsed = new URL(normalized);
    // Check for accounts.google.com
    if (/^accounts\.google\.com$/i.test(parsed.hostname)) {
      requiresLogin = true;
    }
    // Check for /login or /signin as a full path segment
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.some((seg) => /^login$/i.test(seg) || /^signin$/i.test(seg))) {
      requiresLogin = true;
    }
  } catch {
    // fallback: if URL can't be parsed, don't require login
  }
  return { finalUrl: normalized, steps: [normalized], requiresLogin };
}

export function buildGoogleLoginRedirectUrl(targetUrl: string): string {
  return `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(targetUrl)}`;
}

export function buildCurrentPageLinkNavigationPlan(link: string): NavigationPlan {
  return { finalUrl: link, steps: [link], requiresLogin: false };
}

export function buildGoogleMarketingSignInNavigationPlan(
  linkHref: string,
  targetUrl: string,
): NavigationPlan {
  return { finalUrl: targetUrl, steps: [linkHref, targetUrl], requiresLogin: true };
}

export function isGoogleWorkspaceMarketingUrl(url: string): boolean {
  return /workspace\.google\.com/.test(url) && !/docs\.google\.com/.test(url);
}
