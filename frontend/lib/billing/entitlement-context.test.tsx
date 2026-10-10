import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { queryKeys } from '@/lib/api/query-keys';

import { EntitlementProvider, useEntitlement, capabilityRemaining } from './entitlement-context';

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
  const { isLoading, hasCapability, entitlement: data } = useEntitlement();
  return (
    <>
      <span data-testid="probe">{`${isLoading ? 'unresolved' : 'resolved'}:${hasCapability('agent')}`}</span>
      <span data-testid="project-slots">
        {capabilityRemaining(data, 'project_slots') ?? 'unknown'}
      </span>
    </>
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
  it('drops cached positive authority when a later workspace entitlement read fails', async () => {
    selection = { activeWorkspaceId: WORKSPACE, status: 'ready' };
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json({
          ...entitlement([
            {
              key: 'agent',
              type: 'flag',
              value: true,
              valid_until: null,
              provenance: 'effective_grant',
            },
          ]),
          occupancy: [{ key: 'project_slots', allowance: 1, consumed: 0, remaining: 1 }],
        }),
      ),
    );
    const { queryClient } = renderWithProviders(
      <EntitlementProvider>
        <Probe />
      </EntitlementProvider>,
    );
    expect(await screen.findByText('resolved:true')).toBeInTheDocument();
    expect(screen.getByTestId('project-slots')).toHaveTextContent('1');
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json({ error: { message: 'Unavailable' } }, { status: 403 }),
      ),
    );
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.billing.workspaceEntitlement(WORKSPACE),
        exact: true,
      });
    });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('resolved:false'));
    expect(screen.getByTestId('project-slots')).toHaveTextContent('unknown');
  });

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
              key: 'agent',
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
