/**
 * Service Manager
 *
 * Cross-platform daemon auto-start registration.
 * "Start at Login" now starts the **daemon binary** (not the full Electron app).
 *
 *   - macOS: LaunchAgent plist with KeepAlive
 *   - Windows: Electron login item (starts Electron hidden, which spawns daemon)
 *   - Linux: systemd user service for the daemon binary
 *
 * This file MUST use `path.join()` for all file paths (Windows CI compatibility).
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getLogCollector } from '../logging';

function logD(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'daemon', msg);
    }
  } catch (_e) {
    /* best-effort logging */
  }
}

/** Whether the daemon is registered to auto-start on login. */
export function isAutoStartEnabled(): boolean {
  if (process.platform === 'linux') {
    return isSystemdServiceEnabled();
  }
  if (process.platform === 'darwin') {
    return isLaunchAgentInstalled();
  }

  // Windows: use Electron's built-in login item API (starts Electron hidden → spawns daemon)
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
}

/** Register the daemon to auto-start on login. */
export function enableAutoStart(): void {
  logD('INFO', `[ServiceManager] Enabling auto-start for platform: ${process.platform}`);

  if (process.platform === 'linux') {
    installSystemdService();
    return;
  }
  if (process.platform === 'darwin') {
    installLaunchAgent();
    return;
  }

  // Windows: create a startup shortcut for the daemon binary.
  // Use Electron login item API with path/args pointing to bundled Node.js + daemon.
  if (app.isPackaged) {
    const nodePath = getDaemonNodePath();
    const entryPath = getDaemonEntryPath();
    const dataDir = getDataDir();
    app.setLoginItemSettings({
      openAtLogin: true,
      path: nodePath,
      args: [
        entryPath,
        '--data-dir',
        dataDir,
        '--packaged',
        '--resources-path',
        process.resourcesPath,
        '--app-path',
        app.getAppPath(),
      ],
    });
    logD('INFO', '[ServiceManager] Auto-start enabled: daemon binary via login item');
  } else {
    // Dev mode: start Electron hidden (which spawns daemon on boot)
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    });
    logD('INFO', '[ServiceManager] Auto-start enabled: Electron hidden (dev mode)');
  }
}

/** Unregister the daemon from auto-starting on login. */
export function disableAutoStart(): void {
  logD('INFO', `[ServiceManager] Disabling auto-start for platform: ${process.platform}`);

  if (process.platform === 'linux') {
    uninstallSystemdService();
    return;
  }
  if (process.platform === 'darwin') {
    uninstallLaunchAgent();
    return;
  }

  // Windows: disable login item (works for both packaged daemon path and dev Electron path)
  app.setLoginItemSettings({ openAtLogin: false });
  logD('INFO', '[ServiceManager] Auto-start disabled');
}

// =============================================================================
// Daemon binary paths (shared by macOS + Linux)
// =============================================================================

function getDaemonNodePath(): string {
  if (app.isPackaged) {
    // Download script outputs: resources/nodejs/{platform}-{arch}/node-v{VERSION}-{platform}-{arch}/
    // After electron-builder copies extraResources into {resourcesPath}/nodejs/:
    //   {resourcesPath}/nodejs/{platform}-{arch}/node-v{VERSION}-{platform}-{arch}/bin/node (macOS/Linux)
    //   {resourcesPath}/nodejs/{platform}-{arch}/node-v{VERSION}-{platform}-{arch}/node.exe (Windows)
    const platformArch = `${process.platform}-${process.arch}`;
    const nodejsBase = path.join(process.resourcesPath, 'nodejs', platformArch);
    const nodeBinary = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node');

    const directPath = path.join(nodejsBase, nodeBinary);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // Search versioned subdirectory (e.g. node-v20.18.1-win-x64)
    try {
      const children = fs.readdirSync(nodejsBase, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory()) {
          continue;
        }
        const nested = path.join(nodejsBase, child.name, nodeBinary);
        if (fs.existsSync(nested)) {
          return nested;
        }
      }
    } catch {
      // intentionally empty — fall through to execPath
    }
  }
  return process.execPath; // dev: system node
}

function getDaemonEntryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'daemon', 'index.js');
  }
  return path.join(app.getAppPath(), '..', 'daemon', 'dist', 'index.js');
}

function getDataDir(): string {
  return app.getPath('userData');
}

// =============================================================================
// macOS: LaunchAgent plist
// =============================================================================

const LAUNCH_AGENT_LABEL = 'ai.accomplish.daemon';

function getLaunchAgentDir(): string {
  return path.join(process.env.HOME || '~', 'Library', 'LaunchAgents');
}

function getLaunchAgentPath(): string {
  return path.join(getLaunchAgentDir(), `${LAUNCH_AGENT_LABEL}.plist`);
}

