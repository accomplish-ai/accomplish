import { vi } from 'vitest';
import type { Skill } from '@accomplish_ai/agent-core/common';

/** Two visible mock skills for testing slash-command features. */
export const mockSkills: Skill[] = [
  {
    id: 'skill-1',
    name: 'Code Review',
    command: '/code-review',
    description: 'Review code for quality and bugs',
    source: 'official',
    isEnabled: true,
    isVerified: true,
    isHidden: false,
    filePath: '/skills/code-review',
    updatedAt: '2024-01-01',
  },
  {
    id: 'skill-2',
    name: 'Git Helper',
    command: '/git-helper',
    description: 'Helps with git operations',
    source: 'community',
    isEnabled: true,
    isVerified: false,
    isHidden: false,
    filePath: '/skills/git-helper',
    updatedAt: '2024-01-01',
  },
];

/** Same as {@link mockSkills} plus one hidden skill for filter testing. */
export const mockSkillsWithHidden: Skill[] = [
  ...mockSkills,
  {
    id: 'skill-3',
    name: 'Hidden Skill',
    command: '/hidden',
    description: 'Should be filtered out',
    source: 'custom',
    isEnabled: true,
    isVerified: false,
    isHidden: true,
    filePath: '/skills/hidden',
    updatedAt: '2024-01-01',
  },
];

/** Create a mock textarea ref with vi.fn() stubs for focus/setSelectionRange. */
export function createTextareaRef(overrides?: Partial<HTMLTextAreaElement>) {
  return {
    current: {
      selectionStart: 0,
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
      ...overrides,
    } as unknown as HTMLTextAreaElement,
  };
}

/** Create a real DOM textarea appended to document.body (caller must clean up). */
export function createDomTextareaRef() {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  return { current: textarea };
}

/** Build a mock React.KeyboardEvent with vi.fn() stubs for preventDefault/stopPropagation. */
export function createKeyboardEvent(key: string, extra?: Partial<React.KeyboardEvent>) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra,
  } as unknown as React.KeyboardEvent;
}
