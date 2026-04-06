import { app } from 'electron';
import { getOpenCodeCliPath } from './electron-options';
import { generateOpenCodeConfig } from './config-generator';

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
