import { render, screen } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

import { DemoButtonLink } from './button';

it('keeps demo enquiries on the CiteLadder contact page in the same tab', () => {
  render(<DemoButtonLink />);
  const link = screen.getByRole('link', { name: /Book a demo/ });
  expect(link).toHaveAttribute('href', '/contact');
  expect(link).not.toHaveAttribute('target');
});
