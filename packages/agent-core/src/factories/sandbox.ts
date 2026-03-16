/**
 * Factory function for creating sandbox providers.
 *
 * Returns the appropriate provider based on the configured sandbox mode.
 */

import type { SandboxConfig, SandboxPaths, SandboxProvider } from '../common/types/sandbox.js';
import { DisabledSandboxProvider } from '../sandbox/disabled-provider.js';
import { NativeSandboxProvider } from '../sandbox/native-provider.js';
// Docker provider contributed by preeeetham (#430) + SaaiAravindhRaja (#612)
import { DockerSandboxProvider } from '../sandbox/docker-provider.js';

export function createSandboxProvider(
  config: SandboxConfig,
  platform?: NodeJS.Platform,
  getSandboxPaths?: () => SandboxPaths,
): SandboxProvider {
  switch (config.mode) {
    case 'native':
      return new NativeSandboxProvider(platform);
    case 'docker':
      // Docker provider: combines preeeetham's spawn logic and SaaiAravindhRaja's config UI
      return new DockerSandboxProvider(platform, getSandboxPaths);
    case 'disabled':
    default:
      return new DisabledSandboxProvider();
  }
}
