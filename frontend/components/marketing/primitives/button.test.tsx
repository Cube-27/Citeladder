import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DoubleRingCtaLink } from './button';

describe('DoubleRingCtaLink', () => {
  it('exposes its visual variant, icon, and new-tab behavior', () => {
    render(
      <DoubleRingCtaLink
        href="/demo"
        title="Try the demo"
        variant="dark"
        openInNewTab
        icon={<svg data-testid="custom-arrow" />}
      />,
    );

    const link = screen.getByRole('link', { name: 'Try the demo' });
    expect(link).toHaveClass('mkt-double-cta', 'mkt-double-cta--dark');
    expect(link).toHaveAttribute('href', '/demo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByTestId('custom-arrow')).toHaveLength(2);
  });
});
