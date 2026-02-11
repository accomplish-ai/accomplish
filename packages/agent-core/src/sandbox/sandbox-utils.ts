import { homedir } from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { getPlatform } from './utils/platform.js'
import { logForDebugging } from './utils/debug.js'

/**
 * Dangerous files that should be protected from writes.
 * These files can be used for code execution or data exfiltration.
 */
export const DANGEROUS_FILES = [
  '.gitconfig',
  '.gitmodules',
  '.bashrc',
  '.bash_profile',
  '.zshrc',
  '.zprofile',
  '.profile',
  '.ripgreprc',
  '.mcp.json',
] as const

/**
 * Dangerous directories that should be protected from writes.
 * These directories contain sensitive configuration or executable files.
 */
export const DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea'] as const

/**
 * Get the list of dangerous directories to deny writes to.
 * Excludes .git since we need it writable for git operations -
 * instead we block specific paths within .git (hooks and config).
 */
export function getDangerousDirectories(): string[] {
  return [
    ...DANGEROUS_DIRECTORIES.filter(d => d !== '.git'),
    '.claude/commands',
    '.claude/agents',
  ]
}

/**
 * Normalizes a path for case-insensitive comparison.
 * This prevents bypassing security checks using mixed-case paths on case-insensitive
 * filesystems (macOS/Windows) like `.cLauDe/Settings.locaL.json`.
 *
 * We always normalize to lowercase regardless of platform for consistent security.
 * @param path The path to normalize
 * @returns The lowercase path for safe comparison
 */
export function normalizeCaseForComparison(pathStr: string): string {
  return pathStr.toLowerCase()
}

/**
 * Check if a path pattern contains glob characters
 */
export function containsGlobChars(pathPattern: string): boolean {
  return (
    pathPattern.includes('*') ||
    pathPattern.includes('?') ||
    pathPattern.includes('[') ||
    pathPattern.includes(']')
  )
}

/**
 * Remove trailing /** glob suffix from a path pattern
 * Used to normalize path patterns since /** just means "directory and everything under it"
 */
export function removeTrailingGlobSuffix(pathPattern: string): string {
  return pathPattern.replace(/\/\*\*$/, '')
}

/**
 * Check if a symlink resolution crosses expected path boundaries.
 *
 * When resolving symlinks for sandbox path normalization, we need to ensure
 * the resolved path doesn't unexpectedly broaden the scope. This function
 * returns true if the resolved path is an ancestor of the original path
 * or resolves to a system root, which would indicate the symlink points
 * outside expected boundaries.
 *
 * @param originalPath - The original path before symlink resolution
 * @param resolvedPath - The path after fs.realpathSync() resolution
 * @returns true if the resolved path is outside expected boundaries
 */
export function isSymlinkOutsideBoundary(
  originalPath: string,
  resolvedPath: string,
): boolean {
  const normalizedOriginal = path.normalize(originalPath)
  const normalizedResolved = path.normalize(resolvedPath)

  // Same path after normalization - OK
  if (normalizedResolved === normalizedOriginal) {
    return false
  }

  // Handle macOS /tmp -> /private/tmp canonical resolution
  // This is a legitimate system symlink that should be allowed
  // /tmp/claude -> /private/tmp/claude is OK
  // /var/folders/... -> /private/var/folders/... is OK
  if (
    normalizedOriginal.startsWith('/tmp/') &&
    normalizedResolved === '/private' + normalizedOriginal
  ) {
    return false
  }
  if (
    normalizedOriginal.startsWith('/var/') &&
    normalizedResolved === '/private' + normalizedOriginal
  ) {
    return false
  }
  // Also handle the reverse: /private/tmp/... resolving to itself
  if (
    normalizedOriginal.startsWith('/private/tmp/') &&
    normalizedResolved === normalizedOriginal
  ) {
    return false
  }
  if (
    normalizedOriginal.startsWith('/private/var/') &&
    normalizedResolved === normalizedOriginal
  ) {
    return false
  }

  // If resolved path is "/" it's outside expected boundaries
  if (normalizedResolved === '/') {
    return true
  }

  // If resolved path is very short (single component like /tmp, /usr, /var),
  // it's likely outside expected boundaries
  const resolvedParts = normalizedResolved.split('/').filter(Boolean)
  if (resolvedParts.length <= 1) {
    return true
  }

  // If original path starts with resolved path, the resolved path is an ancestor
  // e.g., /tmp/claude -> /tmp means the symlink points to a broader scope
  if (normalizedOriginal.startsWith(normalizedResolved + '/')) {
    return true
  }

  // Also check the canonical form of the original path for macOS
  // e.g., /tmp/claude should also be checked as /private/tmp/claude
  let canonicalOriginal = normalizedOriginal
  if (normalizedOriginal.startsWith('/tmp/')) {
    canonicalOriginal = '/private' + normalizedOriginal
  } else if (normalizedOriginal.startsWith('/var/')) {
    canonicalOriginal = '/private' + normalizedOriginal
  }

  if (
    canonicalOriginal !== normalizedOriginal &&
    canonicalOriginal.startsWith(normalizedResolved + '/')
  ) {
    return true
  }

  // STRICT CHECK: Only allow resolutions that stay within the expected path tree
  // The resolved path must either:
  // 1. Start with the original path (deeper/same) - already covered by returning false below
  // 2. Start with the canonical original (deeper/same under canonical form)
  // 3. BE the canonical form of the original (e.g., /tmp/x -> /private/tmp/x)
  // Any other resolution (e.g., /tmp/claude -> /Users/dworken) is outside expected bounds

  const resolvedStartsWithOriginal = normalizedResolved.startsWith(
    normalizedOriginal + '/',
  )
  const resolvedStartsWithCanonical =
    canonicalOriginal !== normalizedOriginal &&
    normalizedResolved.startsWith(canonicalOriginal + '/')
  const resolvedIsCanonical =
    canonicalOriginal !== normalizedOriginal &&
    normalizedResolved === canonicalOriginal
  const resolvedIsSame = normalizedResolved === normalizedOriginal

  // If resolved path is not within expected tree, it's outside boundary
  if (
    !resolvedIsSame &&
    !resolvedIsCanonical &&
    !resolvedStartsWithOriginal &&
    !resolvedStartsWithCanonical
  ) {
    return true
  }

  // Allow resolution to same directory level or deeper within expected tree
  return false
}

