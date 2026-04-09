/**
 * Narrow type-only entrypoint for @accomplish/llm-gateway-client.
 *
 * The private gateway client package imports types from agent-core for
 * the AccomplishRuntime interface. This entrypoint re-exports ONLY the
 * types needed — it does NOT pull in storage, database, or validation
 * modules that would require better-sqlite3/zod at type-resolution time.
 *
 * Usage in llm-gateway-client:
 *   import type { AccomplishRuntime } from '@accomplish_ai/agent-core/runtime-types';
 *
 * Exposed via package.json exports:
 *   "./runtime-types": "./dist/accomplish-runtime-types.js"
 */

export type {
  AccomplishRuntime,
  StorageDeps,
  AccomplishConnectResult,
} from './opencode/accomplish-runtime.js';

export type { CreditUsage } from './common/types/gateway.js';

export type { ProviderBuildResult } from './opencode/config-provider-context.js';
