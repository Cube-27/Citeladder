import { screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { HeldContent } from '@/components/layout/first-frame';
import { ProjectSelectionProvider, type ProjectContextValue } from '@/lib/project/project-scope';
import {
  renderWithProviders,
  testProjectSelection,
  testWorkspace,
  type TestRole,
} from '@/test/render';
import { WorkspaceAccessGate } from './workspace-access-gate';

const { access, security, logout, navigate } = vi.hoisted(() => ({
  access: vi.fn(),
  security: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: navigate }));
vi.mock('@/lib/api/auth', () => ({
  authApi: { security, logout },
  authQueries: { security: () => ({ queryKey: ['auth', 'security'], queryFn: () => security() }) },
}));
vi.mock('@/lib/api/workspaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/workspaces')>();
  Object.assign(actual.workspacesApi, { access });
  return actual;
});
vi.mock('@/lib/billing/use-workspace-catalog', () => ({
  useWorkspaceCatalog: () => ({
    isError: false,
    data: {
      catalog_revision: 'commercial-v9',
      country_code: null,
      region: 'international',
      currency: 'USD',
      currency_minor_units: 2,
      plans: [
        {
          key: 'tier_1',
          name: 'Starter',
          description: '',
          cadence: 'monthly',
          self_serve: true,
          contact_only: false,
          contact_url: null,
          base_price: { currency: 'USD', amount_minor: 4900 },
          funded_total_price: null,
          checkout_available: true,
          funded_checkout_available: false,
          unavailable_reason: null,
          capabilities: [],
          trial_availability: 'unavailable',
          trial_unavailable_reason: 'trial_unavailable',
          trial_days: null,
        },
      ],
      addons: [],
      topups: [],
      support_contact: null,
      providers: [],
    },
  }),
}));
beforeEach(() => {
  access.mockReset();
  logout.mockReset();
  navigate.mockReset();
  security.mockResolvedValue({
    email: 'owner@example.test',
    email_verified: true,
    methods: ['google'],
  });
});

function selection(role: TestRole = 'owner', overrides: Partial<ProjectContextValue> = {}) {
  const workspaces = [
    { ...testWorkspace(role), id: 'workspace-a', name: 'Personal' },
    { ...testWorkspace(role), id: 'workspace-b', name: 'Team' },
  ];
  return testProjectSelection({
    workspaces,
    activeWorkspaceId: 'workspace-a',
    activeWorkspace: workspaces[0],
    ...overrides,
  });
}

it.each([false, true])(
  'keeps recovery controls and product content hidden while bootstrap is pending (workspace discovery: %s)',
  async (discovering) => {
    let answer!: (value: { status: string; expires_at: null }) => void;
    access.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { rerender } = renderWithProviders(
      gatedTree(
        discovering
          ? selection('owner', { activeWorkspaceId: null, activeWorkspace: null, isLoading: true })
          : selection(),
      ),
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account security' })).not.toBeInTheDocument();
    expect(screen.queryByText('Private report')).not.toBeInTheDocument();
    expect(screen.getByText('Holding')).toBeInTheDocument();

    if (discovering) rerender(gatedTree());
    await act(async () => answer({ status: 'active', expires_at: null }));
    expect(await screen.findByText('Private report')).toBeInTheDocument();
  },
);

function gatedTree(value: ProjectContextValue = selection()) {
  return (
    <ProjectSelectionProvider value={value}>
      <WorkspaceAccessGate>
        <input aria-label="Shell state" />
        <HeldContent frame={<p>Holding</p>}>Private report</HeldContent>
      </WorkspaceAccessGate>
    </ProjectSelectionProvider>
  );
}

it('keeps the tree above the content mounted while a switched-to workspace answers', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { rerender } = renderWithProviders(gatedTree());
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Shell state'), { target: { value: 'kept' } });

  let answer!: (value: { status: string; expires_at: null }) => void;
  access.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  rerender(
    gatedTree(
      selection('owner', {
        activeWorkspaceId: 'workspace-b',
        activeWorkspace: { ...testWorkspace('owner'), id: 'workspace-b', name: 'Team' },
      }),
    ),
  );
  expect(screen.getByText('Holding')).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Shell state')).toHaveValue('kept');

  await act(async () => answer({ status: 'active', expires_at: null }));
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  expect(screen.getByLabelText('Shell state')).toHaveValue('kept');
  expect(access.mock.calls.map(([id]) => id)).toEqual(['workspace-a', 'workspace-b']);
});

