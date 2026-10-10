import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { Workspace } from '@/lib/api/types';
import { workspacesApi } from '@/lib/api/workspaces';
import { renderWithProviders } from '@/test/render';

import { WorkspaceChooser } from './workspace-chooser';

function workspace(id: string, name: string, role: string): Workspace {
  return {
    id,
    name,
    role,
    capabilities: ['read'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
const OWN = workspace('11111111-1111-4111-8111-111111111111', 'Acme', 'owner');
const INVITED = workspace('22222222-2222-4222-8222-222222222222', 'Globex', 'admin');

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function choose(workspaces: Workspace[], status: 'empty' | 'no_workspace' = 'empty') {
  const setActiveWorkspaceId = vi.fn();
  renderWithProviders(
    <>
      <WorkspaceChooser />
      <Location />
    </>,
    {
      initialEntries: ['/workspaces'],
      projectSelection: {
        workspaces,
        activeWorkspace: workspaces[0] ?? null,
        activeWorkspaceId: workspaces[0]?.id ?? null,
        setActiveWorkspaceId,
        status,
      },
    },
  );
  return setActiveWorkspaceId;
}

describe('WorkspaceChooser', () => {
  beforeEach(() => {
    vi.spyOn(workspacesApi, 'access').mockImplementation(async (id) =>
      id === INVITED.id
        ? { status: 'trial_expired', expires_at: '2026-01-08T00:00:00Z' }
        : { status: 'active', expires_at: null },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('goes straight into the only workspace a person owns', async () => {
    const select = choose([OWN]);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/projects?workspace=${OWN.id}`),
    );
    expect(select).toHaveBeenCalledWith(OWN.id);
  });

  it('sends someone who belongs to no workspace to set one up', async () => {
    choose([], 'no_workspace');
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/onboarding?setup=workspace'),
    );
  });

  it('offers an invited workspace beside setting up your own, with its access', async () => {
    const select = choose([INVITED]);
    expect(await screen.findByText('Trial ended')).toBeVisible();
    expect(screen.getByText('Admin')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set up your own workspace' })).toHaveAttribute(
      'href',
      '/onboarding?setup=workspace',
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /Globex/ }));
    expect(select).toHaveBeenCalledWith(INVITED.id);
    expect(screen.getByTestId('location')).toHaveTextContent(`/projects?workspace=${INVITED.id}`);
  });

  it('lists your own workspace and invited ones without offering a second of your own', () => {
    choose([OWN, INVITED]);
    expect(screen.getByRole('button', { name: /Acme/ })).toHaveTextContent('Your workspace');
    expect(screen.getByRole('button', { name: /Globex/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Set up your own workspace' })).toBeNull();
  });
});
