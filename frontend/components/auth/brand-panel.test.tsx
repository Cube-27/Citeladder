import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { AuthWordmark } from './brand-panel';

afterEach(() => vi.unstubAllEnvs());

describe('AuthWordmark', () => {
  it('links to the website home, not the product origin', () => {
    vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://citeladder.com');
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<AuthWordmark />);

    const link = screen.getByRole('link', { name: 'CiteLadder home' });
    expect(link).toHaveAttribute('href', 'https://citeladder.com/');
  });

  it('renders the official brand logo image', () => {
    const { container } = render(<AuthWordmark />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toContain('citeladder-logo');
  });

  it('hides the lockup from assistive technology so the link is named once', () => {
    render(<AuthWordmark />);

    // The link carries the accessible name; an announced wordmark inside it
    // would make the same control read its name twice.
    expect(screen.getByRole('link', { name: 'CiteLadder home' })).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
