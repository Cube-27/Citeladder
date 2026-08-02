import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';
import type { DiscoveryState } from '@/lib/onboarding/use-discovery';

import { DiscoveryProgress } from './discovery-progress';

function stateWithDomainError(error: unknown, unconfigured = false): DiscoveryState {
  return {
    domains: { status: 'error', data: [], error, unconfigured },
    competitors: { status: 'done', data: [], error: null, unconfigured: false },
    prompts: { status: 'done', data: [], error: null, unconfigured: false },
  };
}

describe('DiscoveryProgress', () => {
  it('shows the safe API failure message and correlation details', () => {
    const error = new ApiError(
      'The default agent rejected the request.',
      502,
      '{"hidden":"raw provider body"}',
      'req-onboarding-1',
      { code: 'agent_call_failed', retryable: true, retryAfterSeconds: 45 },
    );

    render(<DiscoveryProgress state={stateWithDomainError(error)} onRetry={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('The default agent rejected the request.');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'HTTP 502 · code agent_call_failed · retry after 45s · request req-onboarding-1',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw provider body');
  });

  it('labels an unconfigured agent clearly and does not offer a futile retry', () => {
    const error = new ApiError(
      'No default agent is configured.',
      503,
      '',
      'req-onboarding-2',
      { code: 'agent_not_configured', retryable: false },
    );

    render(<DiscoveryProgress state={stateWithDomainError(error, true)} onRetry={vi.fn()} />);

    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No default agent is configured.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('retries only the failed section', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <DiscoveryProgress
        state={stateWithDomainError(new Error('Network connection failed.'))}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('domains');
  });
});
