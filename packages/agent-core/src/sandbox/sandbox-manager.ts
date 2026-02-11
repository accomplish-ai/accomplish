import { createHttpProxyServer } from './http-proxy.js'
import { createSocksProxyServer } from './socks-proxy.js'
import type { SocksProxyWrapper } from './socks-proxy.js'
import { logForDebugging } from './utils/debug.js'
import { whichSync } from './utils/which.js'
import { getPlatform, getWslVersion } from './utils/platform.js'
import * as fs from 'fs'
import type { SandboxRuntimeConfig } from './sandbox-config.js'
import type {
  SandboxAskCallback,
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  NetworkRestrictionConfig,
} from './sandbox-schemas.js'
import {
  wrapCommandWithSandboxLinux,
  initializeLinuxNetworkBridge,
  type LinuxNetworkBridgeContext,
  checkLinuxDependencies,
  type SandboxDependencyCheck,
  cleanupBwrapMountPoints,
} from './linux-sandbox-utils.js'
import {
  wrapCommandWithSandboxMacOS,
  startMacOSSandboxLogMonitor,
} from './macos-sandbox-utils.js'
import {
  getDefaultWritePaths,
  containsGlobChars,
  removeTrailingGlobSuffix,
  expandGlobPattern,
} from './sandbox-utils.js'
import { SandboxViolationStore } from './sandbox-violation-store.js'
import { EOL } from 'node:os'

interface HostNetworkManagerContext {
  httpProxyPort: number
  socksProxyPort: number
  linuxBridge: LinuxNetworkBridgeContext | undefined
}

// ============================================================================
// Private Module State
// ============================================================================

let config: SandboxRuntimeConfig | undefined
let httpProxyServer: ReturnType<typeof createHttpProxyServer> | undefined
let socksProxyServer: SocksProxyWrapper | undefined
let managerContext: HostNetworkManagerContext | undefined
let initializationPromise: Promise<HostNetworkManagerContext> | undefined
let cleanupRegistered = false
let logMonitorShutdown: (() => void) | undefined
const sandboxViolationStore = new SandboxViolationStore()

// ============================================================================
// Private Helper Functions (not exported)
// ============================================================================

function registerCleanup(): void {
  if (cleanupRegistered) {
    return
  }
  const cleanupHandler = () =>
    reset().catch(e => {
      logForDebugging(`Cleanup failed in registerCleanup ${e}`, {
        level: 'error',
      })
    })
  process.once('exit', cleanupHandler)
  process.once('SIGINT', cleanupHandler)
  process.once('SIGTERM', cleanupHandler)
  cleanupRegistered = true
}

function matchesDomainPattern(hostname: string, pattern: string): boolean {
  // Support wildcard patterns like *.example.com
  // This matches any subdomain but not the base domain itself
  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.substring(2) // Remove '*.'
    return hostname.toLowerCase().endsWith('.' + baseDomain.toLowerCase())
  }

  // Exact match for non-wildcard patterns
  return hostname.toLowerCase() === pattern.toLowerCase()
}

async function filterNetworkRequest(
  port: number,
  host: string,
  sandboxAskCallback?: SandboxAskCallback,
): Promise<boolean> {
  if (!config) {
    logForDebugging('No config available, denying network request')
    return false
  }

  // Check denied domains first
  for (const deniedDomain of config.network.deniedDomains) {
    if (matchesDomainPattern(host, deniedDomain)) {
      logForDebugging(`Denied by config rule: ${host}:${port}`)
      return false
    }
  }

  // Check allowed domains
  for (const allowedDomain of config.network.allowedDomains) {
    if (matchesDomainPattern(host, allowedDomain)) {
      logForDebugging(`Allowed by config rule: ${host}:${port}`)
      return true
    }
  }

  // No matching rules - ask user or deny
  if (!sandboxAskCallback) {
    logForDebugging(`No matching config rule, denying: ${host}:${port}`)
    return false
  }

  logForDebugging(`No matching config rule, asking user: ${host}:${port}`)
  try {
    const userAllowed = await sandboxAskCallback({ host, port })
    if (userAllowed) {
      logForDebugging(`User allowed: ${host}:${port}`)
      return true
    } else {
      logForDebugging(`User denied: ${host}:${port}`)
      return false
    }
  } catch (error) {
    logForDebugging(`Error in permission callback: ${error}`, {
      level: 'error',
    })
    return false
  }
}

