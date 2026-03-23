/**
 * Desktop Control MCP Tool — Strict TypeScript Types
 *
 * All types used across the desktop-control package.
 * An identical copy of these types exists at
 * packages/agent-core/src/common/types/desktop.ts for re-export
 * via common.ts to web/desktop consumers.
 *
 * No `any` — enforced by tsconfig strict mode.
 */

// ─── Action Types ───────────────────────────────────────────────────

export const DESKTOP_ACTION_TYPES = [
  'click',
  'doubleClick',
  'rightClick',
  'moveMouse',
  'scroll',
  'type',
  'hotkey',
  'pressKey',
  'releaseKey',
  'screenshot',
  'listWindows',
  'findWindow',
  'focusWindow',
  'resizeWindow',
  'repositionWindow',
] as const;

export type DesktopActionType = (typeof DESKTOP_ACTION_TYPES)[number];

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export type MouseButton = 'left' | 'right' | 'middle';

// ─── Action Request ─────────────────────────────────────────────────

export interface DesktopActionRequest {
  action: DesktopActionType;

  /** Pixel coordinates for mouse actions */
  x?: number;
  y?: number;

  /** Text for type action */
  text?: string;

  /** Key names for hotkey/pressKey/releaseKey (e.g. ["Control", "C"]) */
  keys?: string[];

  /** Mouse button for click actions (defaults to "left") */
  button?: MouseButton;

  /** Window title pattern for findWindow/focusWindow */
  title?: string;

  /** Window identifier for targeted window actions */
  windowId?: string;

  /** Dimensions for resizeWindow */
  width?: number;
  height?: number;

  /** Scroll parameters */
  direction?: ScrollDirection;
  amount?: number;

  /** Whether to capture the full screen (screenshot) */
  fullScreen?: boolean;
}

// ─── Action Result ──────────────────────────────────────────────────

export interface WindowInfo {
  id: string;
  title: string;
  appName: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  format: 'png';
}

export interface DesktopActionResult {
  success: boolean;
  action: DesktopActionType;
  data?: WindowInfo[] | WindowInfo | ScreenshotResult | string;
  error?: string;
  blockedByBlocklist?: boolean;
}

// ─── Blocklist ──────────────────────────────────────────────────────

export interface BlocklistEntry {
  appName: string;
  /** Regex pattern matched against the window title (case-insensitive) */
  pattern: string;
  reason: string;
}

export interface DesktopControlConfig {
  blocklist: BlocklistEntry[];
  /** When true, every action requires user approval (always true by default) */
  requireApproval: boolean;
}

// ─── Permission Request Extension ───────────────────────────────────

export interface DesktopPermissionRequestData {
  action: DesktopActionType;
  targetWindow?: string;
  coordinates?: { x: number; y: number };
  text?: string;
  keys?: string[];
  description: string;
}

// ─── Serve Options ──────────────────────────────────────────────────

export interface ServeOptions {
  port?: number;
  permissionApiPort?: number;
  screenshotDir?: string;
}

export interface DesktopControlServer {
  port: number;
  stop: () => Promise<void>;
}
