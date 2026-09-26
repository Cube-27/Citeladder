import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { policiesApi } from '@/lib/api/policies';

import { PolicyAcceptanceGate } from './policy-acceptance';

vi.mock('@/lib/api/policies', () => ({ policiesApi: { status: vi.fn(), accept: vi.fn() } }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeWorkspaceId: 'workspace-a' }),
}));

beforeEach(() => {
  vi.mocked(policiesApi.status).mockResolvedValue({
    terms_revision: 'published-1',
    privacy_notice_revision: 'notice-1',
    accepted_at: null,
  });
  vi.mocked(policiesApi.accept).mockResolvedValue({
    terms_revision: 'published-1',
    privacy_notice_revision: 'notice-1',
    accepted_at: '2026-09-26T00:00:00Z',
  });
});

it('requires an explicit Terms decision before onboarding without turning privacy into consent', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PolicyAcceptanceGate>
        <p>Workspace content</p>
      </PolicyAcceptanceGate>
    </QueryClientProvider>,
  );
  const accept = await screen.findByRole('button', { name: 'Accept and continue' });
  expect(accept).toBeDisabled();
  expect(screen.queryByText('Workspace content')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms of Service.' }));
  await user.click(accept);
  await waitFor(() =>
    expect(policiesApi.accept).toHaveBeenCalledWith('workspace-a', 'published-1'),
  );
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
});