/**
 * Normalize a path for use in sandbox configurations
 * Handles:
 * - Tilde (~) expansion for home directory
 * - Relative paths (./foo, ../foo, etc.) converted to absolute
 * - Absolute paths remain unchanged
 * - Symlinks are resolved to their real paths for non-glob patterns
 * - Glob patterns preserve wildcards after path normalization
 *
 * Returns the absolute path with symlinks resolved (or normalized glob pattern)
 */
export function normalizePathForSandbox(
  pathPattern: string,
  baseDirectory?: string,
): string {
  const cwd = baseDirectory ? path.resolve(baseDirectory) : process.cwd()
  let normalizedPath = pathPattern

  // Expand ~ to home directory
  if (pathPattern === '~') {
    normalizedPath = homedir()
  } else if (pathPattern.startsWith('~/')) {
    normalizedPath = homedir() + pathPattern.slice(1)
  } else if (pathPattern.startsWith('./') || pathPattern.startsWith('../')) {
    // Convert relative to absolute based on current working directory
    normalizedPath = path.resolve(cwd, pathPattern)
  } else if (!path.isAbsolute(pathPattern)) {
    // Handle other relative paths (e.g., ".", "..", "foo/bar")
    normalizedPath = path.resolve(cwd, pathPattern)
  }

  // For glob patterns, resolve symlinks for the directory portion only
  if (containsGlobChars(normalizedPath)) {
    // Extract the static directory prefix before glob characters
    const staticPrefix = normalizedPath.split(/[*?[\]]/)[0]
    if (staticPrefix && staticPrefix !== '/') {
      // Get the directory containing the glob pattern
      // If staticPrefix ends with /, remove it to get the directory
      const baseDir = staticPrefix.endsWith('/')
        ? staticPrefix.slice(0, -1)
        : path.dirname(staticPrefix)

      // Try to resolve symlinks for the base directory
      try {
        const resolvedBaseDir = fs.realpathSync(baseDir)
        // Validate that resolution stays within expected boundaries
        if (!isSymlinkOutsideBoundary(baseDir, resolvedBaseDir)) {
          // Reconstruct the pattern with the resolved directory
          const patternSuffix = normalizedPath.slice(baseDir.length)
          return resolvedBaseDir + patternSuffix
        }
        // If resolution would broaden scope, keep original pattern
      } catch {
        // If directory doesn't exist or can't be resolved, keep the original pattern
      }
    }
    return normalizedPath
  }

  // Resolve symlinks to real paths to avoid bwrap issues
  // Validate that the resolution stays within expected boundaries
  try {
    const resolvedPath = fs.realpathSync(normalizedPath)

    // Only use resolved path if it doesn't cross boundary (e.g., symlink to parent dir)
    if (isSymlinkOutsideBoundary(normalizedPath, resolvedPath)) {
      // Symlink points outside expected boundaries - keep original path
    } else {
      normalizedPath = resolvedPath
    }
  } catch {
    // If path doesn't exist or can't be resolved, keep the normalized path
  }

  return normalizedPath
}

