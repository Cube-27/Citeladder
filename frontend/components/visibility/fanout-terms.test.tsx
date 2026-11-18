import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { visibilityApi } from '@/lib/api/visibility';
import { ActiveProjectScopeProvider } from '@/lib/project/active-project-scope';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';
import { FanoutTerms } from './fanout-terms';

const A = '11111111-1111-4111-8111-111111111111';

afterEach(() => vi.restoreAllMocks());

it('names each view’s own empty state: no terms counted, none rose, one fell', async () => {
  vi.spyOn(visibilityApi, 'getFanoutTerms').mockResolvedValue({
    kind: 'observed',
    audit_id: A,
    total_searches: 2,
    compared: true,
    unreported_engines: [],
    top: [],
    rising: [],
    falling: [{ term: 'pricing', searches: 0, share: 0, change: -0.5, brands: [] }],
  });
  renderWithProviders(
    <ActiveProjectScopeProvider project={makeProject({ id: A })}>
      <FanoutTerms scope={{ audit_id: A }} enabled />
    </ActiveProjectScopeProvider>,
  );
  expect(await screen.findByText('No terms counted')).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Rising' }));
  expect(screen.getByText('No term rose')).toBeVisible();
  await user.click(screen.getByRole('radio', { name: 'Falling' }));
  expect(screen.getByRole('cell', { name: 'pricing' })).toBeVisible();
});
