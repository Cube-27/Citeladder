import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { EntitlementProvider, useEntitlement } from './entitlement-context';

const WORKSPACE = '22222222-2222-4222-8222-222222222222';

let selection: { activeWorkspaceId: string | null; status: string } = {
  activeWorkspaceId: null,
  status: 'resolving',
};

vi.mock('@/lib/project/project-context', () => ({
  useActiveWorkspaceId: () => selection.activeWorkspaceId,
  useProjectContext: () => selection,
}));

function entitlement(capabilities: readonly unknown[]) {
  return {
    workspace_id: WORKSPACE,
    status: 'resolved',
    registry_revision: 'r1',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    capabilities,
    occupancy: [],
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
 * Until the WORKSPACE resolves the entitlement query has nothing to ask about
 * and sits DISABLED — and a disabled query is not `isLoading`. Reading that
 * alone reported a settled "no capabilities" during the busiest moment of a
 * cold start, and the shell drew itself without the controls it was about to
 * gain, then grew them a moment later.
 *
 * The workspace deliberately does NOT come from the active project any more: a
 * workspace with no project still has entitlements, and that is exactly the
 * workspace being asked whether it may create its first one.
 */
describe('EntitlementProvider', () => {
  it('reports unresolved while the workspace is still resolving', async () => {
    selection = { activeWorkspaceId: null, status: 'resolving' };
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

  it('settles once the workspace entitlement answers, with no project selected', async () => {
    selection = { activeWorkspaceId: WORKSPACE, status: 'empty' };
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
