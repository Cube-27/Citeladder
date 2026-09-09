import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { EntitlementProvider, useEntitlement } from './entitlement-context';

const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '11111111-1111-4111-8111-111111111111';

let projectsLoading = true;
let activeProject: { id: string; workspace_id: string } | null = null;

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject, isLoading: projectsLoading }),
}));

function entitlement(capabilities: readonly unknown[]) {
  return {
    workspace_id: WORKSPACE,
    status: 'resolved',
    registry_revision: 'r1',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    capabilities,
  };
}

function Probe() {
  const { isLoading, hasCapability } = useEntitlement();
  return (
    <span data-testid="probe">{`${isLoading ? 'unresolved' : 'resolved'}:${hasCapability('growth_agent')}`}</span>
  );
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

/**
 * The workspace comes from the active project, so the entitlement query sits
 * DISABLED until the project list lands — and a disabled query is not
 * `isLoading`. Reading that alone reported a settled "no capabilities" during
 * the busiest moment of a cold start, and the shell drew itself without the
 * controls it was about to gain, then grew them a moment later.
 */
describe('EntitlementProvider', () => {
  it('reports unresolved while the project list is still loading', async () => {
    projectsLoading = true;
    activeProject = null;
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json(entitlement([])),
      ),
    );

    renderWithProviders(
      <EntitlementProvider>
        <Probe />
      </EntitlementProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('unresolved:false');
  });

  it('settles once the workspace entitlement answers', async () => {
    projectsLoading = false;
    activeProject = { id: PROJECT, workspace_id: WORKSPACE };
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json(
          entitlement([
            {
              key: 'growth_agent',
              type: 'flag',
              value: true,
              valid_until: null,
              provenance: 'effective_grant',
            },
          ]),
        ),
      ),
    );

    renderWithProviders(
      <EntitlementProvider>
        <Probe />
      </EntitlementProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('resolved:true'));
  });
});
