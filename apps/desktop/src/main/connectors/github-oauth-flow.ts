/**
 * GitHub / Google OAuth Flows
 *
 * desktop-github: reads existing gh CLI token; falls back to `gh auth login --web`.
 * desktop-google: delegates to the existing Google OAuth handler (no-op here).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { OAuthProviderId } from '@accomplish_ai/agent-core/common';
import { getConnectorAuthStore } from './connector-auth-registry';
import {
  setDesktopConnectorConnected,
  GH_BINARY_CANDIDATES,
  buildGhAugmentedPath,
} from './desktop-connector-state';
import type { ConnectorOAuthResult } from './connector-token-resolver';

const execFileAsync = promisify(execFile);

export async function performDesktopGoogleFlow(
  _providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  // Google OAuth is managed by the existing google-accounts infrastructure.
  // Return a no-op success — the Google connector card uses a separate auth flow.
  return { ok: true, accessToken: 'google-managed' };
}

export async function performDesktopGithubFlow(
  providerId: OAuthProviderId,
): Promise<ConnectorOAuthResult> {
  // Strategy: read existing gh CLI token first (research.md Decision 3)
  const ghPath = await findGhBinary();
  if (!ghPath) {
    return {
      ok: false,
      error: 'gh-not-found',
      message: 'GitHub CLI (gh) not found on PATH. Install it from https://cli.github.com',
    };
  }

  // GitHub always has a synthetic store in the registry; assert non-null.
  const store = getConnectorAuthStore(providerId)!;
  const augmentedEnv = { ...process.env, PATH: buildGhAugmentedPath() };

  // Try reading an existing token first
  try {
    const { stdout } = await execFileAsync(ghPath, ['auth', 'token'], {
      timeout: 10_000,
      env: augmentedEnv,
    });
    const token = stdout.trim();
    if (token) {
      // Persist token to SecureStorage so auth status survives restarts.
      store.setTokens({ accessToken: token, tokenType: 'bearer' }, Date.now());
      setDesktopConnectorConnected(providerId, true);
      return { ok: true, accessToken: token };
    }
  } catch {
    // Token not available — fall through to login
  }

  // No token — initiate login
  try {
    await execFileAsync(ghPath, ['auth', 'login', '--git-protocol', 'https', '--web'], {
      timeout: 120_000,
      env: augmentedEnv,
    });

    const { stdout } = await execFileAsync(ghPath, ['auth', 'token'], {
      timeout: 10_000,
      env: augmentedEnv,
    });
    const token = stdout.trim();
    if (token) {
      store.setTokens({ accessToken: token, tokenType: 'bearer' }, Date.now());
      setDesktopConnectorConnected(providerId, true);
      return { ok: true, accessToken: token };
    }

    setDesktopConnectorConnected(providerId, false);
    return {
      ok: false,
      error: 'oauth-failed',
      message: 'GitHub login succeeded but no token was retrieved',
    };
  } catch (err) {
    setDesktopConnectorConnected(providerId, false);
    return {
      ok: false,
      error: 'oauth-failed',
      message: err instanceof Error ? err.message : 'GitHub authentication failed',
    };
  }
}

async function findGhBinary(): Promise<string | null> {
  // Electron's main process PATH is minimal (no shell profile), so we must
  // probe common installation locations in addition to the raw PATH lookup.
  const augmentedEnv = { ...process.env, PATH: buildGhAugmentedPath() };
  for (const bin of GH_BINARY_CANDIDATES) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 5_000, env: augmentedEnv });
      return bin;
    } catch {
      // not found at this path
    }
  }
  return null;
}
