import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { MarketingNav } from './nav';

afterEach(() => vi.unstubAllEnvs());

describe('marketing navigation', () => {
  it('links account actions to the product origin and keeps the mobile menu accessible', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<MarketingNav />);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      'https://app.citeladder.com/login',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (const link of screen.getAllByRole('link', { name: 'Sign up' })) {
      expect(link).toHaveAttribute('href', 'https://app.citeladder.com/register');
    }
  });
});
