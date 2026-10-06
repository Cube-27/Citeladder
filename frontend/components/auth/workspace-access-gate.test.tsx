import { screen, act, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderWithProviders } from '@/test/render';
import { WorkspaceAccessGate } from './workspace-access-gate';

const { access, project } = vi.hoisted(() => ({ access: vi.fn(), project: vi.fn() }));
vi.mock('@/lib/api/workspaces', () => ({ workspacesApi: { access } }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: project,
}));
beforeEach(() => {
  access.mockReset();
  project.mockReturnValue({
    activeWorkspaceId: 'workspace-a',
    isLoading: false,
    retry: vi.fn(),
    workspaces: [
      { id: 'workspace-a', name: 'Personal' },
      { id: 'workspace-b', name: 'Team' },
    ],
  });
});

it.each([false, true])(
  'keeps recovery controls and product content hidden while bootstrap is pending (workspace discovery: %s)',
  async (discovering) => {
    const resolvedProject = project();
    if (discovering) {
      project.mockReturnValue({ ...resolvedProject, activeWorkspaceId: null, isLoading: true });
    }
    let answer!: (value: { status: string; expires_at: null }) => void;
    access.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { rerender } = renderWithProviders(
      <WorkspaceAccessGate>Private report</WorkspaceAccessGate>,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account security' })).not.toBeInTheDocument();
    expect(screen.queryByText('Private report')).not.toBeInTheDocument();

    if (discovering) {
      project.mockReturnValue(resolvedProject);
      rerender(<WorkspaceAccessGate>Private report</WorkspaceAccessGate>);
    }
    await act(async () => answer({ status: 'active', expires_at: null }));
    expect(await screen.findByText('Private report')).toBeInTheDocument();
  },
);

it('leaves account recovery available without waiting for workspace access', () => {
  renderWithProviders(<WorkspaceAccessGate>Account recovery</WorkspaceAccessGate>, {
    initialEntries: ['/account-security'],
  });
  expect(screen.getByText('Account recovery')).toBeInTheDocument();
  expect(access).not.toHaveBeenCalled();
});

it('keeps distant paid deadlines active until expiry without overflowing the browser timer', async () => {
  vi.useFakeTimers();
  try {
    const duration = 30 * 86400000;
    access.mockResolvedValue({
      status: 'active',
      expires_at: new Date(Date.now() + duration).toISOString(),
    });
    renderWithProviders(<WorkspaceAccessGate>Private report</WorkspaceAccessGate>);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('Private report')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(duration - 2);
    });
    expect(access).toHaveBeenCalledOnce();
    expect(screen.getByText('Private report')).toBeInTheDocument();
    access.mockResolvedValue({ status: 'access_unresolved', expires_at: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(access).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it('rechecks current authority instead of copying another workspace denial', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { queryClient } = renderWithProviders(
    <WorkspaceAccessGate>Private report</WorkspaceAccessGate>,
  );
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  await act(async () => {
    await queryClient
      .fetchQuery({
        queryKey: ['projects', 'list', 'old-workspace'],
        queryFn: () =>
          Promise.reject(new ApiError('Expired', 403, '', undefined, { code: 'trial_expired' })),
      })
      .catch(() => undefined);
  });
  await waitFor(() => expect(access).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Private report')).toBeInTheDocument();
});

it('offers retry when workspace discovery has failed without an active workspace', async () => {
  const retry = vi.fn();
  project.mockReturnValue({ activeWorkspaceId: null, workspaces: [], isLoading: false, retry });
  renderWithProviders(<WorkspaceAccessGate>Private report</WorkspaceAccessGate>);
  await act(async () => screen.getByRole('button', { name: 'Retry' }).click());
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByText('Checking your access…')).not.toBeInTheDocument();
});

it('removes visible and cached product evidence when a server request denies access', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { queryClient } = renderWithProviders(
    <WorkspaceAccessGate>Private report</WorkspaceAccessGate>,
  );
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  queryClient.setQueryData(['projects', 'detail', 'project-a'], { name: 'Private' });
  access.mockResolvedValue({ status: 'trial_expired', expires_at: null });
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
