import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { policiesApi } from '@/lib/api/policies';
import { hardNavigate } from '@/lib/navigation/hard-navigate';

import { PolicyAcceptanceGate } from './policy-acceptance';

vi.mock('@/lib/api/policies', () => ({ policiesApi: { status: vi.fn(), accept: vi.fn() } }));
vi.mock('@/lib/api/auth', () => ({ authApi: { logout: vi.fn() } }));
vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeWorkspaceId: 'workspace-a', workspaces: [] }),
}));

const UNACCEPTED = {
  terms_revision: 'published-1',
  privacy_notice_revision: 'notice-1',
  accepted_at: null,
};
const ACCEPTED = { ...UNACCEPTED, accepted_at: '2026-09-26T00:00:00Z' };

beforeEach(() => {
  vi.mocked(policiesApi.status).mockReset();
  vi.mocked(policiesApi.accept).mockReset();
  vi.mocked(authApi.logout).mockReset();
  vi.mocked(hardNavigate).mockReset();
  vi.mocked(policiesApi.status).mockResolvedValue(UNACCEPTED);
  vi.mocked(policiesApi.accept).mockResolvedValue(ACCEPTED);
  vi.mocked(authApi.logout).mockResolvedValue(undefined);
});

it('opens a workspace already accepted on the current revision without recording again', async () => {
  vi.mocked(policiesApi.status).mockResolvedValue(ACCEPTED);
  renderGate();
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.accept).not.toHaveBeenCalled();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('records the sign-in decision for a workspace without asking on a second screen', async () => {
  renderGate();
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.accept).toHaveBeenCalledWith('workspace-a', 'published-1');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('heading', { name: /Terms of Service/ })).toBeNull();
});

it('ends a session that predates the published Terms and sends the person to sign in', async () => {
  vi.mocked(policiesApi.accept).mockRejectedValue(
    new ApiError('The Terms of Service changed.', 409, '', undefined, {
      code: 'terms_decision_required',
    }),
  );
  renderGate();
  await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login?error=terms_changed'));
  expect(authApi.logout).toHaveBeenCalledTimes(1);
  expect(policiesApi.accept).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Workspace content')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('keeps product content behind a retryable error when recording fails for another reason', async () => {
  vi.mocked(policiesApi.accept).mockRejectedValueOnce(new ApiError('Server error', 500, ''));
  const user = userEvent.setup();
  renderGate();
  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(screen.queryByText('Workspace content')).toBeNull();
  expect(hardNavigate).not.toHaveBeenCalled();
  await user.click(retry);
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.accept).toHaveBeenCalledTimes(2);
});

it('shows only the loading frame while an accepted status is still loading', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof policiesApi.status>>) => void;
  vi.mocked(policiesApi.status).mockReturnValue(
    new Promise((settle) => {
      resolve = settle;
    }),
  );
  renderGate();
  expect(screen.queryByText('Workspace content')).toBeNull();
  resolve(ACCEPTED);
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.accept).not.toHaveBeenCalled();
});

it('steps aside on the workspace chooser, where a person may be leaving this workspace', () => {
  renderGate('/workspaces');
  expect(screen.getByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.status).not.toHaveBeenCalled();
});

function renderGate(path = '/projects') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <PolicyAcceptanceGate>
          <p>Workspace content</p>
        </PolicyAcceptanceGate>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
