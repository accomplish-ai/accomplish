import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  discoverOAuthProtectedResourceMetadata,
  buildAuthorizationUrl,
} from '../../src/connectors/mcp-oauth.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverOAuthProtectedResourceMetadata', () => {
  it('follows the resource_metadata URL from the 401 challenge', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer resource_metadata="https://mcp.slack.com/.well-known/oauth-protected-resource"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            resource: 'https://mcp.slack.com',
            scopes_supported: ['chat:write'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      discoverOAuthProtectedResourceMetadata('https://mcp.slack.com/mcp'),
    ).resolves.toEqual({
      resource: 'https://mcp.slack.com',
      authorizationServers: undefined,
      bearerMethodsSupported: undefined,
      scopesSupported: ['chat:write'],
      resourceName: undefined,
      resourceDocumentation: undefined,
    });
  });

  it('throws when the 401 challenge does not advertise resource metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="example"',
          },
        }),
      ),
    );

    await expect(
      discoverOAuthProtectedResourceMetadata('https://mcp.slack.com/mcp'),
    ).rejects.toThrow(
      'Failed to discover protected resource metadata for https://mcp.slack.com/mcp',
    );
  });
});

describe('buildAuthorizationUrl', () => {
  it('includes additional OAuth parameters when provided', () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://slack.com/oauth/v2_user/authorize',
        clientId: 'client-id',
        redirectUri: 'http://localhost:3118/callback',
        codeChallenge: 'challenge',
        state: 'state-123',
        scope: 'chat:write users:read',
        extraParams: {
          resource: 'https://mcp.slack.com/',
        },
      }),
    );

    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3118/callback');
    expect(url.searchParams.get('resource')).toBe('https://mcp.slack.com/');
  });
});