function getMitmSocketPath(host: string): string | undefined {
  if (!config?.network.mitmProxy) {
    return undefined
  }

  const { socketPath, domains } = config.network.mitmProxy

  for (const pattern of domains) {
    if (matchesDomainPattern(host, pattern)) {
      logForDebugging(`Host ${host} matches MITM pattern ${pattern}`)
      return socketPath
    }
  }

  return undefined
}

async function startHttpProxyServer(
  sandboxAskCallback?: SandboxAskCallback,
): Promise<number> {
  httpProxyServer = createHttpProxyServer({
    filter: (port: number, host: string) =>
      filterNetworkRequest(port, host, sandboxAskCallback),
    getMitmSocketPath,
  })

  return new Promise<number>((resolve, reject) => {
    if (!httpProxyServer) {
      reject(new Error('HTTP proxy server undefined before listen'))
      return
    }

    const server = httpProxyServer

    server.once('error', reject)
    server.once('listening', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        server.unref()
        logForDebugging(`HTTP proxy listening on localhost:${address.port}`)
        resolve(address.port)
      } else {
        reject(new Error('Failed to get proxy server address'))
      }
    })

    server.listen(0, '127.0.0.1')
  })
}

async function startSocksProxyServer(
  sandboxAskCallback?: SandboxAskCallback,
): Promise<number> {
  socksProxyServer = createSocksProxyServer({
    filter: (port: number, host: string) =>
      filterNetworkRequest(port, host, sandboxAskCallback),
  })

  return new Promise<number>((resolve, reject) => {
    if (!socksProxyServer) {
      reject(new Error('SOCKS proxy server undefined before listen'))
      return
    }

    socksProxyServer
      .listen(0, '127.0.0.1')
      .then((port: number) => {
        socksProxyServer?.unref()
        resolve(port)
      })
      .catch(reject)
  })
}

// ============================================================================
// Public Module Functions (will be exported via namespace)
// ============================================================================

async function initialize(
  runtimeConfig: SandboxRuntimeConfig,
  sandboxAskCallback?: SandboxAskCallback,
  enableLogMonitor = false,
): Promise<void> {
  // Return if already initializing
  if (initializationPromise) {
    await initializationPromise
    return
  }

  // Check dependencies
  const deps = checkDependencies(runtimeConfig.ripgrep, runtimeConfig.seccomp)
  if (deps.errors.length > 0) {
    throw new Error(
      `Sandbox dependencies not available: ${deps.errors.join(', ')}`,
    )
  }

  // Store config for use by other functions after dependency validation
  config = structuredClone(runtimeConfig)

  // Start log monitor for macOS if enabled
  if (enableLogMonitor && getPlatform() === 'macos') {
    logMonitorShutdown = startMacOSSandboxLogMonitor(
      sandboxViolationStore.addViolation.bind(sandboxViolationStore),
      config.ignoreViolations,
    )
    logForDebugging('Started macOS sandbox log monitor')
  }

  // Register cleanup handlers first time
  registerCleanup()

  // Initialize network infrastructure
  initializationPromise = (async () => {
    try {
      // Conditionally start proxy servers based on config
      let httpProxyPort: number
      if (config.network.httpProxyPort !== undefined) {
        httpProxyPort = config.network.httpProxyPort
        logForDebugging(`Using external HTTP proxy on port ${httpProxyPort}`)
      } else {
        httpProxyPort = await startHttpProxyServer(sandboxAskCallback)
      }

      let socksProxyPort: number
      if (config.network.socksProxyPort !== undefined) {
        socksProxyPort = config.network.socksProxyPort
        logForDebugging(`Using external SOCKS proxy on port ${socksProxyPort}`)
      } else {
        socksProxyPort = await startSocksProxyServer(sandboxAskCallback)
      }

      // Initialize platform-specific infrastructure
      let linuxBridge: LinuxNetworkBridgeContext | undefined
      if (getPlatform() === 'linux') {
        linuxBridge = await initializeLinuxNetworkBridge(
          httpProxyPort,
          socksProxyPort,
        )
      }

      const context: HostNetworkManagerContext = {
        httpProxyPort,
        socksProxyPort,
        linuxBridge,
      }
      managerContext = context
      logForDebugging('Network infrastructure initialized')
      return context
    } catch (error) {
      config = undefined
      initializationPromise = undefined
      managerContext = undefined
      reset().catch(e => {
        logForDebugging(`Cleanup failed in initializationPromise ${e}`, {
          level: 'error',
        })
      })
      throw error
    }
  })()

  await initializationPromise
}

