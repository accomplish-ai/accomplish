export function isHttpNavigationUrl(url: string): boolean {
  const lower = url.slice(0, 8).toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

export function isBlankPanelNavigationUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower === 'about:blank') return true;
  const hashIdx = lower.indexOf('#');
  if (hashIdx === -1) return false;
  const fragment = lower.slice(hashIdx + 1);
  return lower.startsWith('about:blank#') && fragment === 'accomplish-browser-panel';
}

export function isReusableStartupPageUrl(url: string): boolean {
  return isBlankPanelNavigationUrl(url);
}
