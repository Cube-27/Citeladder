import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CursorPager } from './cursor-pager';

describe('CursorPager', () => {
  it('shows the current page and wires both pagination directions', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<CursorPager page={3} canPrev canNext onPrev={onPrev} onNext={onNext} />);

    expect(screen.getByText('Page 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
