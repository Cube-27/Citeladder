import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { MarketingNav } from './nav';

afterEach(() => vi.unstubAllEnvs());

describe('marketing navigation', () => {
  it('offers only log in and sign up, both on the product origin', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', 'true');
    render(<MarketingNav />);
    expect(screen.getAllByText('Log in')[0].closest('a')).toHaveAttribute(
      'href',
      'https://app.citeladder.com/login',
    );
    expect(screen.queryByText(/book a demo/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Open menu'));
    expect(screen.getByLabelText('Close menu')).toHaveAttribute('aria-expanded', 'true');
    const signUps = screen.getAllByText('Sign up').map((label) => label.closest('a'));
    expect(signUps.length).toBeGreaterThan(0);
    for (const link of signUps) {
      expect(link).toHaveAttribute('href', 'https://app.citeladder.com/register');
    }
  });

  it('offers log in but no sign-up while self-serve sign-up is closed', async () => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', 'false');
    render(<MarketingNav />);
    await userEvent.click(screen.getByLabelText('Open menu'));

    expect(screen.getAllByText('Log in').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sign up')).not.toBeInTheDocument();
  });

  it('keeps a hover-opened menu open when its trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<MarketingNav />);
    const trigger = screen.getByRole('button', { name: 'Platform' });
    await user.hover(trigger);
    // Hover intent: the first panel opens after a short rest, not instantly.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a menu from its trigger and returns focus there on Escape', async () => {
    const user = userEvent.setup();
    render(<MarketingNav />);
    const trigger = screen.getByRole('button', { name: 'Platform' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Platform overview/ })).toHaveAttribute(
      'href',
      '/platform',
    );
    await user.tab();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /Platform overview/ })).not.toBeInTheDocument();
  });
});
