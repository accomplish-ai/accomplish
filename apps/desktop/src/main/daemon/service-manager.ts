/**
 * Service Manager
 *
 * Cross-platform daemon auto-start registration:
 *   - macOS: Electron login item (launchd behind the scenes)
 *   - Windows: Electron login item (startup registry key)
 *   - Linux: systemd user service file
 *
 * This file MUST use `path.join()` for all file paths (Windows CI compatibility).
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getLogCollector } from '../logging';

function logD(level: 'INFO' | 'WARN' | 'ERROR', msg: string, data?: Record<string, unknown>) {
  try {
    const l = getLogCollector();
    if (l?.log) {
      l.log(level, 'daemon', msg, data);
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

  // macOS + Windows: use Electron's built-in API
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

  // macOS + Windows: use Electron's built-in API
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });

  logD('INFO', '[ServiceManager] Auto-start enabled via Electron login item');
}

/** Unregister the daemon from auto-starting on login. */
export function disableAutoStart(): void {
  logD('INFO', `[ServiceManager] Disabling auto-start for platform: ${process.platform}`);

  if (process.platform === 'linux') {
    uninstallSystemdService();
    return;
  }

  // macOS + Windows: use Electron's built-in API
  app.setLoginItemSettings({
    openAtLogin: false,
  });

  logD('INFO', '[ServiceManager] Auto-start disabled');
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

function getServiceContent(): string {
  const execPath = app.getPath('exe');

  return [
    '[Unit]',
    'Description=Accomplish AI Daemon',
    'After=default.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${execPath} --daemon`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

function installSystemdService(): void {
  const serviceDir = getSystemdServiceDir();
  const servicePath = getSystemdServicePath();

  // Ensure directory exists
  fs.mkdirSync(serviceDir, { recursive: true });

  // Write service file
  fs.writeFileSync(servicePath, getServiceContent(), { mode: 0o644 });
  logD('INFO', `[ServiceManager] Wrote systemd service to: ${servicePath}`);

  // Enable and reload
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
    execSync(`systemctl --user enable ${SYSTEMD_SERVICE_NAME}`, { stdio: 'pipe' });
    logD('INFO', '[ServiceManager] systemd user service enabled');
  } catch (err) {
    logD('ERROR', '[ServiceManager] Failed to enable systemd service', { err: String(err) });
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
