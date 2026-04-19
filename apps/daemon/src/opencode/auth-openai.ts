/**
 * Daemon-side OpenAI ChatGPT OAuth orchestration.
 *
 * Ports the SDK-based OAuth flow from commercial
 * `1a320029:apps/desktop/src/main/opencode/auth-browser.ts`. In commercial
 * the flow ran inside Electron main; in OSS it lives in the daemon because
 * the daemon owns `opencode serve` lifecycle (Phase 2 of the SDK cutover
 * port). Desktop keeps the Electron-only `shell.openExternal` step and
 * drives the two daemon RPCs.
 *
 * Phase 4a RPC protocol (registered in `daemon-routes.ts`):
 *   - `auth.openai.startLogin()` → `{ sessionId, authorizeUrl }`
 *   - `auth.openai.awaitCompletion({ sessionId, timeoutMs? })` → plan
 *   - `auth.openai.status()` → `{ connected, expires? }`
 *   - `auth.openai.getAccessToken()` → `string | null`
 *
 * The manager holds at most one in-flight session at a time (matches
 * commercial's `OAuthBrowserFlow` class). A second `startLogin` aborts the
 * first — typical when a user retries without explicitly cancelling.
 *
 * ---------------------------------------------------------------------------
 * OAuth flow — two-step contract with `opencode serve`
 * ---------------------------------------------------------------------------
 *
 * OpenCode's SDK exposes OAuth as TWO endpoints on the transient
 * `opencode serve`, and BOTH must be called:
 *
 *   1. `POST /provider/openai/oauth/authorize { method }`
 *      Server-side effect:
 *        - Binds an OAuth HTTP listener on `localhost:1455` (hardcoded in
 *          opencode, registered as the redirect URI with OpenAI's app).
 *        - Generates PKCE + state, stores a `pending[openai]` handle with
 *          a `callbackPromise` that resolves once `:1455/auth/callback`
 *          receives the browser redirect.
 *      Returns `{ url, method: "auto", instructions }`.
 *      Does NOT write `auth.json` yet.
 *
 *   2. Browser lands on `:1455/auth/callback?code=X`
 *        - opencode's handler fires `exchangeCodeForTokens(code)` async and
 *          RETURNS THE HTML SUCCESS PAGE IMMEDIATELY (user sees success).
 *        - Tokens sit in memory, awaiting a consumer.
 *      Still no `auth.json` write.
 *
 *   3. `POST /provider/openai/oauth/callback { method }`  ← THIS is what
 *      the prior implementation was missing. Until it is called, opencode
 *      holds the tokens unconsumed and `auth.json` is never updated.
 *      Server-side effect:
 *        - Awaits the pending `callbackPromise`.
 *        - Writes `auth.json` via `Auth.set('openai', { type: 'oauth',
 *          access, refresh, expires, accountId })`.
 *      Returns `true` on success.
 *
 * The pre-fix implementation called step 1 and then polled `auth.json`
 * mtime+hash for up to two minutes waiting for opencode to write it on its
 * own — which never happened. That produced the user-visible "browser
 * shows success, daemon hangs, at the end it fails" regression after the
 * PTY → SDK cutover.
 *
 * The current implementation invokes `client.provider.oauth.callback` and
 * lets opencode drive the completion. The 2-minute deadline is enforced on
 * our side to cap the wait (opencode's own internal `waitForOAuthCallback`
 * timer is 5 minutes).
 */

import { randomUUID } from 'node:crypto';
import {
  detectOpenAiOauthPlan,
  getOpenAiOauthAccessToken,
  getOpenAiOauthStatus,
  getOpenCodeAuthJsonPath,
  type OpenAiOauthPlan,
} from '@accomplish_ai/agent-core';
import type { OpencodeClient } from '@opencode-ai/sdk/v2';
import { log } from '../logger.js';
import { createTransientOpencodeClient, type ServerManagerDeps } from './server-manager.js';

const OPENAI_PROVIDER_ID = 'openai';
const OPENAI_AUTH_TIMEOUT_MS = 2 * 60_000;
const PREFERRED_OAUTH_LABEL = 'ChatGPT Pro/Plus';

