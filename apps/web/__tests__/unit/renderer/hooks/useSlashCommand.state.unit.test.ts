import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  mockSkillsWithHidden,
  createTextareaRef,
  createKeyboardEvent,
} from '../__helpers__/slashCommandTestUtils';
import type { Skill } from '@accomplish_ai/agent-core/common';
import type { UseSlashCommandReturn } from '@/hooks/useSlashCommand';

const mockGetEnabledSkills = vi.fn().mockResolvedValue(mockSkillsWithHidden);

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    getEnabledSkills: mockGetEnabledSkills,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useSlashCommand } from '@/hooks/useSlashCommand';

const mockSkills = mockSkillsWithHidden;

async function renderSlashHook(initialValue = '', ref?: ReturnType<typeof createTextareaRef>) {
  const onChange = vi.fn();
  const textareaRef = ref ?? createTextareaRef({ selectionStart: initialValue.length });
  const hook = renderHook(() => useSlashCommand({ value: initialValue, textareaRef, onChange }));
  await act(async () => {});
  return { hook, onChange, ref: textareaRef };
}

async function openPopover(
  hook: ReturnType<typeof renderHook<UseSlashCommandReturn, unknown>>,
  value = '/',
  cursor?: number,
) {
  await act(async () => {
    hook.result.current.handleChange(value, cursor ?? value.length);
  });
}

describe('useSlashCommand – dismiss, error handling & fresh fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnabledSkills.mockResolvedValue(mockSkillsWithHidden);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dismiss', () => {
    it('should reset state when dismissed', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.isOpen).toBe(true);
      act(() => {
        hook.result.current.dismiss();
      });
      expect(hook.result.current.state.isOpen).toBe(false);
      expect(hook.result.current.state.query).toBe('');
      expect(hook.result.current.state.triggerStart).toBe(-1);
      expect(hook.result.current.state.filteredSkills).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle skill loading failure gracefully', async () => {
      mockGetEnabledSkills.mockRejectedValue(new Error('Network error'));
      const { hook } = await renderSlashHook();
      await act(async () => {
        hook.result.current.handleChange('/', 1);
      });
      expect(hook.result.current.state.isOpen).toBe(false);
    });
  });

  describe('selectedIndex clamping', () => {
    it('should clamp selectedIndex when filter narrows results', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(2);
      act(() => {
        hook.result.current.handleKeyDown(createKeyboardEvent('ArrowDown'));
      });
      expect(hook.result.current.state.selectedIndex).toBe(1);
      act(() => {
        hook.result.current.handleChange('/code', 5);
      });
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.selectedIndex).toBe(0);
    });
  });

  describe('fresh fetch on open', () => {
    it('should re-fetch skills each time popover opens', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.isOpen).toBe(true);
      act(() => {
        hook.result.current.dismiss();
      });
      const callsBefore = mockGetEnabledSkills.mock.calls.length;
      await openPopover(hook);
      expect(mockGetEnabledSkills.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('should reflect newly added skills after re-open', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(2);
      act(() => {
        hook.result.current.dismiss();
      });
      const newSkill: Skill = {
        id: 'skill-new',
        name: 'New Skill',
        command: '/new-skill',
        description: 'A brand new skill',
        source: 'custom',
        isEnabled: true,
        isVerified: false,
        isHidden: false,
        filePath: '/skills/new',
        updatedAt: '2024-02-01',
      };
      mockGetEnabledSkills.mockResolvedValueOnce([...mockSkills, newSkill]);
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(3);
    });

    it('should not show removed skills after re-open', async () => {
      const { hook } = await renderSlashHook();
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(2);
      act(() => {
        hook.result.current.dismiss();
      });
      mockGetEnabledSkills.mockResolvedValueOnce([mockSkills[0]]);
      await openPopover(hook);
      expect(hook.result.current.state.filteredSkills).toHaveLength(1);
      expect(hook.result.current.state.filteredSkills[0].command).toBe('/code-review');
    });
  });
});