function getLaunchAgentContent(): string {
  const nodePath = getDaemonNodePath();
  const entryPath = getDaemonEntryPath();
  const dataDir = getDataDir();

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${LAUNCH_AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    <string>${nodePath}</string>`,
    `    <string>${entryPath}</string>`,
    `    <string>--data-dir</string>`,
    `    <string>${dataDir}</string>`,
    '  </array>',
    '  <key>KeepAlive</key><true/>',
    '  <key>RunAtLoad</key><true/>',
  ];

  // Pass packaged-mode context so daemon resolves paths correctly
  if (app.isPackaged) {
    lines.push(
      '  <key>EnvironmentVariables</key>',
      '  <dict>',
      '    <key>ACCOMPLISH_IS_PACKAGED</key><string>1</string>',
      `    <key>ACCOMPLISH_RESOURCES_PATH</key><string>${process.resourcesPath}</string>`,
      `    <key>ACCOMPLISH_APP_PATH</key><string>${app.getAppPath()}</string>`,
      '  </dict>',
    );
  }

  lines.push(
    '  <key>StandardOutPath</key>',
    `  <string>${path.join(dataDir, 'daemon-stdout.log')}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${path.join(dataDir, 'daemon-stderr.log')}</string>`,
    '</dict>',
    '</plist>',
    '',
  );

  return lines.join('\n');
}

function installLaunchAgent(): void {
  const agentDir = getLaunchAgentDir();
  const agentPath = getLaunchAgentPath();

  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(agentPath, getLaunchAgentContent(), { mode: 0o644 });
  logD('INFO', `[ServiceManager] Wrote LaunchAgent to: ${agentPath}`);

  try {
    // Unload first if already loaded (idempotent)
    execSync(`launchctl unload "${agentPath}" 2>/dev/null || true`, { stdio: 'pipe' });
    execSync(`launchctl load "${agentPath}"`, { stdio: 'pipe' });
    logD('INFO', '[ServiceManager] LaunchAgent loaded');
  } catch (err) {
    logD('ERROR', `[ServiceManager] Failed to load LaunchAgent: ${String(err)}`);
    throw err;
  }
}

function uninstallLaunchAgent(): void {
  const agentPath = getLaunchAgentPath();

  try {
    execSync(`launchctl unload "${agentPath}" 2>/dev/null || true`, { stdio: 'pipe' });
    logD('INFO', '[ServiceManager] LaunchAgent unloaded');
  } catch {
    // May not be loaded — that's fine
  }

  if (fs.existsSync(agentPath)) {
    fs.unlinkSync(agentPath);
    logD('INFO', `[ServiceManager] Removed LaunchAgent: ${agentPath}`);
  }
}

function isLaunchAgentInstalled(): boolean {
  return fs.existsSync(getLaunchAgentPath());
}

// =============================================================================
// Linux: systemd user service
// =============================================================================

const SYSTEMD_SERVICE_NAME = 'accomplish-daemon.service';

function getSystemdServiceDir(): string {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '~', '.config');
  return path.join(configDir, 'systemd', 'user');
}

function getSystemdServicePath(): string {
  return path.join(getSystemdServiceDir(), SYSTEMD_SERVICE_NAME);
}

function getSystemdServiceContent(): string {
  const nodePath = getDaemonNodePath();
  const entryPath = getDaemonEntryPath();
  const dataDir = getDataDir();

  const lines = [
    '[Unit]',
    'Description=Accomplish AI Daemon',
    'After=default.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${nodePath} ${entryPath} --data-dir ${dataDir}`,
  ];

  // Pass packaged-mode context so daemon resolves paths correctly
  if (app.isPackaged) {
    lines.push(
      `Environment=ACCOMPLISH_IS_PACKAGED=1`,
      `Environment=ACCOMPLISH_RESOURCES_PATH=${process.resourcesPath}`,
      `Environment=ACCOMPLISH_APP_PATH=${app.getAppPath()}`,
    );
  }

  lines.push('Restart=on-failure', 'RestartSec=5', '', '[Install]', 'WantedBy=default.target', '');

  return lines.join('\n');
}

function installSystemdService(): void {
  const serviceDir = getSystemdServiceDir();
  const servicePath = getSystemdServicePath();

  fs.mkdirSync(serviceDir, { recursive: true });
  fs.writeFileSync(servicePath, getSystemdServiceContent(), { mode: 0o644 });
  logD('INFO', `[ServiceManager] Wrote systemd service to: ${servicePath}`);

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync(`systemctl --user enable ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
    logD('INFO', '[ServiceManager] systemd user service enabled');
  } catch (err) {
    logD('ERROR', `[ServiceManager] Failed to enable systemd service: ${String(err)}`);
    throw err;
  }
}

function uninstallSystemdService(): void {
  const servicePath = getSystemdServicePath();

  try {
    execSync(`systemctl --user disable ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
    execSync(`systemctl --user stop ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
    logD('INFO', '[ServiceManager] systemd user service disabled and stopped');
  } catch {
    // Service might not be running — that's fine
  }

  if (fs.existsSync(servicePath)) {
    fs.unlinkSync(servicePath);
    logD('INFO', `[ServiceManager] Removed service file: ${servicePath}`);
  }

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
  } catch {
    // Best effort
  }
}

function isSystemdServiceEnabled(): boolean {
  try {
    const result = execSync(`systemctl --user is-enabled ${SYSTEMD_SERVICE_NAME}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return result.trim() === 'enabled';
  } catch {
    return false;
  }
}
