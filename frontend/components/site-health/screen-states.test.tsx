import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScreenHeader, ScreenSkeleton } from './screen-states';

describe('ScreenHeader', () => {
  it('keeps page actions in normal flow so the scroll viewport cannot clip them', () => {
    render(<ScreenHeader actions={<button type="button">Run new crawl</button>} />);

    const action = screen.getByRole('button', { name: 'Run new crawl' });
    expect(action.parentElement).not.toHaveClass('-mt-12');
  });
});

describe('ScreenSkeleton', () => {
  it('shows meaningful progress while reserving the dashboard layout', () => {
    render(<ScreenSkeleton label="Checking Site Health access…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking Site Health access…');
    expect(screen.getByTestId('site-health-skeleton')).toHaveAttribute('aria-busy', 'true');
  });
});
