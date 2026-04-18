/**
 * SecretsService — thin wrapper around the daemon's `SecureStorageAPI` surface.
 *
 * Milestone 2 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Exposes the read/write API for the encrypted `secure-storage.json` so the
 * desktop can route secret ops through the daemon. Main is the only writer
 * post-M3; this service is the endpoint. No events — secrets aren't
 * subscribed to by the renderer, and the few places that need to react to a
 * secret change already go through explicit IPC calls.
 *
 * NOTE: only exposes API-key / Bedrock / clear operations. The low-level
 * generic `set`/`get` on `SecureStorageAPI` is intentionally NOT proxied —
 * callers should use the typed methods so we keep a clean contract and can
 * reason about which keys live in the encrypted file.
 */
import type { StorageAPI } from '@accomplish_ai/agent-core';

export class SecretsService {
  constructor(private readonly storage: StorageAPI) {}

  storeApiKey(provider: string, apiKey: string): void {
    this.storage.storeApiKey(provider, apiKey);
  }

  getApiKey(provider: string): string | null {
    return this.storage.getApiKey(provider);
  }

  deleteApiKey(provider: string): boolean {
    return this.storage.deleteApiKey(provider);
  }

  async getAllApiKeys(): Promise<Record<string, string | null>> {
    return this.storage.getAllApiKeys();
  }

  async hasAnyApiKey(): Promise<boolean> {
    return this.storage.hasAnyApiKey();
  }

  storeBedrockCredentials(credentials: string): void {
    this.storage.storeBedrockCredentials(credentials);
  }

  getBedrockCredentials(): Record<string, string> | null {
    return this.storage.getBedrockCredentials();
  }

  clear(): void {
    this.storage.clearSecureStorage();
  }
}
