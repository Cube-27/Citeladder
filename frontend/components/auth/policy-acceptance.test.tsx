import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vite-plus/test';

import { policiesApi } from '@/lib/api/policies';
import { recordSignupTermsConsent } from '@/lib/auth/terms-consent';

import { PolicyAcceptanceGate } from './policy-acceptance';

vi.mock('@/lib/api/policies', () => ({ policiesApi: { status: vi.fn(), accept: vi.fn() } }));
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeWorkspaceId: 'workspace-a', workspaces: [] }),
}));

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(policiesApi.status).mockReset();
  vi.mocked(policiesApi.accept).mockReset();
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
  renderGate();
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

it('records the decision made at sign-in without a second consent screen', async () => {
  recordSignupTermsConsent();
  renderGate();
  expect(await screen.findByText('Workspace content')).toBeInTheDocument();
  expect(policiesApi.accept).toHaveBeenCalledWith('workspace-a', 'published-1');
  expect(screen.queryByRole('heading', { name: /Terms of Service/ })).not.toBeInTheDocument();
});

it('falls back to the explicit screen when recording the sign-in decision is refused', async () => {
  recordSignupTermsConsent();
  vi.mocked(policiesApi.accept).mockRejectedValueOnce(new Error('revision changed'));
  renderGate();
  expect(await screen.findByRole('button', { name: 'Accept and continue' })).toBeInTheDocument();
  expect(policiesApi.accept).toHaveBeenCalledTimes(1);
});

it('never shows the consent screen while an accepted status is still loading', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof policiesApi.status>>) => void;
  vi.mocked(policiesApi.status).mockReturnValue(
    new Promise((settle) => {
      resolve = settle;
    }),
  );
  renderGate();
  expect(screen.queryByRole('heading', { name: /Terms of Service/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Workspace content')).not.toBeInTheDocument();
  resolve({
    terms_revision: 'published-1',
    privacy_notice_revision: 'notice-1',
    accepted_at: '2026-09-26T00:00:00Z',
  });
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
