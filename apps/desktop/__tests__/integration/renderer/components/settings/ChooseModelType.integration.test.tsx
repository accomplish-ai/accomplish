/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  },
}));

import ChooseModelType from '@/components/layout/settings/ChooseModelType';

describe('ChooseModelType', () => {
  it('should render Cloud and Local options', () => {
    render(<ChooseModelType onSelect={vi.fn()} />);

    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('should call onSelect with "cloud" when Cloud is clicked', () => {
    const onSelect = vi.fn();
    render(<ChooseModelType onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Cloud'));

    expect(onSelect).toHaveBeenCalledWith('cloud');
  });

  it('should call onSelect with "local" when Local is clicked', () => {
    const onSelect = vi.fn();
    render(<ChooseModelType onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Local'));

    expect(onSelect).toHaveBeenCalledWith('local');
  });
});