function isSupportedPlatform(): boolean {
  const platform = getPlatform()
  if (platform === 'linux') {
    return getWslVersion() !== '1'
  }
  return platform === 'macos'
}

function isSandboxingEnabled(): boolean {
  return config !== undefined
}

function checkDependencies(ripgrepConfig?: {
  command: string
  args?: string[]
}, seccompConfig?: {
  bpfPath?: string
  applyPath?: string
}): SandboxDependencyCheck {
  if (!isSupportedPlatform()) {
    return { errors: ['Unsupported platform'], warnings: [] }
  }

  const errors: string[] = []
  const warnings: string[] = []

  const rgToCheck = ripgrepConfig ?? config?.ripgrep ?? { command: 'rg' }
  if (whichSync(rgToCheck.command) === null) {
    errors.push(`ripgrep (${rgToCheck.command}) not found`)
  }

  const platform = getPlatform()
  if (platform === 'linux') {
    const linuxDeps = checkLinuxDependencies(seccompConfig ?? config?.seccomp)
    errors.push(...linuxDeps.errors)
    warnings.push(...linuxDeps.warnings)
  }

  return { errors, warnings }
}

function getFsReadConfig(): FsReadRestrictionConfig {
  if (!config) {
    return { denyOnly: [] }
  }

  const denyPaths: string[] = []
  for (const p of config.filesystem.denyRead) {
    const stripped = removeTrailingGlobSuffix(p)
    if (getPlatform() === 'linux' && containsGlobChars(stripped)) {
      const expanded = expandGlobPattern(p)
      logForDebugging(
        `[Sandbox] Expanded glob pattern "${p}" to ${expanded.length} paths on Linux`,
      )
      denyPaths.push(...expanded)
    } else {
      denyPaths.push(stripped)
    }
  }

  return {
    denyOnly: denyPaths,
  }
}

function getFsWriteConfig(): FsWriteRestrictionConfig {
  if (!config) {
    return { allowOnly: getDefaultWritePaths(), denyWithinAllow: [] }
  }

  const allowPaths = config.filesystem.allowWrite
    .map(path => removeTrailingGlobSuffix(path))
    .filter(path => {
      if (getPlatform() === 'linux' && containsGlobChars(path)) {
        logForDebugging(`Skipping glob pattern on Linux/WSL: ${path}`)
        return false
      }
      return true
    })

  const denyPaths = config.filesystem.denyWrite
    .map(path => removeTrailingGlobSuffix(path))
    .filter(path => {
      if (getPlatform() === 'linux' && containsGlobChars(path)) {
        logForDebugging(`Skipping glob pattern on Linux/WSL: ${path}`)
        return false
      }
      return true
    })

  const allowOnly = [...getDefaultWritePaths(), ...allowPaths]

  return {
    allowOnly,
    denyWithinAllow: denyPaths,
  }
}

function getNetworkRestrictionConfig(): NetworkRestrictionConfig {
  if (!config) {
    return {}
  }

  const allowedHosts = config.network.allowedDomains
  const deniedHosts = config.network.deniedDomains

  return {
    ...(allowedHosts.length > 0 && { allowedHosts }),
    ...(deniedHosts.length > 0 && { deniedHosts }),
  }
}

function getAllowUnixSockets(): string[] | undefined {
  return config?.network?.allowUnixSockets
}

function getAllowAllUnixSockets(): boolean | undefined {
  return config?.network?.allowAllUnixSockets
}

function getAllowLocalBinding(): boolean | undefined {
  return config?.network?.allowLocalBinding
}

function getIgnoreViolations(): Record<string, string[]> | undefined {
  return config?.ignoreViolations
}

function getEnableWeakerNestedSandbox(): boolean | undefined {
  return config?.enableWeakerNestedSandbox
}

