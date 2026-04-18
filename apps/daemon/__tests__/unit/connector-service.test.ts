import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import { ConnectorService } from '../../src/connector-service.js';

/**
 * Milestone 2 — ConnectorService is a pass-through to `ConnectorStorageAPI`.
 * The tests pin each method to its StorageAPI counterpart so M3 handler
 * repointing can trust the shape, and a later refactor can't silently
 * swap call targets.
 */
function makeStorageStub(): StorageAPI {
  return {
    getAllConnectors: vi.fn(() => []),
    getEnabledConnectors: vi.fn(() => []),
    getConnectorById: vi.fn(() => null),
    upsertConnector: vi.fn(),
    setConnectorEnabled: vi.fn(),
    setConnectorStatus: vi.fn(),
    deleteConnector: vi.fn(),
    storeConnectorTokens: vi.fn(),
    getConnectorTokens: vi.fn(() => null),
    deleteConnectorTokens: vi.fn(),
  } as unknown as StorageAPI;
}

describe('ConnectorService', () => {
  let storage: StorageAPI;
  let service: ConnectorService;

  beforeEach(() => {
    storage = makeStorageStub();
    service = new ConnectorService(storage);
  });

  it('list forwards to getAllConnectors and returns its result', () => {
    const rows = [{ id: 'slack' }] as never;
    vi.mocked(storage.getAllConnectors).mockReturnValue(rows);
    expect(service.list()).toBe(rows);
  });

  it('getEnabled forwards to getEnabledConnectors', () => {
    service.getEnabled();
    expect(storage.getEnabledConnectors).toHaveBeenCalledTimes(1);
  });

  it('getById forwards and returns null when the repo returns null', () => {
    vi.mocked(storage.getConnectorById).mockReturnValue(null);
    expect(service.getById('missing')).toBeNull();
    expect(storage.getConnectorById).toHaveBeenCalledWith('missing');
  });

  it('upsert / setEnabled / setStatus / delete forward their args verbatim', () => {
    const connector = { id: 'slack', enabled: true } as never;
    service.upsert(connector);
    service.setEnabled('slack', false);
    service.setStatus('slack', 'connected' as never);
    service.delete('slack');

    expect(storage.upsertConnector).toHaveBeenCalledWith(connector);
    expect(storage.setConnectorEnabled).toHaveBeenCalledWith('slack', false);
    expect(storage.setConnectorStatus).toHaveBeenCalledWith('slack', 'connected');
    expect(storage.deleteConnector).toHaveBeenCalledWith('slack');
  });

  it('storeTokens / getTokens / deleteTokens forward to the typed token API', () => {
    const tokens = { accessToken: 'a', refreshToken: 'r' } as never;
    service.storeTokens('slack', tokens);
    expect(storage.storeConnectorTokens).toHaveBeenCalledWith('slack', tokens);

    vi.mocked(storage.getConnectorTokens).mockReturnValue(tokens);
    expect(service.getTokens('slack')).toBe(tokens);
    expect(storage.getConnectorTokens).toHaveBeenCalledWith('slack');

    service.deleteTokens('slack');
    expect(storage.deleteConnectorTokens).toHaveBeenCalledWith('slack');
  });
});
