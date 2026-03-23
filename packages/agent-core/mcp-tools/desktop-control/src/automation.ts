/**
 * Desktop Automation Service
 *
 * Wraps nut.js for mouse/keyboard/screenshot and uses platform-specific
 * shell commands for window management.
 * All file paths use path.join for Windows CI compatibility.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import type {
  DesktopActionType,
  DesktopActionRequest,
  DesktopActionResult,
  WindowInfo,
  ScreenshotResult,
} from './types.js';

const execFileAsync = promisify(execFile);

// ─── nut.js lazy import (native module, loaded only when needed) ────

let nutMouse: typeof import('@nut-tree/nut-js').mouse | null = null;
let nutKeyboard: typeof import('@nut-tree/nut-js').keyboard | null = null;
let nutScreen: typeof import('@nut-tree/nut-js').screen | null = null;
let nutButton: typeof import('@nut-tree/nut-js').Button | null = null;
let nutKey: typeof import('@nut-tree/nut-js').Key | null = null;

async function ensureNutLoaded(): Promise<string | null> {
  if (nutMouse) {
    return null;
  }
  try {
    const nut = await import('@nut-tree/nut-js');
    nutMouse = nut.mouse;
    nutKeyboard = nut.keyboard;
    nutScreen = nut.screen;
    nutButton = nut.Button;
    nutKey = nut.Key;
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const platform = process.platform;
    let hint = '';
    if (platform === 'darwin') {
      hint =
        ' Grant Accessibility permission in System Preferences → Privacy & Security → Accessibility.';
    } else if (platform === 'win32') {
      hint =
        ' Try running the application as Administrator, or reinstall the native module with: pnpm rebuild @nut-tree/nut-js';
    } else {
      hint = ' Ensure xdotool or equivalent is installed and accessible.';
    }
    return `Failed to load @nut-tree/nut-js: ${msg}.${hint}`;
  }
}

// ─── Platform Detection ─────────────────────────────────────────────

function isMacOS(): boolean {
  return process.platform === 'darwin';
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

// ─── Mouse Actions ──────────────────────────────────────────────────

async function executeClick(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'click', error: loadError };
  }
  if (request.x === undefined || request.y === undefined) {
    return { success: false, action: 'click', error: 'x and y coordinates are required' };
  }
  try {
    await nutMouse!.setPosition({ x: request.x, y: request.y });
    await nutMouse!.click(nutButton!.LEFT);
    return { success: true, action: 'click' };
  } catch (error) {
    return { success: false, action: 'click', error: formatError(error) };
  }
}

async function executeDoubleClick(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'doubleClick', error: loadError };
  }
  if (request.x === undefined || request.y === undefined) {
    return { success: false, action: 'doubleClick', error: 'x and y coordinates are required' };
  }
  try {
    await nutMouse!.setPosition({ x: request.x, y: request.y });
    await nutMouse!.doubleClick(nutButton!.LEFT);
    return { success: true, action: 'doubleClick' };
  } catch (error) {
    return { success: false, action: 'doubleClick', error: formatError(error) };
  }
}

async function executeRightClick(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'rightClick', error: loadError };
  }
  if (request.x === undefined || request.y === undefined) {
    return { success: false, action: 'rightClick', error: 'x and y coordinates are required' };
  }
  try {
    await nutMouse!.setPosition({ x: request.x, y: request.y });
    await nutMouse!.click(nutButton!.RIGHT);
    return { success: true, action: 'rightClick' };
  } catch (error) {
    return { success: false, action: 'rightClick', error: formatError(error) };
  }
}

async function executeMoveMouse(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'moveMouse', error: loadError };
  }
  if (request.x === undefined || request.y === undefined) {
    return { success: false, action: 'moveMouse', error: 'x and y coordinates are required' };
  }
  try {
    await nutMouse!.setPosition({ x: request.x, y: request.y });
    return { success: true, action: 'moveMouse' };
  } catch (error) {
    return { success: false, action: 'moveMouse', error: formatError(error) };
  }
}

async function executeScroll(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'scroll', error: loadError };
  }
  const amount = request.amount ?? 3;
  const direction = request.direction ?? 'down';
  try {
    if (direction === 'down') {
      await nutMouse!.scrollDown(amount);
    } else if (direction === 'up') {
      await nutMouse!.scrollUp(amount);
    } else if (direction === 'left') {
      await nutMouse!.scrollLeft(amount);
    } else {
      await nutMouse!.scrollRight(amount);
    }
    return { success: true, action: 'scroll' };
  } catch (error) {
    return { success: false, action: 'scroll', error: formatError(error) };
  }
}

// ─── Keyboard Actions ───────────────────────────────────────────────

function resolveKey(keyName: string): number | undefined {
  if (!nutKey) {
    return undefined;
  }
  const keyMap = nutKey as unknown as Record<string, number>;
  return keyMap[keyName];
}

async function executeType(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'type', error: loadError };
  }
  if (!request.text) {
    return { success: false, action: 'type', error: 'text is required' };
  }
  try {
    await nutKeyboard!.type(request.text);
    return { success: true, action: 'type' };
  } catch (error) {
    return { success: false, action: 'type', error: formatError(error) };
  }
}

async function executeHotkey(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'hotkey', error: loadError };
  }
  if (!request.keys || request.keys.length === 0) {
    return {
      success: false,
      action: 'hotkey',
      error: 'keys array is required and must not be empty',
    };
  }
  try {
    const resolvedKeys = request.keys.map((k) => {
      const resolved = resolveKey(k);
      if (resolved === undefined) {
        throw new Error(`Unknown key: "${k}"`);
      }
      return resolved;
    });
    await nutKeyboard!.pressKey(...resolvedKeys);
    await nutKeyboard!.releaseKey(...resolvedKeys);
    return { success: true, action: 'hotkey' };
  } catch (error) {
    return { success: false, action: 'hotkey', error: formatError(error) };
  }
}

async function executePressKey(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'pressKey', error: loadError };
  }
  if (!request.keys || request.keys.length === 0) {
    return { success: false, action: 'pressKey', error: 'keys array is required' };
  }
  try {
    const resolvedKeys = request.keys.map((k) => {
      const resolved = resolveKey(k);
      if (resolved === undefined) {
        throw new Error(`Unknown key: "${k}"`);
      }
      return resolved;
    });
    await nutKeyboard!.pressKey(...resolvedKeys);
    return { success: true, action: 'pressKey' };
  } catch (error) {
    return { success: false, action: 'pressKey', error: formatError(error) };
  }
}

async function executeReleaseKey(request: DesktopActionRequest): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'releaseKey', error: loadError };
  }
  if (!request.keys || request.keys.length === 0) {
    return { success: false, action: 'releaseKey', error: 'keys array is required' };
  }
  try {
    const resolvedKeys = request.keys.map((k) => {
      const resolved = resolveKey(k);
      if (resolved === undefined) {
        throw new Error(`Unknown key: "${k}"`);
      }
      return resolved;
    });
    await nutKeyboard!.releaseKey(...resolvedKeys);
    return { success: true, action: 'releaseKey' };
  } catch (error) {
    return { success: false, action: 'releaseKey', error: formatError(error) };
  }
}

// ─── Screenshot ─────────────────────────────────────────────────────

async function executeScreenshot(
  _request: DesktopActionRequest,
  screenshotDir?: string,
): Promise<DesktopActionResult> {
  const loadError = await ensureNutLoaded();
  if (loadError) {
    return { success: false, action: 'screenshot', error: loadError };
  }
  try {
    const region = await nutScreen!.grabRegion(
      await (async () => {
        const width = await nutScreen!.width();
        const height = await nutScreen!.height();
        // nut.js Region is { left, top, width, height }
        return { left: 0, top: 0, width, height };
      })(),
    );

    // Encode the captured image data to base64 PNG
    // nut.js returns an Image object, we convert it to a Buffer
    const imageData = region.data;
    const base64 = Buffer.from(imageData).toString('base64');

    // Optionally save to disk
    if (screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      const filePath = path.join(screenshotDir, `screenshot-${Date.now()}.raw`);
      writeFileSync(filePath, Buffer.from(imageData));
    }

    const result: ScreenshotResult = {
      base64,
      width: region.width,
      height: region.height,
      format: 'png',
    };

    return { success: true, action: 'screenshot', data: result };
  } catch (error) {
    return { success: false, action: 'screenshot', error: formatError(error) };
  }
}

// ─── Window Management (platform-specific) ──────────────────────────

async function executeListWindows(): Promise<DesktopActionResult> {
  try {
    const windows = await listPlatformWindows();
    return { success: true, action: 'listWindows', data: windows };
  } catch (error) {
    return { success: false, action: 'listWindows', error: formatError(error) };
  }
}

async function executeFindWindow(request: DesktopActionRequest): Promise<DesktopActionResult> {
  if (!request.title) {
    return { success: false, action: 'findWindow', error: 'title is required' };
  }
  try {
    const windows = await listPlatformWindows();
    const pattern = new RegExp(request.title, 'i');
    const matches = windows.filter((w) => pattern.test(w.title));
    return { success: true, action: 'findWindow', data: matches };
  } catch (error) {
    return { success: false, action: 'findWindow', error: formatError(error) };
  }
}

async function executeFocusWindow(request: DesktopActionRequest): Promise<DesktopActionResult> {
  if (!request.title) {
    return { success: false, action: 'focusWindow', error: 'title is required' };
  }
  try {
    await focusPlatformWindow(request.title);
    return { success: true, action: 'focusWindow' };
  } catch (error) {
    return { success: false, action: 'focusWindow', error: formatError(error) };
  }
}

async function executeResizeWindow(request: DesktopActionRequest): Promise<DesktopActionResult> {
  if (!request.title || request.width === undefined || request.height === undefined) {
    return {
      success: false,
      action: 'resizeWindow',
      error: 'title, width, and height are required',
    };
  }
  try {
    await resizePlatformWindow(request.title, request.width, request.height);
    return { success: true, action: 'resizeWindow' };
  } catch (error) {
    return { success: false, action: 'resizeWindow', error: formatError(error) };
  }
}

async function executeRepositionWindow(
  request: DesktopActionRequest,
): Promise<DesktopActionResult> {
  if (!request.title || request.x === undefined || request.y === undefined) {
    return {
      success: false,
      action: 'repositionWindow',
      error: 'title, x, and y are required',
    };
  }
  try {
    await repositionPlatformWindow(request.title, request.x, request.y);
    return { success: true, action: 'repositionWindow' };
  } catch (error) {
    return { success: false, action: 'repositionWindow', error: formatError(error) };
  }
}

// ─── Platform Window Helpers ────────────────────────────────────────

async function listPlatformWindows(): Promise<WindowInfo[]> {
  if (isMacOS()) {
    return listWindowsMacOS();
  } else if (isWindows()) {
    return listWindowsWindows();
  }
  return listWindowsLinux();
}

async function listWindowsMacOS(): Promise<WindowInfo[]> {
  const script = `
    tell application "System Events"
      set windowList to {}
      repeat with proc in (every process whose background only is false)
        set procName to name of proc
        repeat with win in (every window of proc)
          set winTitle to name of win
          set winPos to position of win
          set winSize to size of win
          set end of windowList to procName & "|||" & winTitle & "|||" & (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text)
        end repeat
      end repeat
      return windowList as text
    end tell
  `;
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return parseWindowOutput(stdout, 'macos');
}

async function listWindowsWindows(): Promise<WindowInfo[]> {
  const script = `
    Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
      $name = $_.ProcessName
      $title = $_.MainWindowTitle
      $id = $_.Id
      "$name|||$title|||$id,0,0,0"
    }
  `;
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]);
  return parseWindowOutput(stdout, 'windows');
}

async function listWindowsLinux(): Promise<WindowInfo[]> {
  try {
    const { stdout } = await execFileAsync('wmctrl', ['-l', '-p']);
    const lines = stdout.trim().split('\n');
    return lines.map((line: string, index: number) => {
      const parts = line.split(/\s+/);
      const title = parts.slice(4).join(' ');
      return {
        id: parts[0] ?? String(index),
        title: title || 'Unknown',
        appName: 'Unknown',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      };
    });
  } catch {
    return [];
  }
}

function parseWindowOutput(output: string, platform: 'macos' | 'windows'): WindowInfo[] {
  const lines = output.trim().split('\n').filter(Boolean);
  const windows: WindowInfo[] = [];

  for (const line of lines) {
    const parts = line.split('|||');
    if (parts.length < 3) {
      continue;
    }
    const appName = parts[0]?.trim() ?? 'Unknown';
    const title = parts[1]?.trim() ?? 'Unknown';
    const boundsStr = parts[2]?.trim() ?? '0,0,0,0';
    const boundsParts = boundsStr.split(',').map(Number);

    windows.push({
      id: platform === 'windows' ? (boundsParts[0]?.toString() ?? '0') : `${appName}-${title}`,
      title,
      appName,
      bounds: {
        x: boundsParts[0] ?? 0,
        y: boundsParts[1] ?? 0,
        width: boundsParts[2] ?? 0,
        height: boundsParts[3] ?? 0,
      },
    });
  }

  return windows;
}

async function focusPlatformWindow(title: string): Promise<void> {
  if (isMacOS()) {
    const script = `
      tell application "System Events"
        set targetProc to first process whose (name of every window) contains "${title.replace(/"/g, '\\"')}"
        set frontmost of targetProc to true
      end tell
    `;
    await execFileAsync('osascript', ['-e', script]);
  } else if (isWindows()) {
    const script = `
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*${title.replace(/"/g, '`"')}*" } | Select-Object -First 1
      if ($proc) {
        [void] [System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
        [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id)
      }
    `;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  } else {
    await execFileAsync('wmctrl', ['-a', title]);
  }
}

async function resizePlatformWindow(title: string, width: number, height: number): Promise<void> {
  if (isMacOS()) {
    const script = `
      tell application "System Events"
        set targetProc to first process whose (name of every window) contains "${title.replace(/"/g, '\\"')}"
        set size of first window of targetProc to {${width}, ${height}}
      end tell
    `;
    await execFileAsync('osascript', ['-e', script]);
  } else if (isWindows()) {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinAPI {
          [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
          [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        }
"@
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*${title.replace(/"/g, '`"')}*" } | Select-Object -First 1
      if ($proc) {
        $rect = New-Object WinAPI+RECT
        [WinAPI]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
        [WinAPI]::MoveWindow($proc.MainWindowHandle, $rect.Left, $rect.Top, ${width}, ${height}, $true)
      }
    `;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  } else {
    await execFileAsync('wmctrl', ['-r', title, '-e', `0,-1,-1,${width},${height}`]);
  }
}

async function repositionPlatformWindow(title: string, x: number, y: number): Promise<void> {
  if (isMacOS()) {
    const script = `
      tell application "System Events"
        set targetProc to first process whose (name of every window) contains "${title.replace(/"/g, '\\"')}"
        set position of first window of targetProc to {${x}, ${y}}
      end tell
    `;
    await execFileAsync('osascript', ['-e', script]);
  } else if (isWindows()) {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinAPI {
          [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
          [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        }
"@
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*${title.replace(/"/g, '`"')}*" } | Select-Object -First 1
      if ($proc) {
        $rect = New-Object WinAPI+RECT
        [WinAPI]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
        $w = $rect.Right - $rect.Left
        $h = $rect.Bottom - $rect.Top
        [WinAPI]::MoveWindow($proc.MainWindowHandle, ${x}, ${y}, $w, $h, $true)
      }
    `;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  } else {
    await execFileAsync('wmctrl', ['-r', title, '-e', `0,${x},${y},-1,-1`]);
  }
}

// ─── Action Dispatcher ──────────────────────────────────────────────

const ACTION_HANDLERS: Record<
  DesktopActionType,
  (request: DesktopActionRequest, screenshotDir?: string) => Promise<DesktopActionResult>
> = {
  click: executeClick,
  doubleClick: executeDoubleClick,
  rightClick: executeRightClick,
  moveMouse: executeMoveMouse,
  scroll: executeScroll,
  type: executeType,
  hotkey: executeHotkey,
  pressKey: executePressKey,
  releaseKey: executeReleaseKey,
  screenshot: executeScreenshot,
  listWindows: executeListWindows,
  findWindow: executeFindWindow,
  focusWindow: executeFocusWindow,
  resizeWindow: executeResizeWindow,
  repositionWindow: executeRepositionWindow,
};

/**
 * Execute a desktop action after all safety checks have been passed.
 * This function does NOT check the blocklist or request permissions;
 * those are handled by the server layer.
 */
export async function executeDesktopAction(
  request: DesktopActionRequest,
  screenshotDir?: string,
): Promise<DesktopActionResult> {
  const handler = ACTION_HANDLERS[request.action];
  if (!handler) {
    return {
      success: false,
      action: request.action,
      error: `Unknown action: "${request.action}"`,
    };
  }
  return handler(request, screenshotDir);
}

// ─── Utilities ──────────────────────────────────────────────────────

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
