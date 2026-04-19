/**
 * Manual update-check orchestrator for platforms without native electron-updater:
 *   - Windows (NSIS one-click; native path fetches `latest.yml`, not the
 *     `latest-win.yml` our release contract publishes)
 *   - Linux without APPIMAGE (deb users, extracted tarballs, distro packages)
 *
 * Contract: never throws. Every failure path routes through `trackUpdateFailed(...)`
 * and (for non-silent checks) a user-visible error dialog. A menu click cannot
 * produce an unhandled rejection even if the feed URL is malformed or the
 * manifest is corrupt.
 *
 * Pure helpers live in ./versioning to keep this file focused on the I/O orchestrator.
 */

import http from 'http';
import https from 'https';
import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { gt as semverGt } from 'semver';
import {
  trackUpdateAvailable,
  trackUpdateCheck,
  trackUpdateFailed,
  trackUpdateNotAvailable,
} from '../analytics/events';
import {
  showManualUpdateDialog,
  showNoUpdatesDialog,
  showUpdateCheckFailedDialog,
} from './dialogs';
import { getFeedUrl, getManifestName } from './feed-config';
import { log } from './logger';
import { isTrustedManifestPath } from './origin';
import { recordCheckedNow } from './store';
import { normalizeVersion, parseManifest } from './versioning';

/**
 * GET the manifest body; resolves null on any failure (non-200, network error,
 * malformed URL that causes `get()` to throw synchronously). Never throws.
 */
async function fetchManifest(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const get = url.startsWith('http://') ? http.get : https.get;
    let req;
    try {
      req = get(url, (res) => {
        if (res.statusCode !== 200) {
          log('WARN', '[Updater] Manifest fetch non-200', { url, statusCode: res.statusCode });
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      });
    } catch (error) {
      log('ERROR', '[Updater] Manifest fetch threw synchronously', {
        url,
        err: String(error),
      });
      resolve(null);
      return;
    }
    req.on('error', (error) => {
      log('ERROR', '[Updater] Manifest fetch failed', { url, err: String(error) });
      resolve(null);
    });
  });
}

/** Consolidated failure-branch: track + log + optional Sentry + optional dialog. */
async function reportFailure(
  errorType: 'fetch_failed' | 'invalid_manifest' | 'invalid_version',
  detail: string,
  silent: boolean,
  sentryPhase?: 'parse' | 'version',
): Promise<void> {
  trackUpdateFailed(errorType, detail);
  log('WARN', `[Updater] ${errorType}`, { detail });
  if (sentryPhase) {
    Sentry.captureMessage(`Update check: ${errorType}`, {
      tags: { component: 'updater', phase: sentryPhase },
    });
  }
  if (!silent) {
    await showUpdateCheckFailedDialog();
  }
}

/**
 * User-initiated (silent=false) or startup auto-check (silent=true) path for
 * Windows / non-AppImage Linux. Never throws. On success, records the check so
 * `shouldAutoCheck()` throttles to once per day across all platforms.
 */
export async function checkForUpdatesManual(
  silent: boolean,
  platform: 'win' | 'linux',
  arch?: 'x64' | 'arm64',
): Promise<void> {
  const feedUrl = getFeedUrl();
  if (!feedUrl) {
    return;
  }

  const manifestName = getManifestName(platform, arch);
  const manifestUrl = `${feedUrl}/${manifestName}`;
  const currentVersion = app.getVersion();

  trackUpdateCheck();

  const raw = await fetchManifest(manifestUrl);
  if (raw === null) {
    await reportFailure('fetch_failed', `Could not fetch ${manifestUrl}`, silent);
    return;
  }

  const info = parseManifest(raw);
  if (!info) {
    await reportFailure('invalid_manifest', `Could not parse ${manifestUrl}`, silent, 'parse');
    return;
  }

  const remoteNorm = normalizeVersion(info.version);
  if (!remoteNorm) {
    // Manifest returned something we can't turn into a version — treat as a
    // manifest bug, not "no update". Tracked separately so release-ops can tell
    // "no-one on old versions" from "release shipped broken manifest".
    await reportFailure(
      'invalid_version',
      `Unparseable remote version: ${info.version}`,
      silent,
      'version',
    );
    return;
  }

  const isAbsolute = info.path.startsWith('http://') || info.path.startsWith('https://');
  if (!isTrustedManifestPath(info.path, feedUrl)) {
    // Manifest points at an absolute URL outside the feed's apex domain. Treat
    // as a poisoned manifest — don't hand the URL to the user's browser, AND
    // don't record the daily throttle: the server may fix the manifest soon
    // and we want the next launch to retry.
    await reportFailure(
      'invalid_manifest',
      `Manifest path origin does not match feed URL: ${info.path}`,
      silent,
      'parse',
    );
    return;
  }

  // Manifest fetched, parsed, version+origin validated — reset the daily throttle
  // so autoCheckForUpdates won't re-hit the server on every launch.
  recordCheckedNow();

  const currentNorm = normalizeVersion(currentVersion);
  if (!currentNorm) {
    // Current app version somehow unparseable. Don't show a user-facing dialog
    // (our bug, not theirs) but do track so we can catch it in analytics.
    trackUpdateFailed('invalid_version', `Unparseable local version: ${currentVersion}`);
    return;
  }

  if (!semverGt(remoteNorm, currentNorm)) {
    trackUpdateNotAvailable();
    if (!silent) {
      await showNoUpdatesDialog();
    }
    return;
  }

  const downloadUrl = isAbsolute ? info.path : `${feedUrl}/${info.path}`;

  trackUpdateAvailable(currentVersion, info.version);
  log('INFO', '[Updater] Manual update available', {
    currentVersion,
    newVersion: info.version,
    downloadUrl,
  });
  await showManualUpdateDialog(currentVersion, info.version, downloadUrl);
}
