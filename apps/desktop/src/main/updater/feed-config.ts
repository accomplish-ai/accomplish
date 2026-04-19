/**
 * Feed URL + manifest-name resolution for the auto-updater.
 *
 * URL comes from build-config (`ACCOMPLISH_UPDATER_URL`, CI-injected in Free builds
 * or opt-in via .env in dev). Manifest names are hardcoded per the accomplish-release
 * upload contract — do not parameterize.
 *
 * See: accomplish-release/scripts/upload-r2-{windows,macos,linux}.sh
 */

import { getBuildConfig } from '../config/build-config';

/**
 * Feed URL with trailing slashes trimmed so `${url}/${manifest}` never emits a
 * double-slash (some CDNs tolerate it; some don't). Returns '' when not configured.
 */
export function getFeedUrl(): string {
  const url = getBuildConfig().accomplishUpdaterUrl;
  return url.replace(/\/+$/, '');
}

/**
 * Manifest filenames as published by accomplish-release. DO NOT parameterize —
 * the names are fixed by the upload contract (channel is encoded in the URL path
 * prefix, not the filename).
 *
 * - Windows:  always `latest-win.yml`
 * - Linux x64: `latest-linux.yml`
 * - Linux arm64: `latest-linux-arm64.yml` (electron-updater's arch-suffix convention)
 *
 * macOS is served by the native electron-updater path, which derives the filename
 * internally (`latest-mac.yml` with default `'latest'` channel) — this helper is
 * NOT used for mac.
 */
export function getManifestName(platform: 'win' | 'linux', arch?: 'x64' | 'arm64'): string {
  if (platform === 'win') {
    return 'latest-win.yml';
  }
  if (arch === 'arm64') {
    return 'latest-linux-arm64.yml';
  }
  return 'latest-linux.yml';
}
