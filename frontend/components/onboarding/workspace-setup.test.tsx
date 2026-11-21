import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { authApi } from '@/lib/api/auth';
import { workspacesApi } from '@/lib/api/workspaces';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { renderWithProviders } from '@/test/render';

import { WorkspaceSetup } from './workspace-setup';

vi.mock('@/lib/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));

const CREATED = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Acme',
  role: 'owner',
  capabilities: ['read', 'write'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

describe('WorkspaceSetup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates the workspace with a name and the published Terms revision, with no second consent step', async () => {
    vi.spyOn(authApi, 'terms').mockResolvedValue({
      terms_revision: '2026-09-24',
      privacy_notice_revision: '2026-09-24',
      accepted_at: '2026-10-01T00:00:00Z',
    });
    const create = vi.spyOn(workspacesApi, 'create').mockResolvedValue(CREATED);
    const setActiveWorkspaceId = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <WorkspaceSetup />
        <Location />
      </>,
      {
        initialEntries: ['/onboarding'],
        projectSelection: {
          workspaces: [],
          activeWorkspace: null,
          activeWorkspaceId: null,
          status: 'no_workspace',
          setActiveWorkspaceId,
        },
      },
    );

    const submit = await screen.findByRole('button', { name: 'Create workspace' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(screen.getByText('Name your workspace.')).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();

    await user.type(screen.getByLabelText(/^Workspace name/), '  Acme ');
    await user.click(submit);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: 'Acme', termsRevision: '2026-09-24' }),
    );
    expect(setActiveWorkspaceId).toHaveBeenCalledWith(CREATED.id);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/onboarding?workspace=${CREATED.id}`,
      ),
    );
  });
});

describe('WorkspaceSetup without a recorded Terms decision', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ends a session that predates the published Terms instead of showing a consent screen', async () => {
    vi.spyOn(authApi, 'terms').mockResolvedValue({
      terms_revision: '2026-09-24',
      privacy_notice_revision: '2026-09-24',
      accepted_at: null,
    });
    const logout = vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    renderWithProviders(<WorkspaceSetup />, {
      initialEntries: ['/onboarding?setup=workspace'],
      projectSelection: {
        workspaces: [],
        activeWorkspace: null,
        activeWorkspaceId: null,
        status: 'no_workspace',
        setActiveWorkspaceId: vi.fn(),
      },
    });

    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login?error=terms_changed'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/^Workspace name/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
