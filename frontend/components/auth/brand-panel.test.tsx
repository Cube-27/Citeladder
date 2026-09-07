import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthWordmark } from './brand-panel';

describe('AuthWordmark', () => {
  it('is a named link back to the public home page', () => {
    render(<AuthWordmark />);

    const link = screen.getByRole('link', { name: 'CiteLadder home' });
    expect(link).toHaveAttribute('href', '/');
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
