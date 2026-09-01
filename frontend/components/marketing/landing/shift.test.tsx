import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Shift } from './shift';

describe('Shift', () => {
  it('puts responsive gutters on the divided grid cells', () => {
    render(<Shift />);

    const proveCell = screen.getByText('Prove').closest('article')?.parentElement;
    expect(proveCell).toHaveClass('md:px-6');
    expect(proveCell).toHaveClass('lg:first:pl-0');
    expect(proveCell).toHaveClass('lg:last:pr-0');
    expect(screen.getByText('Prove').closest('article')).not.toHaveClass('lg:first:pl-0');
  });
});
