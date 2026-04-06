/**
 * PTY process helpers for OAuth browser flow.
 * Handles spawning and managing the PTY process for opencode auth login.
 */
import * as pty from 'node-pty';
import { app, shell } from 'electron';
import { quoteForShell, getPlatformShell, getShellArgs } from '@accomplish_ai/agent-core';
import { getOpenCodeCliPath } from './electron-options';
import { generateOpenCodeConfig } from './config-generator';
import { isOpenCodeCliInstallError, INSTALL_ERROR_MESSAGE } from './cli-error-utils';
import { getLogCollector } from '../logging';

export interface LoginResult {
  openedUrl?: string;
}

export interface OpenCodeCommandContext {
  command: string;
  baseArgs: string[];
  env: Record<string, string>;
  safeCwd: string;
}

export async function getOpenCodeCommandContext(): Promise<OpenCodeCommandContext> {
  await generateOpenCodeConfig();

  const { command, args: baseArgs } = getOpenCodeCliPath();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return {
    command,
    baseArgs,
    env,
    safeCwd: app.getPath('temp'),
  };
}

export function spawnOAuthPty({
  command,
  baseArgs,
  env,
  safeCwd,
}: OpenCodeCommandContext): pty.IPty {
  const allArgs = [...baseArgs, 'auth', 'login'];

  if (process.platform === 'win32') {
    return pty.spawn(command, allArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: safeCwd,
      env,
    });
  }

  const quoted = [command, ...allArgs].map((arg) => quoteForShell(arg)).join(' ');
  const shellCmd = getPlatformShell(app.isPackaged);
  const shellArgs = getShellArgs(quoted);

  return pty.spawn(shellCmd, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: safeCwd,
    env,
  });
}

export async function tryOpenExternal(
  url: string,
  openedUrl: string | undefined,
): Promise<string | undefined> {
  if (openedUrl) {
    return openedUrl;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return openedUrl;
    }
    await shell.openExternal(url);
    return url;
  } catch {
    return openedUrl;
  }
}

export function buildOAuthExitError(
  buffer: string,
  exitCode: number,
  signal: number | undefined,
): Error {
  if (isOpenCodeCliInstallError(buffer)) {
    getLogCollector().logEnv('WARN', '[Auth] CLI install error detected', {
      tail: buffer
        .slice(-200)
        .replace(/https?:\/\/\S+/gi, '[URL]')
        .replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]'),
    });
    return new Error(INSTALL_ERROR_MESSAGE);
  }

  const tail = buffer.trim().split('\n').slice(-15).join('\n');
  const redacted = tail
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/sk-(?:ant-|or-)?[A-Za-z0-9_-]+/g, 'sk-[redacted]');
  return new Error(
    `OpenCode auth login failed (exit ${exitCode}, signal ${signal ?? 'none'})` +
      (redacted ? `\n\nOutput:\n${redacted}` : ''),
  );
}
