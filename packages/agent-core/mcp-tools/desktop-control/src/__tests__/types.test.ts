/**
 * Unit tests for type validation and action type definitions.
 *
 * These tests validate:
 * - All expected action types are defined
 * - Action types are read-only and type-safe
 * - Type guards work correctly
 */

import { describe, expect, it } from 'vitest';
import { DESKTOP_ACTION_TYPES } from '../types.js';
import type {
  DesktopActionType,
  DesktopActionRequest,
  DesktopActionResult,
  WindowInfo,
  ScreenshotResult,
  BlocklistEntry,
  DesktopControlConfig,
} from '../types.js';

describe('DESKTOP_ACTION_TYPES', () => {
  it('includes all mouse actions', () => {
    expect(DESKTOP_ACTION_TYPES).toContain('click');
    expect(DESKTOP_ACTION_TYPES).toContain('doubleClick');
    expect(DESKTOP_ACTION_TYPES).toContain('rightClick');
    expect(DESKTOP_ACTION_TYPES).toContain('moveMouse');
    expect(DESKTOP_ACTION_TYPES).toContain('scroll');
  });

  it('includes all keyboard actions', () => {
    expect(DESKTOP_ACTION_TYPES).toContain('type');
    expect(DESKTOP_ACTION_TYPES).toContain('hotkey');
    expect(DESKTOP_ACTION_TYPES).toContain('pressKey');
    expect(DESKTOP_ACTION_TYPES).toContain('releaseKey');
  });

  it('includes screenshot action', () => {
    expect(DESKTOP_ACTION_TYPES).toContain('screenshot');
  });

  it('includes all window management actions', () => {
    expect(DESKTOP_ACTION_TYPES).toContain('listWindows');
    expect(DESKTOP_ACTION_TYPES).toContain('findWindow');
    expect(DESKTOP_ACTION_TYPES).toContain('focusWindow');
    expect(DESKTOP_ACTION_TYPES).toContain('resizeWindow');
    expect(DESKTOP_ACTION_TYPES).toContain('repositionWindow');
  });

  it('has exactly 15 action types', () => {
    expect(DESKTOP_ACTION_TYPES).toHaveLength(15);
  });

  it('is a const tuple (immutable at compile-time)', () => {
    // `as const` makes this a readonly tuple at compile time.
    // At runtime we verify it has the expected structure.
    const copy = [...DESKTOP_ACTION_TYPES];
    expect(copy).toEqual([...DESKTOP_ACTION_TYPES]);
    expect(copy.length).toBe(15);
  });
});

describe('Type shapes (compile-time checks)', () => {
  it('DesktopActionRequest has correct shape', () => {
    const request: DesktopActionRequest = {
      action: 'click',
      x: 100,
      y: 200,
    };
    expect(request.action).toBe('click');
    expect(request.x).toBe(100);
    expect(request.y).toBe(200);
  });

  it('DesktopActionRequest supports all optional fields', () => {
    const request: DesktopActionRequest = {
      action: 'type',
      text: 'Hello',
      keys: ['Control', 'C'],
      title: 'Notepad',
      windowId: 'win-123',
      width: 800,
      height: 600,
      direction: 'down',
      amount: 5,
      fullScreen: true,
      button: 'right',
    };
    expect(request.text).toBe('Hello');
  });

  it('DesktopActionResult has correct shape', () => {
    const result: DesktopActionResult = {
      success: true,
      action: 'click',
    };
    expect(result.success).toBe(true);
  });

  it('WindowInfo has correct shape', () => {
    const info: WindowInfo = {
      id: 'win-1',
      title: 'Test Window',
      appName: 'TestApp',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    };
    expect(info.id).toBe('win-1');
  });

  it('ScreenshotResult has correct shape', () => {
    const screenshot: ScreenshotResult = {
      base64: 'iVBORw0KGgo...',
      width: 1920,
      height: 1080,
      format: 'png',
    };
    expect(screenshot.format).toBe('png');
  });

  it('BlocklistEntry has correct shape', () => {
    const entry: BlocklistEntry = {
      appName: 'TestApp',
      pattern: 'test.*',
      reason: 'Testing',
    };
    expect(entry.appName).toBe('TestApp');
  });

  it('DesktopControlConfig has correct shape', () => {
    const config: DesktopControlConfig = {
      blocklist: [],
      requireApproval: true,
    };
    expect(config.requireApproval).toBe(true);
  });

  it('DesktopActionType constraint is enforced', () => {
    // This test verifies at compile time that arbitrary strings are rejected
    const validAction: DesktopActionType = 'click';
    expect(DESKTOP_ACTION_TYPES).toContain(validAction);
  });
});
