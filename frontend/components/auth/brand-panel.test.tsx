import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthWordmark } from './brand-panel';

describe('AuthWordmark', () => {
  it('is a named link back to the public home page', () => {
    render(<AuthWordmark />);

    const link = screen.getByRole('link', { name: 'CiteLadder home' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('draws the lockup rather than loading an image of it', () => {
    const { container } = render(<AuthWordmark />);

    // The word used to be baked into a raster lockup, which is why it had no
    // weight and no size. It is text now; the mark is the only drawn part.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('CiteLadder')).toBeInTheDocument();
  });

  it('hides the lockup from assistive technology so the link is named once', () => {
    render(<AuthWordmark />);

    // The link carries the accessible name; an announced wordmark inside it
    // would make the same control read its name twice.
    expect(screen.getByRole('link', { name: 'CiteLadder home' })).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
