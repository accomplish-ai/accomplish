/**
 * device-fingerprint.ts — Generates a stable device identifier for gateway auth.
 *
 * Produces a 32-char hex string by SHA-256 hashing a platform-specific machine UUID.
 * Same hardware → same fingerprint across restarts and reinstalls.
 *
 * Placed in identity/ (not analytics/) because this is used for gateway DPoP
 * identity binding, not for product analytics.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';

function getMacUUID(): string | null {
  try {
    const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getWindowsGuid(): string | null {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\' -Name MachineGuid).MachineGuid"',
      { encoding: 'utf8', timeout: 5_000 },
    );
    const guid = output.trim();
    return guid || null;
  } catch {
    return null;
  }
}

function getLinuxMachineId(): string | null {
  try {
    const id = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    return id || null;
  } catch {
    try {
      const id = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      return id || null;
    } catch {
      return null;
    }
  }
}

function getRawMachineUUID(): string | null {
  switch (process.platform) {
    case 'darwin':
      return getMacUUID();
    case 'win32':
      return getWindowsGuid();
    case 'linux':
      return getLinuxMachineId();
    default:
      return null;
  }
}

export function computeDeviceFingerprint(): string | null {
  const uuid = getRawMachineUUID();
  if (!uuid) return null;
  return createHash('sha256').update(uuid).digest('hex').substring(0, 32);
}
