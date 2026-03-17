const { execFileSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cjs' : 'pnpm';
let cachedWindowsPnpmInvocation = null;
const cachedWindowsScriptShellByPath = new Map();

function commandToString(command, args = []) {
  return [command, ...args].join(' ');
}

function resolveWindowsCommandPath(command, env = process.env) {
  try {
    const output = execFileSync('where.exe', [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env,
    });

    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (fs.existsSync(line)) {
        return line;
      }
    }
  } catch {}

  return undefined;
}

function resolveWindowsScriptShell(env = process.env) {
  const pathKey = env.Path || env.PATH || '';
  if (cachedWindowsScriptShellByPath.has(pathKey)) {
    return cachedWindowsScriptShellByPath.get(pathKey);
  }

  for (const candidate of ['pwsh.exe', 'powershell.exe']) {
    const commandPath = resolveWindowsCommandPath(candidate, env);
    if (!commandPath) {
      continue;
    }

    const probe = spawnSync(
      commandPath,
      ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        shell: false,
        windowsHide: true,
        env,
      },
    );

    if (!probe.error && probe.status === 0) {
      cachedWindowsScriptShellByPath.set(pathKey, commandPath);
      return commandPath;
    }
  }

  cachedWindowsScriptShellByPath.set(pathKey, undefined);
  return undefined;
}

function withWindowsScriptShell(env = process.env) {
  if (!isWindows) return env;
  if (env.npm_config_script_shell) return env;
  const scriptShell = resolveWindowsScriptShell(env);
  if (!scriptShell) {
    throw new Error(
      'Failed to locate a PowerShell executable for pnpm script execution. Ensure either pwsh.exe or powershell.exe is available on PATH.',
    );
  }
  return {
    ...env,
    npm_config_script_shell: scriptShell,
  };
}

function resolveWindowsPnpmCjsPath() {
  const candidates = [];

  if (process.env.PNPM_HOME) {
    candidates.push(path.resolve(process.env.PNPM_HOME, '..', 'pnpm', 'bin', 'pnpm.cjs'));
  }

  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    );
  }

  try {
    const output = execFileSync('where.exe', ['pnpm'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/\.cjs$/i.test(line)) {
        candidates.push(line);
        continue;
      }

      const binDir = path.dirname(line);
      candidates.push(path.resolve(binDir, '..', 'pnpm', 'bin', 'pnpm.cjs'));
    }
  } catch {}

  for (const candidate of new Set(candidates)) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Failed to locate pnpm.cjs. Ensure pnpm is installed and available on PATH.');
}

function getWindowsPnpmInvocation(args = []) {
  if (!cachedWindowsPnpmInvocation) {
    cachedWindowsPnpmInvocation = {
      nodeCommand: process.execPath,
      pnpmCjsPath: resolveWindowsPnpmCjsPath(),
    };
  }

  return {
    command: cachedWindowsPnpmInvocation.nodeCommand,
    args: [cachedWindowsPnpmInvocation.pnpmCjsPath, ...args],
  };
}

function runCommandSync(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    shell: options.shell ?? false,
  });

  if (result.error) {
    throw new Error(`Failed to run "${commandToString(command, args)}": ${result.error.message}`);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${commandToString(command, args)}`);
  }
  if (result.status === null && result.signal) {
    throw new Error(
      `Command terminated by signal ${result.signal}: ${commandToString(command, args)}`,
    );
  }

  return result;
}

function runPnpmSync(args, options = {}) {
  if (isWindows) {
    const invocation = getWindowsPnpmInvocation(args);
    const env = withWindowsScriptShell(options.env);
    return runCommandSync(invocation.command, invocation.args, {
      ...options,
      env,
      shell: false,
    });
  }
  return runCommandSync(pnpmCommand, args, options);
}

function spawnCommand(command, args = [], options = {}) {
  return spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    detached: options.detached ?? !isWindows,
    shell: options.shell ?? false,
  });
}

function spawnPnpm(args, options = {}) {
  if (isWindows) {
    const invocation = getWindowsPnpmInvocation(args);
    const env = withWindowsScriptShell(options.env);
    return spawnCommand(invocation.command, invocation.args, {
      ...options,
      env,
      detached: options.detached ?? false,
      shell: false,
    });
  }
  return spawnCommand(pnpmCommand, args, options);
}

function waitForResources(resources, timeout) {
  const waitOn = require('wait-on');
  return waitOn({
    resources,
    timeout,
    interval: 250,
    window: 1000,
  });
}

function getPidsOnPort(port) {
  return isWindows ? getWindowsPidsOnPort(port) : getPosixPidsOnPort(port);
}

function getPosixPidsOnPort(port) {
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parsePidList(output);
  } catch {
    return [];
  }
}

function getWindowsPidsOnPort(port) {
  try {
    const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || !line.toUpperCase().startsWith('TCP')) continue;

      const columns = line.split(/\s+/);
      if (columns.length < 5) continue;

      const localAddress = columns[1];
      const owningPid = Number(columns[4]);
      if (!Number.isInteger(owningPid) || owningPid <= 0) continue;

      if (extractPort(localAddress) === port) {
        pids.add(owningPid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function parsePidList(output) {
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function extractPort(address) {
  const lastColon = address.lastIndexOf(':');
  if (lastColon === -1) return null;
  const rawPort = address.slice(lastColon + 1);
  const port = Number(rawPort);
  return Number.isInteger(port) ? port : null;
}

function killProcessTree(pid, options = {}) {
  const force = options.force ?? false;
  const useGroup = options.useGroup ?? true;
  if (!Number.isInteger(pid) || pid <= 0) return;

  if (isWindows) {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    spawnSync('taskkill', args, { stdio: 'ignore', shell: false });
    return;
  }

  const signal = force ? 'SIGKILL' : 'SIGTERM';
  if (useGroup) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {}
  }

  try {
    process.kill(pid, signal);
  } catch {}
}

function killChildProcess(child, options = {}) {
  if (!child || typeof child.pid !== 'number') return;
  killProcessTree(child.pid, options);
}

function clearPort(port) {
  const pids = getPidsOnPort(port);
  for (const pid of pids) {
    killProcessTree(pid, { force: true, useGroup: false });
  }
  return pids.length;
}

function resolveExitCode(reason, fallback = 0) {
  if (typeof reason === 'number' && Number.isInteger(reason)) {
    return reason;
  }
  if (reason && typeof reason === 'object') {
    if (typeof reason.code === 'number') {
      return reason.code;
    }
    if (typeof reason.status === 'number') {
      return reason.status;
    }
  }
  if (reason) {
    return 1;
  }
  return fallback;
}

function formatChildExit(code, signal) {
  if (typeof code === 'number') return `code ${code}`;
  if (signal) return `signal ${signal}`;
  return 'unknown reason';
}

module.exports = {
  clearPort,
  formatChildExit,
  isWindows,
  killChildProcess,
  killProcessTree,
  pnpmCommand,
  runPnpmSync,
  resolveExitCode,
  runCommandSync,
  spawnCommand,
  spawnPnpm,
  waitForResources,
};
