import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScreenSkeleton } from './screen-states';

describe('ScreenSkeleton', () => {
  it('shows meaningful progress while reserving the dashboard layout', () => {
    render(<ScreenSkeleton label="Checking Site Health access…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking Site Health access…');
    expect(screen.getByTestId('site-health-skeleton')).toHaveAttribute('aria-busy', 'true');
  });
});
