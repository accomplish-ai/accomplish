import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { app, shell } from 'electron';
import { getOpenCodeCliPath } from './cli-path';
import { generateOpenCodeConfig } from './config-generator';

interface OpenCodeOauthAuthEntry {
  type?: string;
  refresh?: string;
  access?: string;
  expires?: number;
}

function getOpenCodeDataHome(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

export function getOpenCodeAuthJsonPath(): string {
  return path.join(getOpenCodeDataHome(), 'opencode', 'auth.json');
}

function readOpenCodeAuthJson(): Record<string, unknown> | null {
  try {
    const authPath = getOpenCodeAuthJsonPath();
    if (!fs.existsSync(authPath)) return null;
    const raw = fs.readFileSync(authPath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getOpenAiOauthStatus(): { connected: boolean; expires?: number } {
  const authJson = readOpenCodeAuthJson();
  if (!authJson) return { connected: false };

  const entry = authJson.openai;
  if (!entry || typeof entry !== 'object') return { connected: false };

  const oauth = entry as OpenCodeOauthAuthEntry;
  if (oauth.type !== 'oauth') return { connected: false };

  // Treat a non-empty refresh token as the durable signal that the user completed OAuth.
  const refresh = oauth.refresh;
  const connected = typeof refresh === 'string' && refresh.trim().length > 0;
  return { connected, expires: oauth.expires };
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function quoteForShell(arg: string): string {
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

function getPlatformShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  if (app.isPackaged && process.platform === 'darwin') {
    return '/bin/sh';
  }
  const userShell = process.env.SHELL;
  if (userShell) return userShell;
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
  return '/bin/sh';
}

function getShellArgs(command: string): string[] {
  if (process.platform === 'win32') {
    return ['-NoProfile', '-Command', command];
  }
  return ['-c', command];
}

export async function loginOpenAiWithChatGpt(): Promise<{ openedUrl?: string }> {
  await generateOpenCodeConfig();

  const { command, args: baseArgs } = getOpenCodeCliPath();
  const allArgs = [...baseArgs, 'auth', 'login'];

  const fullCommand = [command, ...allArgs].map(quoteForShell).join(' ');
  const shellCmd = getPlatformShell();
  const shellArgs = getShellArgs(fullCommand);

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  if (process.env.OPENCODE_CONFIG) {
    env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
  }

  const safeCwd = app.getPath('temp');

  return await new Promise((resolve, reject) => {
    let openedUrl: string | undefined;
    let hasSelectedProvider = false;
    let hasSelectedLoginMethod = false;
    let buffer = '';

    const proc = pty.spawn(shellCmd, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: safeCwd,
      env,
    });

    const tryOpenExternal = async (url: string) => {
      if (openedUrl) return;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
        openedUrl = url;
        await shell.openExternal(url);
      } catch {
        // Ignore invalid URLs; opencode will show errors if any.
      }
    };

    proc.onData((data) => {
      const clean = stripAnsi(data);
      buffer += clean;
      if (buffer.length > 20_000) buffer = buffer.slice(-20_000);

      // Provider selection (type-to-search)
      if (!hasSelectedProvider && buffer.includes('Select provider')) {
        hasSelectedProvider = true;
        // Filter and select OpenAI.
        proc.write('OpenAI');
        proc.write('\r');
      }

      // Login method selection: default is ChatGPT Pro/Plus (first entry)
      if (hasSelectedProvider && !hasSelectedLoginMethod && buffer.includes('Login method')) {
        hasSelectedLoginMethod = true;
        proc.write('\r');
      }

      // Extract the OAuth URL and open it automatically.
      const match = clean.match(/Go to:\s*(https?:\/\/\S+)/);
      if (match?.[1]) {
        void tryOpenExternal(match[1]);
      }
    });

    proc.onExit(({ exitCode, signal }) => {
      if (exitCode === 0) {
        resolve({ openedUrl });
        return;
      }
      const tail = buffer.trim().split('\n').slice(-15).join('\n');
      const redacted = tail
        .replace(/https?:\/\/\S+/g, '[url]')
        .replace(/sk-(?:ant-|or-)?[A-Za-z0-9_-]+/g, 'sk-[redacted]');
      reject(
        new Error(
          `OpenCode auth login failed (exit ${exitCode}, signal ${signal ?? 'none'})` +
            (redacted ? `\n\nOutput:\n${redacted}` : '')
        )
      );
    });
  });
}
