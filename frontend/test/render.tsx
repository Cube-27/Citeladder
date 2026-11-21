import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { vi } from 'vite-plus/test';

import { UserMenuController } from '@/components/layout/user-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { BillingUsage, WorkspaceEntitlement } from '@/lib/api/billing';
import { createAppQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { providerCatalogFixture } from './provider-catalog-fixture';
import type { Project, Workspace } from '@citeladder/contracts';
import { roles } from '@/services/api/src/config/workspaces.json';
import { SessionProvider } from '@/lib/auth/session-guard';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { ActiveProjectScopeProvider } from '@/lib/project/active-project-scope';
import {
  ProjectSelectionProvider,
  useProjectContext,
  type ProjectContextValue,
} from '@/lib/project/project-scope';

const TEST_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const TEST_SESSION = {
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'test.user@example.test',
    role: 'user' as const,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  clearSession: async () => {},
};

export type TestRole = keyof typeof roles;

export function testWorkspace(role: TestRole): Workspace {
  return {
    id: TEST_WORKSPACE_ID,
    name: 'Test Workspace',
    role,
    capabilities: [...roles[role]],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

export function selectionAs(role: TestRole): Partial<ProjectContextValue> {
  const workspace = testWorkspace(role);
  return { workspaces: [workspace], activeWorkspace: workspace };
}

export function projectScope(
  project: Project,
  role: TestRole = 'owner',
): Partial<ProjectContextValue> {
  const workspace = { ...testWorkspace(role), id: project.workspace_id };
  return {
    workspaces: [workspace],
    activeWorkspace: workspace,
    activeWorkspaceId: workspace.id,
    projects: [project],
    activeProject: project,
    activeProjectId: project.id,
    status: 'ready',
  };
}

export function testProjectSelection(
  overrides: Partial<ProjectContextValue> = {},
): ProjectContextValue {
  const workspace = testWorkspace('owner');
  return {
    workspaces: [workspace],
    activeWorkspaceId: TEST_WORKSPACE_ID,
    activeWorkspace: workspace,
    setActiveWorkspaceId: vi.fn(),
    projects: [],
    projectsSettled: true,
    activeProject: null,
    activeProjectId: null,
    setActiveProjectId: vi.fn(),
    status: 'empty',
    errorScope: null,
    retry: vi.fn(),
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

export function ResolvedProjectRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { activeProject } = useProjectContext();
  if (!activeProject) return null;
  return (
    <ActiveProjectScopeProvider project={activeProject}>{children}</ActiveProjectScopeProvider>
  );
}

function testQueryClient() {
  const queryClient = createAppQueryClient();
  queryClient.setQueryData(queryKeys.providers.catalog(), providerCatalogFixture);
  return queryClient;
}

export type TestEntitlement = {
  grants?: readonly string[];
  projectSlots?: number;
  managed?: boolean;
  status?: WorkspaceEntitlement['status'] | 'pending';
  usage?: 'empty' | 'network';
};

export function testEntitlement(
  workspaceId: string,
  {
    grants = [],
    projectSlots,
    managed = false,
    status = 'resolved',
  }: Omit<TestEntitlement, 'status'> & { status?: WorkspaceEntitlement['status'] } = {},
): WorkspaceEntitlement {
  return {
    workspace_id: workspaceId,
    status,
    registry_revision: 'test-registry',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    credential_mode: managed ? 'funded' : 'byok',
    capabilities: grants.map((key) => ({
      key,
      type: 'flag',
      value: true,
      valid_until: null,
      provenance: 'effective_grant',
    })),
    occupancy:
      projectSlots === undefined
        ? []
        : [
            {
              key: PROJECT_SLOTS_CAPABILITY,
              allowance: projectSlots + 1,
              consumed: 1,
              remaining: projectSlots,
            },
          ],
    site_health: { sample_url_limit: 10, count_disclosure: false },
  };
}

export function seedEntitlement(
  queryClient: QueryClient,
  workspaceId: string | null,
  entitlement: TestEntitlement,
) {
  if (workspaceId === null) return;
  const queryKey = queryKeys.billing.workspaceEntitlement(workspaceId);
  if (entitlement.status === 'pending')
    void queryClient.prefetchQuery({ queryKey, queryFn: () => new Promise<never>(() => {}) });
  else
    queryClient.setQueryData(
      queryKey,
      testEntitlement(workspaceId, { ...entitlement, status: entitlement.status }),
    );
  if (entitlement.usage === 'network') return;
  const usage: BillingUsage = {
    billing_account_id: '00000000-0000-4000-8000-0000000000b1',
    entitlement_lifecycle_version: 1,
    status: 'resolved',
    items: [],
  };
  queryClient.setQueryData(queryKeys.billing.usage(workspaceId), usage);
}

type ProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  projectSelection?: Partial<ProjectContextValue> | null;
  entitlement?: TestEntitlement;
  queryClient?: QueryClient;
  initialEntries?: MemoryRouterProps['initialEntries'];
};

export function renderWithProviders(ui: ReactElement, options?: ProvidersOptions) {
  const {
    projectSelection,
    entitlement,
    initialEntries,
    queryClient = testQueryClient(),
    ...renderOptions
  } = options ?? {};
  const selection = projectSelection === null ? null : testProjectSelection(projectSelection);
  if (selection && entitlement)
    seedEntitlement(queryClient, selection.activeWorkspaceId, entitlement);

  function Scoped({ children }: Readonly<{ children: ReactNode }>) {
    const scoped = selection?.activeProject ? (
      <ActiveProjectScopeProvider project={selection.activeProject}>
        {children}
      </ActiveProjectScopeProvider>
    ) : (
      children
    );
    return entitlement ? <EntitlementProvider>{scoped}</EntitlementProvider> : scoped;
  }

  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter
        initialEntries={
          initialEntries ?? [
            window.location.pathname + window.location.search + window.location.hash,
          ]
        }
      >
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {selection === null ? (
              children
            ) : (
              <ProjectSelectionProvider value={selection}>
                <SessionProvider value={TEST_SESSION}>
                  <UserMenuController>
                    <Scoped>{children}</Scoped>
                  </UserMenuController>
                </SessionProvider>
              </ProjectSelectionProvider>
            )}
          </TooltipProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
