import { screen, act, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import { WorkspaceAccessGate } from './workspace-access-gate';

const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('@/lib/api/workspaces', () => ({ workspacesApi: { access } }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    activeWorkspaceId: 'workspace-a',
    workspaces: [
      { id: 'workspace-a', name: 'Personal' },
      { id: 'workspace-b', name: 'Team' },
    ],
  }),
}));
beforeEach(() => access.mockReset());

it('removes visible and cached product evidence when a server request denies access', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { queryClient } = renderWithProviders(
    <WorkspaceAccessGate>Private report</WorkspaceAccessGate>,
  );
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  queryClient.setQueryData(['projects', 'detail', 'project-a'], { name: 'Private' });
  await act(async () => {
    await queryClient
      .fetchQuery({
        queryKey: ['projects', 'read', 'project-a'],
        queryFn: () =>
          Promise.reject(
            new ApiError('Access ended', 403, '', undefined, { code: 'trial_expired' }),
          ),
      })
      .catch(() => undefined);
  });
  await waitFor(() => expect(screen.queryByText('Private report')).not.toBeInTheDocument());
  expect(queryClient.getQueryData(['projects', 'detail', 'project-a'])).toBeUndefined();
});

it('blocks expired product content and leaves support, switching and account recovery available', async () => {
  access.mockResolvedValue({
    status: 'trial_expired',
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  renderWithProviders(<WorkspaceAccessGate>Private report</WorkspaceAccessGate>);
  expect(await screen.findByRole('heading', { name: 'Your trial has ended' })).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute(
    'href',
    '/projects?workspace=workspace-b',
  );
  expect(screen.getByRole('link', { name: 'Account security' })).toHaveAttribute(
    'href',
    '/account-security',
  );
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});

it('distinguishes missing authority from an expired trial', async () => {
  access.mockResolvedValue({ status: 'access_unresolved', expires_at: null });
  renderWithProviders(<WorkspaceAccessGate>Private report</WorkspaceAccessGate>);
  expect(await screen.findByRole('link', { name: 'Contact support' })).toBeInTheDocument();
  expect(screen.queryByText('Your trial has ended')).not.toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
});
