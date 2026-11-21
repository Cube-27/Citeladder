import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { queryKeys } from '@/lib/api/query-keys';
import type { SelectionStatus } from '@/lib/project/selection';

import { capabilityRemaining } from './entitlement-capability';
import { EntitlementProvider, useEntitlement } from './entitlement-context';

const WORKSPACE = '22222222-2222-4222-8222-222222222222';

function scope(activeWorkspaceId: string | null, status: SelectionStatus) {
  return { projectSelection: { activeWorkspaceId, status, activeWorkspace: null, workspaces: [] } };
}

function entitlement(capabilities: readonly unknown[]) {
  return {
    workspace_id: WORKSPACE,
    status: 'resolved',
    registry_revision: 'r1',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    credential_mode: 'byok',
    capabilities,
    occupancy: [],
    site_health: { sample_url_limit: 10, count_disclosure: false },
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

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('EntitlementProvider', () => {
  it('drops cached positive authority when a later workspace entitlement read fails', async () => {
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
      scope(WORKSPACE, 'ready'),
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
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json(entitlement([])),
      ),
    );

    renderWithProviders(
      <EntitlementProvider>
        <Probe />
      </EntitlementProvider>,
      scope(null, 'resolving'),
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('unresolved:false');
  });

  it('settles once the workspace entitlement answers, with no project selected', async () => {
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
      scope(WORKSPACE, 'empty'),
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('resolved:true'));
  });
});
