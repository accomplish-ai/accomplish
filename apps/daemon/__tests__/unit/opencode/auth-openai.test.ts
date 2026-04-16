import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the OpenAI OAuth RPC round-trip.
 *
 * Post-regression-fix: the manager now drives the two-step OpenCode OAuth
 * contract — `client.provider.oauth.authorize` followed by
 * `client.provider.oauth.callback`. The second call is what makes opencode
 * serve consume the pending browser redirect, exchange the code, and persist
 * tokens to `auth.json`. The prior implementation polled `auth.json` mtime
 * instead of calling `callback`, which left the tokens unconsumed and every
 * OAuth attempt hanging for two minutes before timing out.
 *
 * These tests pin the new contract. `client.provider.oauth.callback` is a
 * manually-resolved Promise so tests can simulate the browser completing,
 * timing out, or being aborted mid-flight.
 */

let connected = false;
let mockExpires: number | undefined = undefined;
let oauthPlanValue: 'free' | 'paid' = 'paid';

vi.mock('@accomplish_ai/agent-core', () => ({
  detectOpenAiOauthPlan: vi.fn(async () => oauthPlanValue),
  getOpenAiOauthAccessToken: vi.fn(() => (connected ? 'sk-fake-token' : null)),
  getOpenAiOauthStatus: vi.fn(() =>
    connected ? { connected: true, expires: mockExpires } : { connected: false },
  ),
  getOpenCodeAuthJsonPath: vi.fn(() => '/tmp/fake-auth.json'),
}));

