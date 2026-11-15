import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { PartBar } from './part-bar';
import { Sparkline } from './sparkline';

describe('PartBar', () => {
  it('names every part with its share and count, and gives you the accent', () => {
    const { container } = render(
      <PartBar
        label="Source types"
        parts={[
          { label: 'Your site', value: 60, you: true },
          { label: 'Editorial', value: 30 },
          { label: 'Other', value: 10, other: true },
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Source types: Your site 60.0% (60), Editorial 30.0% (30), Other 10.0% (10)',
    );
    expect(
      [...container.querySelectorAll('[data-part]')].map((part) => part.getAttribute('data-part')),
    ).toEqual(['you', 'rival-1', 'other']);
  });

  it('keeps the part of a declared total no segment covers as its own remainder', () => {
    render(<PartBar label="Source types" total={50} parts={[{ label: 'Editorial', value: 40 }]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Source types: Editorial 80.0% (40), Unclassified 20.0% (10)',
    );
  });
});

describe('Sparkline', () => {
  it('is a named image when labelled and hidden when a number sits beside it', () => {
    const { rerender } = render(
      <Sparkline values={[1, 3, null, 2]} tone="accent" label="Mentions, last 4 weeks" />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('Mentions, last 4 weeks');
    rerender(<Sparkline values={[1, 3, null, 2]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('leaves a gap for an unmeasured value instead of drawing it at the bottom', () => {
    render(<Sparkline values={[0, null, 10]} label="Trend" />);
    const path = screen.getByRole('img').querySelector('path')!;
    expect(path.getAttribute('d')).toBe('M3.0 21.0M77.0 3.0');
  });
});