it('leaves invitation acceptance available without waiting for workspace access', () => {
  renderWithProviders(<WorkspaceAccessGate>Invitation acceptance</WorkspaceAccessGate>, {
    initialEntries: ['/invitations/accept'],
    projectSelection: selection(),
  });
  expect(screen.getByText('Invitation acceptance')).toBeInTheDocument();
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
    renderWithProviders(gatedTree());
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

it('reuses a fresh access answer when the gate remounts', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { rerender } = renderWithProviders(
    <WorkspaceAccessGate key="first">Private report</WorkspaceAccessGate>,
    { projectSelection: selection() },
  );
  expect(await screen.findByText('Private report')).toBeInTheDocument();
  access.mockResolvedValue({ status: 'trial_expired', expires_at: null });
  rerender(<WorkspaceAccessGate key="second">Private report</WorkspaceAccessGate>);
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  expect(screen.getByText('Private report')).toBeInTheDocument();
  expect(screen.queryByText('Your trial has ended')).not.toBeInTheDocument();
});

it('rechecks current authority instead of copying another workspace denial', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { queryClient } = renderWithProviders(gatedTree());
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
  renderWithProviders(
    gatedTree(
      selection('owner', {
        activeWorkspaceId: null,
        activeWorkspace: null,
        workspaces: [],
        isError: true,
        retry,
      }),
    ),
  );
  expect(screen.getByText("Couldn't load workspace access")).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Workspace access' })).not.toBeInTheDocument();
  await act(async () => screen.getByRole('button', { name: 'Retry' }).click());
  expect(retry).toHaveBeenCalledOnce();
});

it('reports a failed access read as a retryable error, not as access that ended', async () => {
  vi.useFakeTimers();
  try {
    access.mockRejectedValue(new ApiError('Service unavailable', 503, ''));
    renderWithProviders(gatedTree());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
  } finally {
    vi.useRealTimers();
  }
  expect(screen.getByText("Couldn't load workspace access")).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Workspace access' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
  access.mockResolvedValue({ status: 'active', expires_at: null });
  await act(async () => screen.getByRole('button', { name: 'Retry' }).click());
  expect(await screen.findByText('Private report')).toBeInTheDocument();
});

it('removes visible and cached product evidence when a server request denies access', async () => {
  access.mockResolvedValue({ status: 'active', expires_at: null });
  const { queryClient } = renderWithProviders(gatedTree());
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
  renderWithProviders(gatedTree());
  expect(await screen.findByRole('heading', { name: 'Your trial has ended' })).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute(
    'href',
    '/projects?workspace=workspace-b',
  );
  const account = screen.getByRole('button', { name: 'Account security' });
  account.focus();
  await act(async () => account.click());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Email password setup link' })).toBeEnabled(),
  );
  expect(screen.getByRole('dialog', { name: 'Account security' })).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  await act(async () => screen.getByRole('button', { name: 'Close dialog' }).click());
  await waitFor(() => expect(account).toHaveFocus());
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});

it('offers an ended trial a plan to continue, and tells a member who may buy it', async () => {
  access.mockResolvedValue({
    status: 'trial_expired',
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const { unmount } = renderWithProviders(gatedTree());
  expect(await screen.findByRole('heading', { name: 'Choose a plan' })).toBeInTheDocument();
  expect(screen.getByText('$49 / month')).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  unmount();
  renderWithProviders(gatedTree(selection('member')));
  expect(await screen.findByText('Owner or Admin only.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Choose a plan' })).toBeNull();
});

it('says so when signing out of an ended workspace fails, and leaves on an expired session', async () => {
  access.mockResolvedValue({ status: 'access_unresolved', expires_at: null });
  logout.mockRejectedValueOnce(new ApiError('Service unavailable', 503, ''));
  renderWithProviders(gatedTree());
  const signOutButton = await screen.findByRole('button', { name: 'Sign out' });
  await act(async () => signOutButton.click());
  expect(await screen.findByText(/Sign out failed/)).toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();

  logout.mockRejectedValueOnce(new ApiError('Unauthorized', 401, ''));
  await act(async () => screen.getByRole('button', { name: 'Sign out' }).click());
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
});

it('distinguishes missing authority from an expired trial', async () => {
  access.mockResolvedValue({ status: 'access_unresolved', expires_at: null });
  renderWithProviders(gatedTree());
  expect(await screen.findByRole('link', { name: 'Contact support' })).toBeInTheDocument();
  expect(screen.queryByText('Your trial has ended')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Choose a plan' })).toBeNull();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
});
