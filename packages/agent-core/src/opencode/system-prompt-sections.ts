/**
 * Helper sections for the Accomplish agent system prompt.
 * Split out from system-prompt.ts to keep each file under 200 lines.
 * Heavy behavior blocks live in system-prompt-behaviors.ts.
 */

/**
 * Platform-specific environment instructions for the system prompt.
 */
export function getPlatformEnvironmentInstructions(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `<environment>
**You are running on Windows.** Use Windows-compatible commands:
- Use PowerShell syntax, not bash/Unix syntax
- Use \`$env:TEMP\` for temp directory (not /tmp)
- Use semicolon (;) for PATH separator (not colon)
- Use \`$env:VAR\` for environment variables (not $VAR)
</environment>`;
  } else {
    return `<environment>
You are running on ${platform === 'darwin' ? 'macOS' : 'Linux'}.
</environment>`;
  }
}

export {
  CONVERSATIONAL_BYPASS_BEHAVIOR,
  TASK_PLANNING_BEHAVIOR,
  FILE_PERMISSION_SECTION,
  TASK_COMPLETION_BEHAVIOR,
} from './system-prompt-behaviors.js';
