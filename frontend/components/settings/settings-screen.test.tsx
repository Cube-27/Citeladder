import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { BrowserRouter } from 'react-router-dom';

import { createAppQueryClient } from '@/lib/api/query-client';
import type { SessionUser } from '@citeladder/contracts';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { ProjectSelectionProvider } from '@/lib/project/project-scope';
import { makeProject } from '@/test/fixtures/project';
import {
  projectScope,
  seedEntitlement,
  testProjectSelection,
  type TestEntitlement,
  type TestRole,
} from '@/test/render';

const { security, passwordLink } = vi.hoisted(() => ({
  security: vi.fn(),
  passwordLink: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({
  authApi: { security, passwordLink },
  authQueries: { security: () => ({ queryKey: ['auth', 'security'], queryFn: () => security() }) },
}));

const user: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test.user@example.test',
  role: 'user',
  is_active: true,
  created_at: '2026-01-03T00:00:00Z',
  updated_at: '2026-07-14T09:22:00Z',
};
vi.mock('@/lib/auth/session-guard', () => ({
  useSessionUser: () => user,
}));

const activeProject = makeProject({
  id: '00000000-0000-4000-8000-0000000000p1',
  workspace_id: '00000000-0000-4000-8000-0000000000w1',
  name: 'Acme Storage',
  brand_name: 'Acme',
});
const nextProject = {
  ...activeProject,
  id: '00000000-0000-4000-8000-0000000000p2',
  name: 'Beta Storage',
};
const setActiveProjectId = vi.fn();

const deleteProject = vi.fn().mockResolvedValue(undefined);
const listProjects = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/api/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/projects')>();
  Object.assign(actual.projectsApi, {
    deleteProject: (id: string) => deleteProject(id),
    listProjects: () => listProjects(),
  });
  return actual;
});

vi.mock('@/components/settings/provider-settings', () => ({
  ProviderSettings: () => <div data-testid="provider-settings-panel">provider settings</div>,
}));

vi.mock('@/components/settings/integration-settings', () => ({
  IntegrationSettings: () => <div data-testid="integration-settings-panel">integrations</div>,
}));

import { SettingsScreen } from './settings-screen';

