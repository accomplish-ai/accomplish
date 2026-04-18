import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import { SecretsService } from '../../src/secrets-service.js';

/**
 * Milestone 2 — SecretsService is a thin pass-through; the tests exist to
 * guarantee that every RPC-facing method reaches the same StorageAPI method
 * it documents, and no extra side-effects slip in later.
 */
function makeStorageStub(): StorageAPI {
  return {
    storeApiKey: vi.fn(),
    getApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    getAllApiKeys: vi.fn(async () => ({}) as Record<string, string | null>),
    hasAnyApiKey: vi.fn(async () => false),
    storeBedrockCredentials: vi.fn(),
    getBedrockCredentials: vi.fn(),
    clearSecureStorage: vi.fn(),
  } as unknown as StorageAPI;
}

describe('SecretsService', () => {
  let storage: StorageAPI;
  let service: SecretsService;

  beforeEach(() => {
    storage = makeStorageStub();
    service = new SecretsService(storage);
  });

  it('forwards storeApiKey to storage with provider + key', () => {
    service.storeApiKey('anthropic', 'sk-ant-test');
    expect(storage.storeApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test');
  });

  it('forwards getApiKey and returns the storage result', () => {
    vi.mocked(storage.getApiKey).mockReturnValue('sk-existing');
    expect(service.getApiKey('anthropic')).toBe('sk-existing');
    expect(storage.getApiKey).toHaveBeenCalledWith('anthropic');
  });

  it('forwards getApiKey and returns null when storage returns null', () => {
    vi.mocked(storage.getApiKey).mockReturnValue(null);
    expect(service.getApiKey('anthropic')).toBeNull();
  });

  it('forwards deleteApiKey and returns the storage boolean', () => {
    vi.mocked(storage.deleteApiKey).mockReturnValue(true);
    expect(service.deleteApiKey('openai')).toBe(true);
    expect(storage.deleteApiKey).toHaveBeenCalledWith('openai');
  });

  it('forwards getAllApiKeys (async) through to storage', async () => {
    vi.mocked(storage.getAllApiKeys).mockResolvedValue({ anthropic: 'sk-xyz', openai: null });
    await expect(service.getAllApiKeys()).resolves.toEqual({
      anthropic: 'sk-xyz',
      openai: null,
    });
  });

  it('forwards hasAnyApiKey (async) through to storage', async () => {
    vi.mocked(storage.hasAnyApiKey).mockResolvedValue(true);
    await expect(service.hasAnyApiKey()).resolves.toBe(true);
  });

  it('forwards storeBedrockCredentials with the raw payload', () => {
    service.storeBedrockCredentials('{"accessKeyId":"...","secretAccessKey":"..."}');
    expect(storage.storeBedrockCredentials).toHaveBeenCalledWith(
      '{"accessKeyId":"...","secretAccessKey":"..."}',
    );
  });

  it('forwards getBedrockCredentials and returns the storage map', () => {
    vi.mocked(storage.getBedrockCredentials).mockReturnValue({
      accessKeyId: 'AKIA',
      secretAccessKey: 'sekr3t',
    });
    expect(service.getBedrockCredentials()).toEqual({
      accessKeyId: 'AKIA',
      secretAccessKey: 'sekr3t',
    });
  });

  it('clear() forwards to storage.clearSecureStorage()', () => {
    service.clear();
    expect(storage.clearSecureStorage).toHaveBeenCalledTimes(1);
  });
});
