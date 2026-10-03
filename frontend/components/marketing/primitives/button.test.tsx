import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { DemoButtonLink, IconButtonLink } from './button';

it('keeps demo enquiries on the CiteLadder contact page in the same tab', () => {
  render(<DemoButtonLink />);
  const link = screen.getByRole('link', { name: /Book a demo/ });
  expect(link).toHaveAttribute('href', '/contact');
  expect(link).not.toHaveAttribute('target');
});

describe('IconButtonLink', () => {
  it('uses the shared button primitive with its icon and new-tab behavior', () => {
    render(
      <IconButtonLink
        href="/demo"
        title="Try the demo"
        variant="dark"
        openInNewTab
        icon={<svg data-testid="custom-arrow" />}
      />,
    );

    const link = screen.getByRole('link', { name: 'Try the demo' });
    expect(link).toHaveAttribute('href', '/demo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByTestId('custom-arrow')).toHaveLength(1);
  });
});
