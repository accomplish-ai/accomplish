import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import { getOpenAiOauthAccessToken } from '../../../src/opencode/auth.js';

vi.mock('fs');

const mockFs = vi.mocked(fs);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getOpenAiOauthAccessToken', () => {
  it('returns null when auth file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(getOpenAiOauthAccessToken()).toBeNull();
  });

  it('returns null when openai entry is missing', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({}));
    expect(getOpenAiOauthAccessToken()).toBeNull();
  });

  it('returns null when openai entry is not oauth type', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ openai: { type: 'api_key', key: 'sk-test' } }),
    );
    expect(getOpenAiOauthAccessToken()).toBeNull();
  });

  it('returns null when oauth entry has no access token', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ openai: { type: 'oauth', refresh: 'rt_123' } }),
    );
    expect(getOpenAiOauthAccessToken()).toBeNull();
  });

  it('returns the access token when oauth entry is valid', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ openai: { type: 'oauth', access: 'at_abc123', refresh: 'rt_xyz' } }),
    );
    expect(getOpenAiOauthAccessToken()).toBe('at_abc123');
  });

  it('returns null when access token is an empty string', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ openai: { type: 'oauth', access: '   ', refresh: 'rt_xyz' } }),
    );
    expect(getOpenAiOauthAccessToken()).toBeNull();
  });
});