class OAuthLoginError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = 'OAuthLoginError';
  }
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * Pick the OAuth-type auth method the SDK's `provider.auth` response lists
 * for OpenAI. Prefers the `ChatGPT Pro/Plus` label (matches commercial)
 * because that's the flow that produces an `openai.access` JWT from which
 * we decode the chatgpt_plan_type. Falls back to any oauth-type entry.
 */
function pickOauthMethodIndex(methods: Array<{ type: 'oauth' | 'api'; label: string }>): number {
  const preferred = methods.findIndex(
    (m) => m.type === 'oauth' && m.label === PREFERRED_OAUTH_LABEL,
  );
  if (preferred !== -1) return preferred;
  const anyOauth = methods.findIndex((m) => m.type === 'oauth');
  if (anyOauth !== -1) return anyOauth;
  throw new OAuthLoginError('OpenAI authentication is not available in this OpenCode runtime.');
}

interface ActiveSession {
  sessionId: string;
  abortController: AbortController;
  authorizeUrl: string;
  /** Promise that resolves when the SDK-reported OAuth completes (or rejects on timeout/abort). */
  completion: Promise<OpenAiOauthPlan>;
  runtime: { close: () => void };
}

export class OpenAiOauthManager {
  private active: ActiveSession | null = null;
  private disposed = false;

  constructor(private readonly deps: ServerManagerDeps) {}

  /**
   * Start a new OAuth flow. Spawns a transient `opencode serve`, asks the
   * SDK for OpenAI auth methods, issues the oauth.authorize request, and
   * returns the authorize URL plus a session handle. Desktop's IPC handler
   * is expected to then call `shell.openExternal(authorizeUrl)` and
   * follow with `awaitCompletion(sessionId)`.
   *
   * The `oauth.callback` RPC is issued in the background (inside `completion`)
   * so that `awaitCompletion` can surface its resolution to the caller.
   *
   * If a prior session is still active it is aborted — users who click the
   * sign-in button twice should get the fresher flow.
   */
  async startLogin(): Promise<{ sessionId: string; authorizeUrl: string }> {
    if (this.disposed) {
      throw new OAuthLoginError('OAuth manager is disposed.');
    }

    if (this.active) {
      log.info('[auth.openai] Aborting prior in-flight session before starting a new one');
      this.abortActive();
    }

    const sessionId = randomUUID();
    const abortController = new AbortController();
    const signal = abortController.signal;

    log.info(
      `[auth.openai] startLogin sessionId=${sessionId.slice(0, 8)} — spawning transient runtime`,
    );

    // Stand up a transient opencode serve for the duration of this flow.
    const runtime = await createTransientOpencodeClient(this.deps, signal);
    if (signal.aborted) {
      runtime.close();
      throw abortError('OpenAI authentication was cancelled.');
    }
    log.info('[auth.openai] Transient runtime ready, querying provider auth methods');

    // Query available methods, pick an oauth entry.
    const authResult = await runtime.client.provider.auth();
    const methods = (
      authResult.data as Record<string, Array<{ type: 'oauth' | 'api'; label: string }>> | undefined
    )?.[OPENAI_PROVIDER_ID];
    if (!methods || methods.length === 0) {
      runtime.close();
      throw new OAuthLoginError('OpenAI authentication is not available in this OpenCode runtime.');
    }
    log.info(
      `[auth.openai] Provider methods: ${methods.map((m) => `${m.type}:${m.label}`).join(', ')}`,
    );

    // The current SDK's provider.oauth.authorize signature:
    //   (parameters: { providerID, method?, directory?, workspace?, inputs? }, options?)
    //   → { data?: { url?: string } }
    // Commercial 1a320029 was written against an earlier SDK that used
    // `{ path, body }`; the current SDK shape folds those into flat parameters.
    const methodIndex = pickOauthMethodIndex(methods);
    log.info(`[auth.openai] Calling oauth.authorize with method index ${methodIndex}`);
    const authorize = await runtime.client.provider.oauth.authorize({
      providerID: OPENAI_PROVIDER_ID,
      method: methodIndex,
    });

    const authorizeUrl = (authorize.data as { url?: string } | undefined)?.url;
    if (!authorizeUrl) {
      runtime.close();
      throw new OAuthLoginError('OpenAI authentication did not return an authorization URL.');
    }
    log.info(
      `[auth.openai] Authorize URL ready (${authorizeUrl.slice(0, 80)}...). ` +
        `Arming provider.oauth.callback and waiting for browser completion at localhost:1455.`,
    );

    // Drive the completion side of the two-step OAuth contract. The
    // `oauth.callback` RPC blocks server-side until the user finishes the
    // browser flow and opencode has written auth.json; resolving that
    // promise is what lets `awaitCompletion` return to the caller.
    const deadline = Date.now() + OPENAI_AUTH_TIMEOUT_MS;
    const completion: Promise<OpenAiOauthPlan> = (async () => {
      try {
        await Promise.race([
          // The SDK's Options type does not declare `signal`, but the
          // underlying fetch layer accepts it — same pattern we use in
          // OpenCodeAdapter.runEventSubscription.
          runtime.client.provider.oauth.callback(
            { providerID: OPENAI_PROVIDER_ID, method: methodIndex },
            { throwOnError: true, signal } as unknown as Parameters<
              OpencodeClient['provider']['oauth']['callback']
            >[1],
          ),
          new Promise<never>((_resolve, reject) => {
            const remaining = Math.max(0, deadline - Date.now());
            const timer = setTimeout(
              () =>
                reject(new OAuthLoginError('OpenAI authentication timed out. Please try again.')),
              remaining,
            );
            const onAbort = (): void => {
              clearTimeout(timer);
              reject(abortError('OpenAI authentication was cancelled.'));
            };
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
          }),
        ]);
        log.info('[auth.openai] oauth.callback resolved — reading plan from auth.json');
        return await detectOpenAiOauthPlan({ authStatePath: getOpenCodeAuthJsonPath() });
      } finally {
        // Tear down the transient runtime once the flow resolves or aborts —
        // regardless of success. Guard against double-close.
        try {
          runtime.close();
        } catch {
          /* ignore */
        }
        if (this.active?.sessionId === sessionId) {
          this.active = null;
        }
      }
    })();
    // Attach a no-op rejection handler so a rejection here (abort after
    // dispose, timeout with no waiting caller) never surfaces as an
    // unhandled rejection on the process. The real rejection still
    // propagates to whoever is awaiting via `awaitCompletion`.
    completion.catch(() => {});

    this.active = {
      sessionId,
      abortController,
      authorizeUrl,
      completion,
      runtime,
    };

    return { sessionId, authorizeUrl };
  }

