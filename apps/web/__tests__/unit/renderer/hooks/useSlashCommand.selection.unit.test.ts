import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockSkillsWithHidden, createTextareaRef } from '../__helpers__/slashCommandTestUtils';
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

describe('useSlashCommand – skill selection & insertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnabledSkills.mockResolvedValue(mockSkillsWithHidden);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should replace slash query with skill command', async () => {
    const { hook, onChange } = await renderSlashHook('/cod');
    await openPopover(hook, '/cod', 4);
    act(() => {
      hook.result.current.selectSkill(hook.result.current.state.filteredSkills[0]);
    });
    expect(onChange).toHaveBeenCalledWith('/code-review');
  });

  it('should insert skill command in the middle of text', async () => {
    const ref = createTextareaRef({ selectionStart: 10 });
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useSlashCommand({ value: 'hello /cod world', textareaRef: ref, onChange }),
    );
    await act(async () => {});
    await openPopover(hook, 'hello /cod world', 10);
    act(() => {
      hook.result.current.selectSkill(hook.result.current.state.filteredSkills[0]);
    });
    expect(onChange).toHaveBeenCalledWith('hello /code-review world');
  });

  it('should add space when inserting before adjacent text', async () => {
    const ref = createTextareaRef({ selectionStart: 1 });
    const onChange = vi.fn();
    const hook = renderHook(() =>
      useSlashCommand({ value: '/more text', textareaRef: ref, onChange }),
    );
    await act(async () => {});
    await openPopover(hook, '/more text', 1);
    act(() => {
      hook.result.current.selectSkill(hook.result.current.state.filteredSkills[0]);
    });
    expect(onChange).toHaveBeenCalledWith('/code-review more text');
  });

  it('should close popover after selection', async () => {
    const { hook } = await renderSlashHook();
    await openPopover(hook);
    expect(hook.result.current.state.isOpen).toBe(true);
    act(() => {
      hook.result.current.selectSkill(hook.result.current.state.filteredSkills[0]);
    });
    expect(hook.result.current.state.isOpen).toBe(false);
  });
});
