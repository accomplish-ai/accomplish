/**
 * Origin check for manifest `path:` URLs.
 *
 * Manifests may carry absolute download URLs (e.g. `https://downloads.accomplish.ai/...`)
 * on a different subdomain than the manifest host (`https://d.accomplish.ai/...`), so a
 * strict same-origin check is too tight. Instead we accept any URL whose hostname shares
 * the feed URL's apex (last two labels) — covers `downloads.accomplish.ai` vs
 * `d.accomplish.ai` without accepting `evil.example.com`.
 *
 * This is defense-in-depth: the release scripts are trusted, but a poisoned manifest
 * (cache, misconfig, supply-chain compromise) should not redirect users' browsers to an
 * attacker-controlled URL. If you self-host a dev updater, use the same apex for the
 * feed URL and the manifest `path:` — or relax this check in a fork.
 *
 * KNOWN LIMITATION: the last-two-labels heuristic does NOT consult the Public Suffix List,
 * so a feed hosted on a multi-part TLD like `foo.co.uk` would treat any `*.co.uk` as
 * "same apex" and accept `bar.co.uk` (unrelated customer). Fine for `accomplish.ai`, but
 * operators onboarding a `.co.uk` / `.com.br` / `.github.io` feed should replace this
 * heuristic with an explicit allowed-download-host policy before shipping.
 */

/** Returns true when both URLs parse, use the same scheme (no HTTP↔HTTPS downgrade),
 *  and share the same last-two-labels apex. */
export function isSameApex(candidate: string, reference: string): boolean {
  let candidateUrl: URL;
  let referenceUrl: URL;
  try {
    candidateUrl = new URL(candidate);
    referenceUrl = new URL(reference);
  } catch {
    return false;
  }
  // Scheme must match. A manifest from an HTTPS feed that points `path:` at
  // `http://downloads.accomplish.ai/...` would otherwise hand the user a
  // plaintext download URL — classic downgrade attack.
  if (candidateUrl.protocol !== referenceUrl.protocol) {
    return false;
  }
  const candidateHost = candidateUrl.hostname;
  const referenceHost = referenceUrl.hostname;
  // IP literals (v4 or v6) do not have a DNS apex — the last-two-labels rule would
  // accept `192.168.0.1` under a `127.0.0.1` feed (both "end with .0.1"). Require
  // exact hostname match for IPs. URL.hostname returns v6 addresses with brackets
  // stripped on some implementations but keeps them on others — detect via colon.
  if (isIpLiteral(referenceHost) || isIpLiteral(candidateHost)) {
    return candidateHost === referenceHost;
  }
  const apex = getApex(referenceHost);
  return candidateHost === apex || candidateHost.endsWith('.' + apex);
}

/** Relative manifest paths are trusted; absolute URLs must pass `isSameApex`. */
export function isTrustedManifestPath(candidate: string, feedUrl: string): boolean {
  const value = candidate.trim();
  if (!value) {
    return false;
  }
  // Protocol-relative URLs (`//evil.example.com/file`) are absolute in browsers
  // but do not parse without a base URL. Reject instead of treating as relative.
  if (value.startsWith('//')) {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return isSameApex(value, feedUrl);
  } catch {
    return true;
  }
}

/**
 * Validate every download URL electron-updater exposes in native UpdateInfo
 * before we allow `downloadUpdate()`.
 */
export function isTrustedUpdateInfo(
  info: {
    path?: unknown;
    files?: unknown;
  },
  feedUrl: string,
): boolean {
  const candidates: string[] = [];
  if (typeof info.path === 'string') {
    candidates.push(info.path);
  }
  if (Array.isArray(info.files)) {
    for (const file of info.files) {
      if (file && typeof file === 'object') {
        const url = (file as { url?: unknown }).url;
        if (typeof url === 'string') {
          candidates.push(url);
        }
      }
    }
  }
  return candidates.every((candidate) => isTrustedManifestPath(candidate, feedUrl));
}

function isIpLiteral(host: string): boolean {
  // IPv6 addresses always contain a colon; IPv4 dotted-quads are all numeric.
  return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function getApex(hostname: string): string {
  const labels = hostname.split('.');
  if (labels.length <= 2) {
    // 'localhost' or a bare apex like 'accomplish.ai' — use as-is.
    return hostname;
  }
  return labels.slice(-2).join('.');
}
