import fs from 'fs';

import { isNonTaskContinuationToolName } from '../../../opencode/tool-classification.js';

// ---------------------------------------------------------------------------
// ID Generation
// ---------------------------------------------------------------------------

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ---------------------------------------------------------------------------
// Shell Escaping & Command Building
// ---------------------------------------------------------------------------

export function escapeShellArg(arg: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    // Quote if the argument contains spaces, double-quotes, or any cmd.exe
    // metacharacter (&, |, <, >, ^, %) that would be misinterpreted when
    // executing via cmd.exe /s /c. See: https://github.com/accomplish-ai/accomplish/issues/596
    if (/[ "&|<>^%]/.test(arg)) {
      const escaped = arg.replace(/"/g, '""').replace(/%/g, '^%');
      return `"${escaped}"`;
    }
    return arg;
  } else {
    const needsEscaping = ["'", ' ', '$', '`', '\\', '"', '\n'].some((c) => arg.includes(c));
    if (needsEscaping) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }
}

export function buildShellCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform,
): string {
  const escapedCommand = escapeShellArg(command, platform);
  const escapedArgs = args.map((arg) => escapeShellArg(arg, platform));
  return [escapedCommand, ...escapedArgs].join(' ');
}

export function buildPtySpawnArgs(
  command: string,
  args: string[],
  platform: NodeJS.Platform,
  isPackaged: boolean,
): { file: string; args: string[] } {
  if (platform === 'win32') {
    if (!command.toLowerCase().endsWith('.exe')) {
      throw new Error(`Windows CLI command must resolve to an .exe path. Received: ${command}`);
    }
    // On Windows, spawn the .exe directly in node-pty without a shell wrapper.
    // Passing args as an array avoids all cmd.exe / PowerShell quoting issues.
    // See: https://github.com/accomplish-ai/accomplish/issues/596
    return { file: command, args };
  }

  let shell: string;
  if (isPackaged && platform === 'darwin') {
    shell = '/bin/sh';
  } else if (process.env.SHELL) {
    shell = process.env.SHELL;
  } else if (fs.existsSync('/bin/bash')) {
    shell = '/bin/bash';
  } else if (fs.existsSync('/bin/zsh')) {
    shell = '/bin/zsh';
  } else {
    shell = '/bin/sh';
  }

  const fullCommand = buildShellCommand(command, args, platform);
  return { file: shell, args: ['-c', fullCommand] };
}

// ---------------------------------------------------------------------------
// Tool Classification
// ---------------------------------------------------------------------------

export function isStartTaskTool(toolName: string): boolean {
  return toolName === 'start_task' || toolName.endsWith('_start_task');
}

export function isExemptTool(toolName: string): boolean {
  if (toolName === 'todowrite' || toolName.endsWith('_todowrite')) {
    return true;
  }
  if (isStartTaskTool(toolName)) {
    return true;
  }
  return false;
}

export function isRequestConnectorAuthTool(toolName: string): boolean {
  return toolName === 'request_connector_auth' || toolName.endsWith('_request_connector_auth');
}

export function isNonTaskContinuationTool(toolName: string): boolean {
  return isNonTaskContinuationToolName(toolName);
}

// ---------------------------------------------------------------------------
// Output Buffering
// ---------------------------------------------------------------------------

const OUTPUT_BUFFER_MAX = 4096;

export function appendToCircularBuffer(
  current: string,
  data: string,
  maxSize = OUTPUT_BUFFER_MAX,
): string {
  const combined = current + data;
  if (combined.length <= maxSize) {
    return combined;
  }
  return combined.slice(-maxSize);
}