  /**
   * Block until the given session's flow completes, times out, or is aborted.
   * Returns `{ ok: true, plan }` on success, `{ ok: false, error }` on
   * failure. A `timeoutMs` shorter than the internal deadline may be
   * supplied; it caps how long the RPC call blocks rather than changing the
   * flow's own deadline (the 2-minute window is enforced inside `startLogin`).
   */
  async awaitCompletion(params: {
    sessionId: string;
    timeoutMs?: number;
  }): Promise<{ ok: true; plan: OpenAiOauthPlan } | { ok: false; error: string }> {
    const session = this.active;
    if (!session || session.sessionId !== params.sessionId) {
      return { ok: false, error: 'No matching in-flight OAuth session.' };
    }

    const timeoutMs = params.timeoutMs ?? OPENAI_AUTH_TIMEOUT_MS;
    try {
      const plan = await Promise.race([
        session.completion,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new OAuthLoginError('awaitCompletion RPC timed out.')),
            timeoutMs,
          );
        }),
      ]);
      return { ok: true, plan };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Non-flow status read — delegates to the agent-core helper. */
  status(): { connected: boolean; expires?: number } {
    return getOpenAiOauthStatus();
  }

  /** Return the current access token from the OAuth state file, or null. */
  getAccessToken(): string | null {
    return getOpenAiOauthAccessToken();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortActive();
  }

  private abortActive(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.abortController.abort();
    try {
      active.runtime.close();
    } catch {
      /* ignore */
    }
  }
}
