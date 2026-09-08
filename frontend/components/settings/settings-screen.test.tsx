import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppQueryClient } from '@/lib/api/query-client';
import type { Project, SessionUser } from '@/lib/api/types';

// Stub imperative navigation used by the delete-project flow. Shallow tab
// state uses the browser History API, matching production.
const { replace, entitlementState } = vi.hoisted(() => ({
  replace: vi.fn(),
  entitlementState: { canDeleteProject: false },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  usePathname: () => '/settings',
}));

// Session is mocked per test so the screen renders without a real SessionGuard.
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
vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({
    hasCapability: () => entitlementState.canDeleteProject,
  }),
}));

// Active project context — the danger zone deletes the active project.
const activeProject = {
  id: '00000000-0000-4000-8000-0000000000p1',
  workspace_id: '00000000-0000-4000-8000-0000000000w1',
  name: 'Acme Storage',
  brand_name: 'Acme',
} as unknown as Project;
const nextProject = {
  ...activeProject,
  id: '00000000-0000-4000-8000-0000000000p2',
  name: 'Beta Storage',
} as unknown as Project;
const setActiveProjectId = vi.fn();
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    projects: [activeProject],
    activeProject,
    activeProjectId: activeProject.id,
    setActiveProjectId,
    isLoading: false,
  }),
}));

const deleteProject = vi.fn().mockResolvedValue(undefined);
const listProjects = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/api/projects', () => ({
  projectsApi: {
    deleteProject: (id: string) => deleteProject(id),
    listProjects: () => listProjects(),
  },
}));

// The Provider Settings tab fetches the catalog/connections; stub the panel so
// this suite stays focused on the tab shell (the panel has its own suite in
// provider-settings.test.tsx).
vi.mock('@/components/settings/provider-settings', () => ({
  ProviderSettings: () => <div data-testid="provider-settings-panel">provider settings</div>,
}));

// The Integrations tab fetches connections and owns the OAuth-callback notice;
// stub it the same way (its own suite is integration-settings.test.tsx).
vi.mock('@/components/settings/integration-settings', () => ({
  IntegrationSettings: () => <div data-testid="integration-settings-panel">integrations</div>,
}));

vi.mock('@/components/settings/billing-settings', () => ({
  BillingSettings: () => <div data-testid="billing-settings-panel">billing</div>,
}));

import { SettingsScreen } from './settings-screen';

function renderScreen() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    deleteProject.mockClear();
    listProjects.mockReset();
    listProjects.mockResolvedValue([]);
    replace.mockClear();
    setActiveProjectId.mockClear();
    entitlementState.canDeleteProject = false;
    window.history.replaceState(null, '', '/settings');
  });

  it('renders the available settings tabs with Account selected by default', () => {
    renderScreen();
    const tablist = screen.getByRole('tablist', { name: /settings sections/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Account',
      'Billing',
      'Providers',
      'Integrations',
    ]);
    expect(within(tablist).getByRole('tab', { name: 'Account' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders the session email, account role, and initials avatar', () => {
    renderScreen();

    // Email and role now appear once, in the identity row — the duplicate
    // detail rows that restated both were removed.
    expect(screen.getAllByText('test.user@example.test').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('user').length).toBeGreaterThanOrEqual(1);
    // Initials avatar from the email local part.
    expect(screen.getByText('TE')).toBeInTheDocument();
  });

  it('labels the created timestamp as "Account created", not "Member since"', () => {
    renderScreen();
    expect(screen.getByText('Account created')).toBeInTheDocument();
    expect(screen.queryByText(/member since/i)).not.toBeInTheDocument();
  });

  it('shows the user id and last-updated timestamp when present', () => {
    renderScreen();
    expect(screen.getByText('User ID')).toBeInTheDocument();
    expect(screen.getByText(user.id)).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
  });

  it('does not expose a theme control in the light-only product', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /toggle color theme/i })).not.toBeInTheDocument();
  });

  it('shows the provider settings panel on the Provider Settings tab', async () => {
    const ue = userEvent.setup();
    renderScreen();

    // Panels stay mounted for stable aria-controls targets; inactive ones are hidden.
    expect(screen.getByTestId('provider-settings-panel')).not.toBeVisible();
    await ue.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.getByTestId('provider-settings-panel')).toBeVisible();
    // Account content is hidden while another tab is active.
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

  it('opens Billing from a ?tab=billing deep link', () => {
    window.history.replaceState(null, '', '/settings?tab=billing');
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('billing-settings-panel')).toBeVisible();
  });

  it('opens the Integrations tab from a ?tab=integrations deep link (the C2 OAuth-callback landing)', () => {
    window.history.replaceState(null, '', '/settings?tab=integrations');
    renderScreen();
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('integration-settings-panel')).toBeVisible();
    // The tab's aria-controls resolves to the mounted panel.
    const panelId = screen.getByRole('tab', { name: 'Integrations' }).getAttribute('aria-controls');
    expect(document.getElementById(panelId ?? '')).toContainElement(
      screen.getByTestId('integration-settings-panel'),
    );
  });

  it('shows the integrations panel when the Integrations tab is clicked', async () => {
    const ue = userEvent.setup();
    renderScreen();

    expect(screen.getByTestId('integration-settings-panel')).not.toBeVisible();
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

  it('supports arrow-key navigation across tabs', async () => {
    const ue = userEvent.setup();
    renderScreen();

    const account = screen.getByRole('tab', { name: 'Account' });
    account.focus();
    await ue.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true');
    await ue.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('does not expose project deletion while self-serve billing is unavailable', () => {
    renderScreen();

    expect(screen.queryByRole('tab', { name: 'Danger zone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete project/i })).not.toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it('lets an explicitly entitled development account delete its active project', async () => {
    entitlementState.canDeleteProject = true;
    const ue = userEvent.setup();
    renderScreen();

    await ue.click(screen.getByRole('button', { name: /delete project/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    await ue.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(deleteProject).toHaveBeenCalledWith(activeProject.id);
  });

  it('selects a project from the refreshed list after deletion', async () => {
    entitlementState.canDeleteProject = true;
    listProjects.mockResolvedValue([nextProject]);
    const ue = userEvent.setup();
    renderScreen();

    await ue.click(screen.getByRole('button', { name: /delete project/i }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    await ue.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(setActiveProjectId).toHaveBeenCalledWith(nextProject.id));
    expect(replace).not.toHaveBeenCalled();
  });
});