vi.mock('../../../src/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const transientCloseMock = vi.fn();
const providerAuthMock = vi.fn(async () => ({
  data: {
    openai: [
      { type: 'oauth' as const, label: 'ChatGPT Pro/Plus' },
      { type: 'api' as const, label: 'API Key' },
    ],
  },
}));
const oauthAuthorizeMock = vi.fn(async () => ({
  data: { url: 'https://auth.openai.com/login?client_id=fake' },
}));

/**
 * Test handle for the oauth.callback RPC. Each `startLogin` creates a new
 * Promise that the test can resolve (browser finished), reject (opencode
 * reported an error), or leave pending (user still in browser → exercises
 * timeout/abort paths). A fresh handle is minted at the top of every
 * `beforeEach` so tests don't share state.
 */
interface CallbackHandle {
  resolve: () => void;
  reject: (err: unknown) => void;
  signal?: AbortSignal;
}
let pendingCallback: CallbackHandle | null = null;
const oauthCallbackMock = vi.fn(async (_params: unknown, options?: { signal?: AbortSignal }) => {
  return new Promise<{ data: boolean }>((resolve, reject) => {
    pendingCallback = {
      resolve: () => resolve({ data: true }),
      reject,
      signal: options?.signal,
    };
    // Propagate aborts so the manager's completion promise rejects when the
    // AbortController is tripped. Mirrors real fetch-layer behaviour.
    options?.signal?.addEventListener(
      'abort',
      () => {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        reject(err);
      },
      { once: true },
    );
  });
});

vi.mock('../../../src/opencode/server-manager.js', () => ({
  createTransientOpencodeClient: vi.fn(async () => ({
    client: {
      provider: {
        auth: providerAuthMock,
        oauth: {
          authorize: oauthAuthorizeMock,
          callback: oauthCallbackMock,
        },
      },
    },
    close: transientCloseMock,
  })),
}));

// Import the manager AFTER the mocks so it picks them up.
const { OpenAiOauthManager } = await import('../../../src/opencode/auth-openai.js');

describe('OpenAiOauthManager', () => {
  beforeEach(() => {
    connected = false;
    mockExpires = undefined;
    oauthPlanValue = 'paid';
    pendingCallback = null;
    transientCloseMock.mockClear();
    providerAuthMock.mockClear();
    oauthAuthorizeMock.mockClear();
    oauthCallbackMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startLogin returns a sessionId + authorizeUrl from the SDK', async () => {
    const manager = new OpenAiOauthManager({} as never);

    const { sessionId, authorizeUrl } = await manager.startLogin();

    expect(sessionId).toMatch(/^[0-9a-f-]{30,}$/i);
    expect(authorizeUrl).toBe('https://auth.openai.com/login?client_id=fake');
    expect(providerAuthMock).toHaveBeenCalledOnce();
    expect(oauthAuthorizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: 'openai', method: 0 }),
    );
    // Pins the fix for the post-SDK-cutover regression: `startLogin` must
    // issue the two-step OAuth contract — authorize FOLLOWED BY callback.
    // Without the callback RPC, opencode holds the browser-redirect tokens
    // in memory forever and never writes auth.json, causing the user-visible
    // "success page, then hang" failure mode.
    expect(oauthCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerID: 'openai', method: 0 }),
      expect.any(Object),
    );

    manager.dispose();
    expect(transientCloseMock).toHaveBeenCalled();
  });

  it('awaitCompletion resolves with { ok: true, plan } once oauth.callback resolves', async () => {
    const manager = new OpenAiOauthManager({} as never);
    oauthPlanValue = 'paid';

    const { sessionId } = await manager.startLogin();

    // Simulate the user finishing the browser flow — opencode's internal
    // handler fires the exchange, writes auth.json, and the callback RPC
    // resolves. A short setTimeout mimics the real-world delay between
    // startLogin returning and the user clicking through the browser.
    setTimeout(() => {
      pendingCallback?.resolve();
    }, 20);

    const result = await manager.awaitCompletion({ sessionId, timeoutMs: 5_000 });

    expect(result).toEqual({ ok: true, plan: 'paid' });
    expect(transientCloseMock).toHaveBeenCalled();
  });

  it('propagates the AbortSignal into the oauth.callback RPC', async () => {
    // The callback RPC blocks server-side for up to 5 minutes (opencode's
    // internal waitForOAuthCallback timeout). Without propagating our
    // AbortSignal, disposing the manager or superseding the session would
    // leave the RPC in flight on the old transient runtime, which doesn't
    // get torn down cleanly. This test pins that the manager's
    // abortController.signal reaches the SDK's options.signal.
    const manager = new OpenAiOauthManager({} as never);
    await manager.startLogin();

    expect(pendingCallback).not.toBeNull();
    expect(pendingCallback?.signal).toBeInstanceOf(AbortSignal);
    expect(pendingCallback?.signal?.aborted).toBe(false);

    manager.dispose();

    expect(pendingCallback?.signal?.aborted).toBe(true);
  });

  it('awaitCompletion returns { ok: false } when the caller timeoutMs fires before the flow completes', async () => {
    const manager = new OpenAiOauthManager({} as never);

    const { sessionId } = await manager.startLogin();
    // Never resolve the callback — the user is still in the browser. The
    // internal 2-minute deadline would eventually fire, but the caller-
    // supplied timeoutMs aborts this RPC call sooner.
    const result = await manager.awaitCompletion({ sessionId, timeoutMs: 50 });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/timed out/i);
    }

    manager.dispose();
  });

  it('awaitCompletion surfaces opencode-side callback errors verbatim', async () => {
    // If opencode rejects the callback RPC (bad code exchange, provider
    // error, user cancelled mid-browser), the manager should propagate the
    // failure rather than hang. The 2-minute internal deadline is for the
    // *caller not finishing* case; an SDK-side error must short-circuit.
    const manager = new OpenAiOauthManager({} as never);
    const { sessionId } = await manager.startLogin();

    setTimeout(() => {
      pendingCallback?.reject(new Error('oauth exchange failed: 400 bad_verification_code'));
    }, 10);

    const result = await manager.awaitCompletion({ sessionId, timeoutMs: 5_000 });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/bad_verification_code/);
    }

    manager.dispose();
  });

  it('startLogin aborts the prior active session when called twice', async () => {
    const manager = new OpenAiOauthManager({} as never);

    const first = await manager.startLogin();
    const firstSignal = pendingCallback?.signal;
    // Second startLogin should abort the first session's runtime AND the
    // first session's in-flight callback RPC.
    const second = await manager.startLogin();

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(firstSignal?.aborted).toBe(true);
    expect(transientCloseMock).toHaveBeenCalled();

    manager.dispose();
  });

  it('awaitCompletion rejects unknown sessionIds without crashing', async () => {
    const manager = new OpenAiOauthManager({} as never);

    const result = await manager.awaitCompletion({
      sessionId: 'nonexistent',
      timeoutMs: 100,
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/No matching/i) });
    manager.dispose();
  });

  it('status() and getAccessToken() read through the agent-core helpers', async () => {
    const manager = new OpenAiOauthManager({} as never);

    expect(manager.status()).toEqual({ connected: false });
    expect(manager.getAccessToken()).toBeNull();

    connected = true;
    const status = manager.status();
    expect(status.connected).toBe(true);
    expect(manager.getAccessToken()).toBe('sk-fake-token');

    manager.dispose();
  });
});
