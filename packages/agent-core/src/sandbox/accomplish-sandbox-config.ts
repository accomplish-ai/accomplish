import { homedir } from 'node:os'
import path from 'node:path'
import type { SandboxRuntimeConfig } from './sandbox-config.js'
import { getDefaultWritePaths } from './sandbox-utils.js'

export interface AccomplishSandboxOptions {
  /** Working directory for the task (added to allowWrite) */
  workingDirectory?: string
  /** Full effective list of allowed domains */
  allowedDomains?: string[]
  /** Additional domains to allow network access to */
  additionalAllowedDomains?: string[]
  /** Additional paths to allow writing to */
  additionalAllowWrite?: string[]
  /** Paths to deny reading from */
  additionalDenyRead?: string[]
  /** Allow PTY operations (required for PTY-based CLI, defaults to true) */
  allowPty?: boolean
  /** Allow binding to local ports (defaults to true) */
  allowLocalBinding?: boolean
  /** Allow all Unix sockets (defaults to true) */
  allowAllUnixSockets?: boolean
  /** Enable weaker nested sandbox mode for Docker environments */
  enableWeakerNestedSandbox?: boolean
}

export const DEFAULT_ALLOWED_DOMAINS = [
  // LLM providers
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'api.deepseek.com',
  'api.moonshot.cn',
  'openrouter.ai',
  // Cloud providers (for Bedrock, Azure OpenAI, etc.)
  '*.amazonaws.com',
  '*.azure.com',
  '*.openai.azure.com',
  // Source control & package registries
  'github.com',
  '*.github.com',
  '*.npmjs.org',
  'registry.npmjs.org',
  'pypi.org',
  '*.pypi.org',
]

const DEFAULT_DENY_WRITE_WITHIN_ALLOW = [
  // Protect sensitive config files from being modified
  '~/.claude/settings.json',
  '~/.claude/settings.local.json',
  '~/.claude/hooks',
  '~/.claude/hooks/**',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks',
  '.claude/hooks/**',
  '.mcp.json',
  '~/.git/hooks',
  '~/.git/hooks/**',
  '.git/hooks',
  '.git/hooks/**',
]

export function buildAccomplishSandboxConfig(
  options: AccomplishSandboxOptions = {},
): SandboxRuntimeConfig {
  const {
    workingDirectory,
    allowedDomains,
    additionalAllowedDomains = [],
    additionalAllowWrite = [],
    additionalDenyRead = [],
    allowPty = true,
    allowLocalBinding = true,
    allowAllUnixSockets = true,
    enableWeakerNestedSandbox,
  } = options

  const homeDir = homedir()

  // Build allowed write paths
  const allowWrite = [
    ...getDefaultWritePaths(),
    // User home directories commonly written to by dev tools
    path.join(homeDir, '.local'),
    path.join(homeDir, '.cache'),
    path.join(homeDir, '.config'),
    path.join(homeDir, '.npm'),
    path.join(homeDir, '.pnpm-store'),
    ...additionalAllowWrite,
  ]

  if (workingDirectory) {
    allowWrite.push(workingDirectory)
  }

  const effectiveAllowedDomains = Array.from(
    new Set(
      allowedDomains ??
        [...DEFAULT_ALLOWED_DOMAINS, ...additionalAllowedDomains],
    ),
  )

  return {
    network: {
      allowedDomains: effectiveAllowedDomains,
      deniedDomains: [],
      allowAllUnixSockets,
      allowLocalBinding,
    },
    filesystem: {
      denyRead: [...additionalDenyRead],
      allowWrite,
      denyWrite: [...DEFAULT_DENY_WRITE_WITHIN_ALLOW],
    },
    allowPty,
    enableWeakerNestedSandbox,
  }
}
