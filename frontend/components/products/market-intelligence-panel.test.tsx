import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarketIntelligencePanel } from './market-intelligence-panel';

type Queries = ComponentProps<typeof MarketIntelligencePanel>['queries'];

function marketQueries(
  mutate: ReturnType<typeof vi.fn>,
  mutateAsync: ReturnType<typeof vi.fn>,
): Queries {
  return {
    comparisonsQuery: { isLoading: false, data: [] },
    createMutation: {
      mutate,
      mutateAsync,
      isPending: false,
      error: null,
    },
  } as unknown as Queries;
}

describe('MarketIntelligencePanel', () => {
  it('submits through mutate so API failures stay in mutation state', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    const mutateAsync = vi.fn();

    render(
      <MarketIntelligencePanel
        projectId="11111111-1111-4111-8111-111111111111"
        queries={marketQueries(mutate, mutateAsync)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create comparison' }));

    expect(mutate).toHaveBeenCalledWith(undefined);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