function getEnableWeakerNetworkIsolation(): boolean | undefined {
  return config?.enableWeakerNetworkIsolation
}

function getRipgrepConfig(): { command: string; args?: string[] } {
  return config?.ripgrep ?? { command: 'rg' }
}

function getMandatoryDenySearchDepth(): number {
  return config?.mandatoryDenySearchDepth ?? 3
}

function getAllowGitConfig(): boolean {
  return config?.filesystem?.allowGitConfig ?? false
}

function getSeccompConfig():
  | { bpfPath?: string; applyPath?: string }
  | undefined {
  return config?.seccomp
}

function getProxyPort(): number | undefined {
  return managerContext?.httpProxyPort
}

function getSocksProxyPort(): number | undefined {
  return managerContext?.socksProxyPort
}

function getLinuxHttpSocketPath(): string | undefined {
  return managerContext?.linuxBridge?.httpSocketPath
}

function getLinuxSocksSocketPath(): string | undefined {
  return managerContext?.linuxBridge?.socksSocketPath
}

async function waitForNetworkInitialization(): Promise<boolean> {
  if (!config) {
    return false
  }
  if (initializationPromise) {
    try {
      await initializationPromise
      return true
    } catch {
      return false
    }
  }
  return managerContext !== undefined
}

async function wrapWithSandbox(
  command: string,
  binShell?: string,
  customConfig?: Partial<SandboxRuntimeConfig>,
  abortSignal?: AbortSignal,
  workingDirectory?: string,
): Promise<string> {
  const platform = getPlatform()

  const userAllowWrite =
    customConfig?.filesystem?.allowWrite ?? config?.filesystem.allowWrite ?? []
  const writeConfig = {
    allowOnly: [...getDefaultWritePaths(), ...userAllowWrite],
    denyWithinAllow:
      customConfig?.filesystem?.denyWrite ?? config?.filesystem.denyWrite ?? [],
  }
  const rawDenyRead =
    customConfig?.filesystem?.denyRead ?? config?.filesystem.denyRead ?? []
  const expandedDenyRead: string[] = []
  for (const p of rawDenyRead) {
    const stripped = removeTrailingGlobSuffix(p)
    if (getPlatform() === 'linux' && containsGlobChars(stripped)) {
      expandedDenyRead.push(...expandGlobPattern(p))
    } else {
      expandedDenyRead.push(stripped)
    }
  }
  const readConfig = {
    denyOnly: expandedDenyRead,
  }

  const hasNetworkConfig =
    customConfig?.network?.allowedDomains !== undefined ||
    config?.network?.allowedDomains !== undefined

  const needsNetworkRestriction = hasNetworkConfig
  const needsNetworkProxy = hasNetworkConfig

  if (needsNetworkProxy) {
    await waitForNetworkInitialization()
  }

  const allowPty = customConfig?.allowPty ?? config?.allowPty

  switch (platform) {
    case 'macos':
      return wrapCommandWithSandboxMacOS({
        command,
        needsNetworkRestriction,
        httpProxyPort: needsNetworkProxy ? getProxyPort() : undefined,
        socksProxyPort: needsNetworkProxy ? getSocksProxyPort() : undefined,
        readConfig,
        writeConfig,
        allowUnixSockets: getAllowUnixSockets(),
        allowAllUnixSockets: getAllowAllUnixSockets(),
        allowLocalBinding: getAllowLocalBinding(),
        ignoreViolations: getIgnoreViolations(),
        allowPty,
        allowGitConfig: getAllowGitConfig(),
        enableWeakerNetworkIsolation: getEnableWeakerNetworkIsolation(),
        binShell,
        workingDirectory,
      })

    case 'linux':
      return wrapCommandWithSandboxLinux({
        command,
        needsNetworkRestriction,
        httpSocketPath: needsNetworkProxy
          ? getLinuxHttpSocketPath()
          : undefined,
        socksSocketPath: needsNetworkProxy
          ? getLinuxSocksSocketPath()
          : undefined,
        httpProxyPort: needsNetworkProxy
          ? managerContext?.httpProxyPort
          : undefined,
        socksProxyPort: needsNetworkProxy
          ? managerContext?.socksProxyPort
          : undefined,
        readConfig,
        writeConfig,
        enableWeakerNestedSandbox: getEnableWeakerNestedSandbox(),
        allowAllUnixSockets: getAllowAllUnixSockets(),
        binShell,
        ripgrepConfig: getRipgrepConfig(),
        mandatoryDenySearchDepth: getMandatoryDenySearchDepth(),
        allowGitConfig: getAllowGitConfig(),
        seccompConfig: getSeccompConfig(),
        abortSignal,
        workingDirectory,
      })

    default:
      throw new Error(
        `Sandbox configuration is not supported on platform: ${platform}`,
      )
  }
}