/**
 * Get recommended system paths that should be writable for commands to work properly
 *
 * WARNING: These default paths are intentionally broad for compatibility but may
 * allow access to files from other processes. In highly security-sensitive
 * environments, you should configure more restrictive write paths.
 */
export function getDefaultWritePaths(): string[] {
  const homeDir = homedir()
  const recommendedPaths = [
    '/dev/stdout',
    '/dev/stderr',
    '/dev/null',
    '/dev/tty',
    '/dev/dtracehelper',
    '/dev/autofs_nowait',
    '/tmp/claude',
    '/private/tmp/claude',
    path.join(homeDir, '.npm/_logs'),
    path.join(homeDir, '.claude/debug'),
  ]

  return recommendedPaths
}

/**
 * Generate proxy environment variables for sandboxed processes
 */
export function generateProxyEnvVars(
  httpProxyPort?: number,
  socksProxyPort?: number,
): string[] {
  // Respect CLAUDE_TMPDIR if set, otherwise default to /tmp/claude
  const tmpdir = process.env.CLAUDE_TMPDIR || '/tmp/claude'
  const envVars: string[] = [`SANDBOX_RUNTIME=1`, `TMPDIR=${tmpdir}`]

  // If no proxy ports provided, return minimal env vars
  if (!httpProxyPort && !socksProxyPort) {
    return envVars
  }

  // Always set NO_PROXY to exclude localhost and private networks from proxying
  const noProxyAddresses = [
    'localhost',
    '127.0.0.1',
    '::1',
    '*.local',
    '.local',
    '169.254.0.0/16', // Link-local
    '10.0.0.0/8', // Private network
    '172.16.0.0/12', // Private network
    '192.168.0.0/16', // Private network
  ].join(',')
  envVars.push(`NO_PROXY=${noProxyAddresses}`)
  envVars.push(`no_proxy=${noProxyAddresses}`)

  if (httpProxyPort) {
    envVars.push(`HTTP_PROXY=http://localhost:${httpProxyPort}`)
    envVars.push(`HTTPS_PROXY=http://localhost:${httpProxyPort}`)
    // Lowercase versions for compatibility with some tools
    envVars.push(`http_proxy=http://localhost:${httpProxyPort}`)
    envVars.push(`https_proxy=http://localhost:${httpProxyPort}`)
  }

  if (socksProxyPort) {
    // Use socks5h:// for proper DNS resolution through proxy
    envVars.push(`ALL_PROXY=socks5h://localhost:${socksProxyPort}`)
    envVars.push(`all_proxy=socks5h://localhost:${socksProxyPort}`)

    // Configure Git to use SSH through SOCKS proxy (platform-aware)
    if (getPlatform() === 'macos') {
      // macOS has nc available
      // Note: No outer quotes - bwrap --setenv sets the value directly without shell interpretation
      envVars.push(
        `GIT_SSH_COMMAND=ssh -o ProxyCommand='nc -X 5 -x localhost:${socksProxyPort} %h %p'`,
      )
    }

    // FTP proxy support (use socks5h for DNS resolution through proxy)
    envVars.push(`FTP_PROXY=socks5h://localhost:${socksProxyPort}`)
    envVars.push(`ftp_proxy=socks5h://localhost:${socksProxyPort}`)

    // rsync proxy support
    envVars.push(`RSYNC_PROXY=localhost:${socksProxyPort}`)

    // Database tools NOTE: Most database clients don't have built-in proxy support
    // You typically need to use SSH tunneling or a SOCKS wrapper like tsocks/proxychains

    // Docker CLI uses HTTP for the API
    // This makes Docker use the HTTP proxy for registry operations
    envVars.push(
      `DOCKER_HTTP_PROXY=http://localhost:${httpProxyPort || socksProxyPort}`,
    )
    envVars.push(
      `DOCKER_HTTPS_PROXY=http://localhost:${httpProxyPort || socksProxyPort}`,
    )

    // Kubernetes kubectl - uses standard HTTPS_PROXY
    // kubectl respects HTTPS_PROXY which we already set above

    // AWS CLI - uses standard HTTPS_PROXY (v2 supports it well)
    // AWS CLI v2 respects HTTPS_PROXY which we already set above

    // Google Cloud SDK - has specific proxy settings
    // Use HTTPS proxy to match other HTTP-based tools
    if (httpProxyPort) {
      envVars.push(`CLOUDSDK_PROXY_TYPE=https`)
      envVars.push(`CLOUDSDK_PROXY_ADDRESS=localhost`)
      envVars.push(`CLOUDSDK_PROXY_PORT=${httpProxyPort}`)
    }

    // Azure CLI - uses HTTPS_PROXY
    // Azure CLI respects HTTPS_PROXY which we already set above

    // Terraform - uses standard HTTP/HTTPS proxy vars
    // Terraform respects HTTP_PROXY/HTTPS_PROXY which we already set above

    // gRPC-based tools - use standard proxy vars
    envVars.push(`GRPC_PROXY=socks5h://localhost:${socksProxyPort}`)
    envVars.push(`grpc_proxy=socks5h://localhost:${socksProxyPort}`)
  }

  // WARNING: Do not set HTTP_PROXY/HTTPS_PROXY to SOCKS URLs when only SOCKS proxy is available
  // Most HTTP clients do not support SOCKS URLs in these variables and will fail, and we want
  // to avoid overriding the client otherwise respecting the ALL_PROXY env var which points to SOCKS.

  return envVars
}

