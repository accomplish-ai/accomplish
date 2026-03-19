import { describe, it, expect, afterEach } from 'vitest';
import { createOAuthCallbackServer, type OAuthCallbackServer } from '@main/oauth-callback-server';

describe('createOAuthCallbackServer', () => {
  let server: OAuthCallbackServer | undefined;

  async function startServer(): Promise<OAuthCallbackServer> {
    const s = await createOAuthCallbackServer();
    server = s;
    s.waitForCallback().catch(() => {});
    return s;
  }

  afterEach(() => {
    server?.shutdown();
    server = undefined;
  });

  it('should bind to 127.0.0.1 and return a redirect URI', async () => {
    await startServer();
    expect(server!.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it('should resolve with code and state on valid callback', async () => {
    const s = await createOAuthCallbackServer();
    const resultPromise = s.waitForCallback();

    const res = await fetch(`${s.redirectUri}?code=test-code&state=test-state`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Authentication successful');

    const result = await resultPromise;
    expect(result.code).toBe('test-code');
    expect(result.state).toBe('test-state');
    expect(result.redirectUri).toBe(s.redirectUri);
  });

  it('should return 400 when code or state is missing', async () => {
    const s = await startServer();

    const res = await fetch(`${s.redirectUri}?code=only-code`);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Authentication failed');
  });

  it('should return 404 for non-callback paths', async () => {
    const s = await startServer();
    const port = s.redirectUri.match(/:(\d+)\//)?.[1];
    const res = await fetch(`http://127.0.0.1:${port}/other`);
    expect(res.status).toBe(404);
  });

  it('shutdown should reject the callback promise', async () => {
    const s = await createOAuthCallbackServer();
    const resultPromise = s.waitForCallback();
    s.shutdown();
    await expect(resultPromise).rejects.toThrow('OAuth callback server shut down');
  });

  it('shutdown should be idempotent', async () => {
    const s = await startServer();
    s.shutdown();
    expect(() => s.shutdown()).not.toThrow();
    server = undefined;
  });

  it('should only bind to 127.0.0.1', async () => {
    const s = await startServer();
    expect(s.redirectUri).toContain('127.0.0.1');
    expect(s.redirectUri).not.toContain('0.0.0.0');
    expect(s.redirectUri).not.toContain('localhost');
  });

  it('should support a localhost callback path override', async () => {
    const s = await createOAuthCallbackServer({
      host: 'localhost',
      callbackPath: '/callback',
    });
    server = s;
    s.waitForCallback().catch(() => {});

    expect(s.redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);
  });

  it('should reject the callback promise when OAuth returns an error', async () => {
    const s = await createOAuthCallbackServer();
    server = s;
    const resultPromise = s.waitForCallback();
    resultPromise.catch(() => {});

    const res = await fetch(
      `${s.redirectUri}?error=access_denied&error_description=user%20cancelled`,
    );
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('user cancelled');

    await expect(resultPromise).rejects.toThrow('user cancelled');
  });
});