function getConfig(): SandboxRuntimeConfig | undefined {
  return config
}

function updateConfig(newConfig: SandboxRuntimeConfig): void {
  config = structuredClone(newConfig)
  logForDebugging('Sandbox configuration updated')
}

function cleanupAfterCommand(): void {
  cleanupBwrapMountPoints()
}

async function reset(): Promise<void> {
  cleanupAfterCommand()

  if (logMonitorShutdown) {
    logMonitorShutdown()
    logMonitorShutdown = undefined
  }

  if (managerContext?.linuxBridge) {
    const {
      httpSocketPath,
      socksSocketPath,
      httpBridgeProcess,
      socksBridgeProcess,
    } = managerContext.linuxBridge

    const exitPromises: Promise<void>[] = []

    if (httpBridgeProcess.pid && !httpBridgeProcess.killed) {
      try {
        process.kill(httpBridgeProcess.pid, 'SIGTERM')
        logForDebugging('Sent SIGTERM to HTTP bridge process')

        exitPromises.push(
          new Promise<void>(resolve => {
            httpBridgeProcess.once('exit', () => {
              logForDebugging('HTTP bridge process exited')
              resolve()
            })
            setTimeout(() => {
              if (!httpBridgeProcess.killed) {
                logForDebugging('HTTP bridge did not exit, forcing SIGKILL', {
                  level: 'warn',
                })
                try {
                  if (httpBridgeProcess.pid) {
                    process.kill(httpBridgeProcess.pid, 'SIGKILL')
                  }
                } catch {
                  // Process may have already exited
                }
              }
              resolve()
            }, 5000)
          }),
        )
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
          logForDebugging(`Error killing HTTP bridge: ${err}`, {
            level: 'error',
          })
        }
      }
    }

    if (socksBridgeProcess.pid && !socksBridgeProcess.killed) {
      try {
        process.kill(socksBridgeProcess.pid, 'SIGTERM')
        logForDebugging('Sent SIGTERM to SOCKS bridge process')

        exitPromises.push(
          new Promise<void>(resolve => {
            socksBridgeProcess.once('exit', () => {
              logForDebugging('SOCKS bridge process exited')
              resolve()
            })
            setTimeout(() => {
              if (!socksBridgeProcess.killed) {
                logForDebugging('SOCKS bridge did not exit, forcing SIGKILL', {
                  level: 'warn',
                })
                try {
                  if (socksBridgeProcess.pid) {
                    process.kill(socksBridgeProcess.pid, 'SIGKILL')
                  }
                } catch {
                  // Process may have already exited
                }
              }
              resolve()
            }, 5000)
          }),
        )
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
          logForDebugging(`Error killing SOCKS bridge: ${err}`, {
            level: 'error',
          })
        }
      }
    }

    await Promise.all(exitPromises)

    if (httpSocketPath) {
      try {
        fs.rmSync(httpSocketPath, { force: true })
        logForDebugging('Cleaned up HTTP socket')
      } catch (err) {
        logForDebugging(`HTTP socket cleanup error: ${err}`, {
          level: 'error',
        })
      }
    }

    if (socksSocketPath) {
      try {
        fs.rmSync(socksSocketPath, { force: true })
        logForDebugging('Cleaned up SOCKS socket')
      } catch (err) {
        logForDebugging(`SOCKS socket cleanup error: ${err}`, {
          level: 'error',
        })
      }
    }
  }

  const closePromises: Promise<void>[] = []

  if (httpProxyServer) {
    const server = httpProxyServer
    const httpClose = new Promise<void>(resolve => {
      server.close(error => {
        if (error && error.message !== 'Server is not running.') {
          logForDebugging(`Error closing HTTP proxy server: ${error.message}`, {
            level: 'error',
          })
        }
        resolve()
      })
    })
    closePromises.push(httpClose)
  }

  if (socksProxyServer) {
    const socksClose = socksProxyServer.close().catch((error: Error) => {
      logForDebugging(`Error closing SOCKS proxy server: ${error.message}`, {
        level: 'error',
      })
    })
    closePromises.push(socksClose)
  }

  await Promise.all(closePromises)

  httpProxyServer = undefined
  socksProxyServer = undefined
  managerContext = undefined
  initializationPromise = undefined
  config = undefined
  sandboxViolationStore.clear()
}

