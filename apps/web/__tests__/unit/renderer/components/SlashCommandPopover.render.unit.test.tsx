/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockSkills, createDomTextareaRef } from '../__helpers__/slashCommandTestUtils';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({}),
}));

import { SlashCommandPopover } from '@/components/landing/SlashCommandPopover';

describe('SlashCommandPopover – rendering', () => {
  let textareaRef: { current: HTMLTextAreaElement };

  beforeEach(() => {
    vi.clearAllMocks();
    textareaRef = createDomTextareaRef();
  });

  afterEach(() => {
    textareaRef.current?.parentNode?.removeChild(textareaRef.current);
  });

  const defaultProps = {
    query: '',
    triggerStart: 0,
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={false}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('should not render when skills list is empty', () => {
    const { container } = render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={[]}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render skill commands when open', () => {
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    expect(screen.getByText('/code-review')).toBeInTheDocument();
    expect(screen.getByText('/git-helper')).toBeInTheDocument();
  });

  it('should render skill descriptions', () => {
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    expect(screen.getByText('Review code for quality and bugs')).toBeInTheDocument();
    expect(screen.getByText('Helps with git operations')).toBeInTheDocument();
  });

  it('should highlight the selected skill', () => {
    const { container } = render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons[0].className).toContain('bg-accent');
    expect([...buttons[1].classList]).not.toContain('bg-accent');
  });

  it('should highlight second skill when selectedIndex is 1', () => {
    const { container } = render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={1}
        textareaRef={textareaRef}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons[1].className).toContain('bg-accent');
  });

  it('should display keyboard hint text', () => {
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
      />,
    );
    expect(screen.getByText(/navigate/i)).toBeInTheDocument();
    expect(screen.getByText(/select/i)).toBeInTheDocument();
    expect(screen.getByText(/dismiss/i)).toBeInTheDocument();
  });

  it('should show header when no query', () => {
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
        query=""
      />,
    );
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('should show filtering header when query is present', () => {
    render(
      <SlashCommandPopover
        {...defaultProps}
        isOpen={true}
        skills={mockSkills}
        selectedIndex={0}
        textareaRef={textareaRef}
        query="code"
      />,
    );
    expect(screen.getByText('Skills matching "code"')).toBeInTheDocument();
  });
});