/**
 * Encode a command for sandbox monitoring
 * Truncates to 100 chars and base64 encodes to avoid parsing issues
 */
export function encodeSandboxedCommand(command: string): string {
  const truncatedCommand = command.slice(0, 100)
  return Buffer.from(truncatedCommand).toString('base64')
}

/**
 * Decode a base64-encoded command from sandbox monitoring
 */
export function decodeSandboxedCommand(encodedCommand: string): string {
  return Buffer.from(encodedCommand, 'base64').toString('utf8')
}

/**
 * Convert a glob pattern to a regular expression
 *
 * This implements gitignore-style pattern matching to match the behavior of the
 * `ignore` library used by the permission system.
 *
 * Supported patterns:
 * - * matches any characters except / (e.g., *.ts matches foo.ts but not foo/bar.ts)
 * - ** matches any characters including / (e.g., src/**\/*.ts matches all .ts files in src/)
 * - ? matches any single character except / (e.g., file?.txt matches file1.txt)
 * - [abc] matches any character in the set (e.g., file[0-9].txt matches file3.txt)
 *
 * Exported for testing and shared between macOS sandbox profiles and Linux glob expansion.
 */
export function globToRegex(globPattern: string): string {
  return (
    '^' +
    globPattern
      // Escape regex special characters (except glob chars * ? [ ])
      .replace(/[.^$+{}()|\\]/g, '\\$&')
      // Escape unclosed brackets (no matching ])
      .replace(/\[([^\]]*?)$/g, '\\[$1')
      // Convert glob patterns to regex (order matters - ** before *)
      .replace(/\*\*\//g, '__GLOBSTAR_SLASH__') // Placeholder for **/
      .replace(/\*\*/g, '__GLOBSTAR__') // Placeholder for **
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/\?/g, '[^/]') // ? matches single character except /
      // Restore placeholders
      .replace(/__GLOBSTAR_SLASH__/g, '(.*/)?') // **/ matches zero or more dirs
      .replace(/__GLOBSTAR__/g, '.*') + // ** matches anything including /
    '$'
  )
}

/**
 * Expand a glob pattern into concrete file paths.
 *
 * Used on Linux where bubblewrap doesn't support glob patterns natively.
 * Resolves the static directory prefix, lists files recursively, and filters
 * using globToRegex().
 *
 * @param globPath - A path pattern containing glob characters (e.g., ~/test/*.env)
 * @returns Array of absolute paths matching the glob pattern
 */
export function expandGlobPattern(globPath: string): string[] {
  const normalizedPattern = normalizePathForSandbox(globPath)

  // Extract the static directory prefix before any glob characters
  const staticPrefix = normalizedPattern.split(/[*?[\]]/)[0]
  if (!staticPrefix || staticPrefix === '/') {
    logForDebugging(`[Sandbox] Glob pattern too broad, skipping: ${globPath}`)
    return []
  }

  // Get the base directory from the static prefix
  const baseDir = staticPrefix.endsWith('/')
    ? staticPrefix.slice(0, -1)
    : path.dirname(staticPrefix)

  if (!fs.existsSync(baseDir)) {
    logForDebugging(
      `[Sandbox] Base directory for glob does not exist: ${baseDir}`,
    )
    return []
  }

  // Build regex from the normalized glob pattern
  const regex = new RegExp(globToRegex(normalizedPattern))

  // List all entries recursively under the base directory
  const results: string[] = []
  try {
    const entries = fs.readdirSync(baseDir, {
      recursive: true,
      withFileTypes: true,
    })

    for (const entry of entries) {
      // Build the full path for this entry
      // entry.parentPath is the directory containing this entry (available in Node 20+/Bun)
      // For compatibility, fall back to entry.path if parentPath is not available
      const parentDir =
        (entry as { parentPath?: string }).parentPath ??
        (entry as { path?: string }).path ??
        baseDir
      const fullPath = path.join(parentDir, entry.name)

      if (regex.test(fullPath)) {
        results.push(fullPath)
      }
    }
  } catch (err) {
    logForDebugging(
      `[Sandbox] Error expanding glob pattern ${globPath}: ${err}`,
    )
  }

  return results
}
