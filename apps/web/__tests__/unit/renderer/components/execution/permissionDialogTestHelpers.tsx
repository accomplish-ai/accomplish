/**
 * Shared test helpers for PermissionDialog unit tests.
 * Exports factory functions and registers shared vi.mock stubs.
 * Import this module BEFORE importing PermissionDialog to ensure mocks are active.
 */

import { vi } from 'vitest';
import type { PermissionRequest } from '@accomplish_ai/agent-core';

// Mock framer-motion for simpler testing
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-slot="card" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/animations', () => ({
  springs: { gentle: { type: 'spring', stiffness: 300, damping: 30 } },
}));

export function createToolPermission(
  overrides: Partial<PermissionRequest> = {},
): PermissionRequest {
  return {
    id: 'perm-1',
    taskId: 'task-123',
    type: 'tool',
    toolName: 'Bash',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as PermissionRequest;
}

export function createFilePermission(
  overrides: Partial<PermissionRequest> = {},
): PermissionRequest {
  return {
    id: 'perm-2',
    taskId: 'task-123',
    type: 'file',
    fileOperation: 'create',
    filePath: '/path/to/file.txt',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as PermissionRequest;
}
