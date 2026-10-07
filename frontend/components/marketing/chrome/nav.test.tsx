import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { MarketingNav } from './nav';

afterEach(() => vi.unstubAllEnvs());

describe('marketing navigation', () => {
  it('links account actions to the product origin and keeps the mobile menu accessible', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', 'true');
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
    const signUps = screen.getAllByRole('link', { name: 'Start free trial' });
    expect(signUps.length).toBeGreaterThan(0);
    for (const link of signUps) {
      expect(link).toHaveAttribute('href', 'https://app.citeladder.com/register');
    }
  });

  it('offers log in but no sign-up while self-serve sign-up is closed', async () => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', 'false');
    render(<MarketingNav />);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getAllByRole('link', { name: 'Log in' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Start free trial' })).not.toBeInTheDocument();
  });

  it('returns Escape focus to the disclosure button and keeps the panel closed', async () => {
    const user = userEvent.setup();
    render(<MarketingNav />);
    const toggle = screen.getByRole('button', { name: 'Toggle Platform menu' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /AI Visibility Track/ })).not.toBeInTheDocument();
  });
});
