import { SandboxManager } from './sandbox-manager.js'
import {
  buildAccomplishSandboxConfig,
  type AccomplishSandboxOptions,
} from './accomplish-sandbox-config.js'
import type { SandboxRuntimeConfig } from './sandbox-config.js'
import { logForDebugging } from './utils/debug.js'

let sandboxOptions: AccomplishSandboxOptions | undefined

/**
 * Initialize the sandbox with Accomplish defaults.
 * No-op on unsupported platforms (Windows, etc.).
 */
export async function initializeSandbox(
  options: AccomplishSandboxOptions = {},
): Promise<void> {
  if (!SandboxManager.isSupportedPlatform()) {
    logForDebugging(
      '[AccomplishSandbox] Platform not supported, sandbox disabled',
    )
    return
  }

  sandboxOptions = options
  const config = buildAccomplishSandboxConfig(options)

  try {
    await SandboxManager.initialize(config)
    logForDebugging('[AccomplishSandbox] Sandbox initialized successfully')
  } catch (error) {
    logForDebugging(
      `[AccomplishSandbox] Failed to initialize sandbox: ${error}`,
      { level: 'error' },
    )
    // Graceful degradation: don't throw, tasks will run unsandboxed
  }
}

/**
 * Returns true if sandbox was successfully initialized and the platform supports it.
 */
export function isSandboxActive(): boolean {
  return SandboxManager.isSandboxingEnabled()
}

/**
 * Wrap a shell command with sandbox restrictions.
 * Returns the command unchanged if sandbox is not active.
 *
 * Creates a per-task config override to add the working directory to allowWrite.
 */
export async function wrapCommand(
  command: string,
  workingDirectory?: string,
): Promise<string> {
  if (!SandboxManager.isSandboxingEnabled()) {
    return command
  }

  try {
    // Build per-task config override if we have a working directory
    let customConfig: Partial<SandboxRuntimeConfig> | undefined
    if (workingDirectory) {
      const baseConfig = SandboxManager.getConfig()
      if (baseConfig) {
        customConfig = {
          filesystem: {
            ...baseConfig.filesystem,
            allowWrite: [
              ...baseConfig.filesystem.allowWrite,
              workingDirectory,
            ],
          },
        }
      }
    }

    return await SandboxManager.wrapWithSandbox(
      command,
      undefined, // binShell - let sandbox detect
      customConfig,
      undefined,
      workingDirectory,
    )
  } catch (error) {
    logForDebugging(
      `[AccomplishSandbox] Failed to wrap command, running unsandboxed: ${error}`,
      { level: 'error' },
    )
    return command
  }
}

/**
 * Clean up sandbox state after a task command finishes.
 */
export function cleanupAfterTask(): void {
  if (SandboxManager.isSandboxingEnabled()) {
    SandboxManager.cleanupAfterCommand()
  }
}

/**
 * Update the sandbox configuration dynamically.
 * Merges the new options with the original options used during initialization.
 */
export function updateSandboxConfig(
  options: Partial<AccomplishSandboxOptions>,
): void {
  if (!SandboxManager.isSandboxingEnabled()) {
    return
  }

  const merged = { ...sandboxOptions, ...options }
  sandboxOptions = merged
  const config = buildAccomplishSandboxConfig(merged)
  SandboxManager.updateConfig(config)
  logForDebugging('[AccomplishSandbox] Sandbox config updated')
}

/**
 * Shut down the sandbox, cleaning up proxies and resources.
 */
export async function shutdownSandbox(): Promise<void> {
  sandboxOptions = undefined
  await SandboxManager.reset()
  logForDebugging('[AccomplishSandbox] Sandbox shut down')
}