function getSandboxViolationStore() {
  return sandboxViolationStore
}

function annotateStderrWithSandboxFailures(
  command: string,
  stderr: string,
): string {
  if (!config) {
    return stderr
  }

  const violations = sandboxViolationStore.getViolationsForCommand(command)
  if (violations.length === 0) {
    return stderr
  }

  let annotated = stderr
  annotated += EOL + '<sandbox_violations>' + EOL
  for (const violation of violations) {
    annotated += violation.line + EOL
  }
  annotated += '</sandbox_violations>'

  return annotated
}

function getLinuxGlobPatternWarnings(): string[] {
  if (getPlatform() !== 'linux' || !config) {
    return []
  }

  const globPatterns: string[] = []

  const allPaths = [
    ...config.filesystem.allowWrite,
    ...config.filesystem.denyWrite,
  ]

  for (const path of allPaths) {
    const pathWithoutTrailingStar = removeTrailingGlobSuffix(path)

    if (containsGlobChars(pathWithoutTrailingStar)) {
      globPatterns.push(path)
    }
  }

  return globPatterns
}

// ============================================================================
// Public API Interface
// ============================================================================

export interface ISandboxManager {
  initialize(
    runtimeConfig: SandboxRuntimeConfig,
    sandboxAskCallback?: SandboxAskCallback,
    enableLogMonitor?: boolean,
  ): Promise<void>
  isSupportedPlatform(): boolean
  isSandboxingEnabled(): boolean
  checkDependencies(ripgrepConfig?: {
    command: string
    args?: string[]
  }, seccompConfig?: {
    bpfPath?: string
    applyPath?: string
  }): SandboxDependencyCheck
  getFsReadConfig(): FsReadRestrictionConfig
  getFsWriteConfig(): FsWriteRestrictionConfig
  getNetworkRestrictionConfig(): NetworkRestrictionConfig
  getAllowUnixSockets(): string[] | undefined
  getAllowLocalBinding(): boolean | undefined
  getIgnoreViolations(): Record<string, string[]> | undefined
  getEnableWeakerNestedSandbox(): boolean | undefined
  getProxyPort(): number | undefined
  getSocksProxyPort(): number | undefined
  getLinuxHttpSocketPath(): string | undefined
  getLinuxSocksSocketPath(): string | undefined
  waitForNetworkInitialization(): Promise<boolean>
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    abortSignal?: AbortSignal,
    workingDirectory?: string,
  ): Promise<string>
  getSandboxViolationStore(): SandboxViolationStore
  annotateStderrWithSandboxFailures(command: string, stderr: string): string
  getLinuxGlobPatternWarnings(): string[]
  getConfig(): SandboxRuntimeConfig | undefined
  updateConfig(newConfig: SandboxRuntimeConfig): void
  cleanupAfterCommand(): void
  reset(): Promise<void>
}

// ============================================================================
// Export as Namespace with Interface
// ============================================================================

export const SandboxManager: ISandboxManager = {
  initialize,
  isSupportedPlatform,
  isSandboxingEnabled,
  checkDependencies,
  getFsReadConfig,
  getFsWriteConfig,
  getNetworkRestrictionConfig,
  getAllowUnixSockets,
  getAllowLocalBinding,
  getIgnoreViolations,
  getEnableWeakerNestedSandbox,
  getProxyPort,
  getSocksProxyPort,
  getLinuxHttpSocketPath,
  getLinuxSocksSocketPath,
  waitForNetworkInitialization,
  wrapWithSandbox,
  cleanupAfterCommand,
  reset,
  getSandboxViolationStore,
  annotateStderrWithSandboxFailures,
  getLinuxGlobPatternWarnings,
  getConfig,
  updateConfig,
} as const
