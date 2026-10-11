import { screen } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';

import { renderWithProviders } from '@/test/render';
import { MutationNotice } from './mutation-notice';

it('sends a plan-limit refusal to billing and leaves other refusals without that route', () => {
  const { unmount } = renderWithProviders(
    <MutationNotice
      notice={{
        message: 'Your plan includes 3 projects, and this workspace has 3',
        retryable: false,
        code: 'occupancy_limit_exceeded',
      }}
    />,
  );
  expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', '/billing');
  unmount();
  renderWithProviders(
    <MutationNotice
      notice={{ message: 'That prompt already exists', retryable: false, code: 'conflict' }}
    />,
  );
  expect(screen.getByText('That prompt already exists')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'See plans' })).toBeNull();
});
