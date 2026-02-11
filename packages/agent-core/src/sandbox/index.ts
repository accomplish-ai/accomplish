// Sandbox module - forked from @anthropic-ai/sandbox-runtime
// Provides OS-level filesystem and network restrictions for sandboxed process execution

export { SandboxManager } from './sandbox-manager.js'
export type {
  SandboxRuntimeConfig,
  NetworkConfig,
  FilesystemConfig,
} from './sandbox-config.js'
export type {
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  NetworkRestrictionConfig,
  SandboxAskCallback,
} from './sandbox-schemas.js'
export { SandboxViolationStore } from './sandbox-violation-store.js'
export {
  generateSeccompFilter,
  getPreGeneratedBpfPath,
  getApplySeccompBinaryPath,
  cleanupSeccompFilter,
} from './generate-seccomp-filter.js'
export { getDefaultWritePaths } from './sandbox-utils.js'
export { getWslVersion } from './utils/platform.js'
export type { Platform } from './utils/platform.js'

// Accomplish integration layer
export {
  initializeSandbox,
  isSandboxActive,
  wrapCommand,
  cleanupAfterTask,
  updateSandboxConfig,
  shutdownSandbox,
} from './accomplish-sandbox.js'
export {
  buildAccomplishSandboxConfig,
  DEFAULT_ALLOWED_DOMAINS,
} from './accomplish-sandbox-config.js'
export type { AccomplishSandboxOptions } from './accomplish-sandbox-config.js'