function renderScreen({
  role = 'owner',
  entitlement = {},
}: { role?: TestRole; entitlement?: TestEntitlement } = {}) {
  const queryClient = createAppQueryClient();
  const selection = testProjectSelection({
    ...projectScope(activeProject, role),
    setActiveProjectId,
  });
  seedEntitlement(queryClient, selection.activeWorkspaceId, entitlement);
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ProjectSelectionProvider value={selection}>
          <EntitlementProvider>
            <SettingsScreen />
          </EntitlementProvider>
        </ProjectSelectionProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    security.mockResolvedValue({ email: user.email, email_verified: true, methods: ['google'] });
    passwordLink.mockReset();
    passwordLink.mockResolvedValue({ message: 'Check your email for the password setup link.' });
    deleteProject.mockClear();
    listProjects.mockReset();
    listProjects.mockResolvedValue([]);
    setActiveProjectId.mockClear();
    window.history.replaceState(null, '', '/settings');
  });

  it('offers password setup directly in Account without navigating away', async () => {
    renderScreen();
    const ue = userEvent.setup();
    await ue.click(await screen.findByRole('button', { name: 'Email password setup link' }));
    await waitFor(() => expect(passwordLink).toHaveBeenCalledWith());
    expect(await screen.findByText('Check your email for the password setup link.')).toBeVisible();
    expect(window.location.pathname).toBe('/settings');
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
  });

  it('names you by email without internal identifiers', () => {
    renderScreen();
    expect(screen.getByText(user.email)).toBeVisible();
    expect(screen.queryByText(user.id)).toBeNull();
    expect(screen.queryByText('User ID')).toBeNull();
  });

  it('shows the provider settings panel on the Provider Settings tab', async () => {
    const ue = userEvent.setup();
    renderScreen();

    expect(screen.getByTestId('provider-settings-panel')).not.toBeVisible();
    await ue.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.getByTestId('provider-settings-panel')).toBeVisible();
    const accountPanelId = screen
      .getByRole('tab', { name: 'Account' })
      .getAttribute('aria-controls');
    expect(document.getElementById(accountPanelId ?? '')).toHaveAttribute('hidden');
  });

  it('opens the Provider Settings tab from a ?tab=providers deep link', () => {
    window.history.replaceState(null, '', '/settings?tab=providers');
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Providers' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('provider-settings-panel')).toBeVisible();
  });

  it('offers no provider settings on a managed plan, even from a deep link', () => {
    window.history.replaceState(null, '', '/settings?tab=providers');
    renderScreen({ entitlement: { managed: true } });
    expect(screen.queryByRole('tab', { name: 'Providers' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the Integrations tab from a ?tab=integrations deep link (the C2 OAuth-callback landing)', () => {
    window.history.replaceState(null, '', '/settings?tab=integrations');
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('integration-settings-panel')).toBeVisible();
    const panelId = screen.getByRole('tab', { name: 'Integrations' }).getAttribute('aria-controls');
    expect(document.getElementById(panelId ?? '')).toContainElement(
      screen.getByTestId('integration-settings-panel'),
    );
  });

  it('shows the integrations panel when the Integrations tab is clicked', async () => {
    const ue = userEvent.setup();
    renderScreen();

    expect(screen.queryByTestId('integration-settings-panel')).toBeNull();
    await ue.click(screen.getByRole('tab', { name: 'Integrations' }));
    expect(screen.getByTestId('integration-settings-panel')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back to Account on an unknown ?tab value', () => {
    window.history.replaceState(null, '', '/settings?tab=nonsense');
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves down the section rail on desktop and along it as a row below desktop', async () => {
    const ue = userEvent.setup();
    const desktop = (wide: boolean) =>
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: wide && query === '(min-width: 981px)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    desktop(true);
    const { unmount } = renderScreen();
    const account = screen.getByRole('tab', { name: 'Account' });
    account.focus();
    await ue.keyboard('{ArrowRight}');
    expect(account).toHaveAttribute('aria-selected', 'true');
    await ue.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    await ue.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'API keys' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    desktop(false);
    window.history.replaceState(null, '', '/settings');
    renderScreen();
    screen.getByRole('tab', { name: 'Account' }).focus();
    await ue.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    vi.unstubAllGlobals();
  });

  it('does not expose project deletion while self-serve billing is unavailable', () => {
    window.history.replaceState(null, '', '/settings?tab=workspace');
    renderScreen();

    expect(screen.queryByRole('tab', { name: 'Danger zone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete project/i })).not.toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('hides project deletion from a role that may not delete, even on a plan that grants it', () => {
    window.history.replaceState(null, '', '/settings?tab=workspace');
    renderScreen({ role: 'member', entitlement: { grants: ['project_deletion'] } });

    expect(screen.queryByRole('button', { name: /delete project/i })).not.toBeInTheDocument();
  });

  it('lets an explicitly entitled development account delete its active project', async () => {
    const ue = userEvent.setup();
    window.history.replaceState(null, '', '/settings?tab=workspace');
    renderScreen({ entitlement: { grants: ['project_deletion'] } });

    await ue.click(screen.getByRole('button', { name: /delete project/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    await ue.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(deleteProject).toHaveBeenCalledWith(activeProject.id);
  });

  it('selects a project from the refreshed list after deletion', async () => {
    listProjects.mockResolvedValue([nextProject]);
    const ue = userEvent.setup();
    window.history.replaceState(null, '', '/settings?tab=workspace');
    renderScreen({ entitlement: { grants: ['project_deletion'] } });

    await ue.click(screen.getByRole('button', { name: /delete project/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    await ue.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(setActiveProjectId).toHaveBeenCalledWith(nextProject.id));
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        `/settings?tab=workspace&project=${nextProject.id}`,
      ),
    );
  });
});
