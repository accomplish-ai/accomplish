import * as fs from 'fs';

/**
 * Strips ANSI escape codes from a string.
 * @param input - The string potentially containing ANSI escape codes
 * @returns The string with all ANSI escape codes removed
 */
export function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Quotes an argument for safe use in shell commands.
 * Handles platform-specific quoting requirements.
 * @param arg - The argument to quote
 * @returns The properly quoted argument
 */
export function quoteForShell(arg: string): string {
  if (process.platform === 'win32') {
    if (arg.includes(' ') || arg.includes('"')) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  }
  if (arg.includes("'") || arg.includes(' ') || arg.includes('"')) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}

/**
 * Returns the appropriate shell for the current platform.
 * @param isPackaged - Whether the app is running in packaged mode (optional)
 * @returns The path to the shell executable
 */
export function getPlatformShell(isPackaged?: boolean): string {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  if (isPackaged && process.platform === 'darwin') {
    return '/bin/sh';
  }
  const userShell = process.env.SHELL;
  if (userShell) return userShell;
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
  return '/bin/sh';
}

/**
 * Returns the shell arguments needed to execute a command.
 * @param command - The command to execute
 * @returns Array of shell arguments
 */
export function getShellArgs(command: string): string[] {
  if (process.platform === 'win32') {
    return ['-NoProfile', '-Command', command];
  }
  return ['-c', command];
}
