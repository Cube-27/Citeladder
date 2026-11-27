import type { Page } from '@playwright/test';
import { auditStatusSchema } from '@citeladder/contracts/audits';

import { makeProject } from '../../test/fixtures/project';
import { providerCatalogFixture } from '../../test/provider-catalog-fixture';

const FIXTURE_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'shell@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

export const FIXTURE_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const PROJECT_SLOTS_GRANT_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_GRANT_ID = '66666666-6666-4666-8666-666666666666';
const ENTITLEMENT_PERIOD_END = '2030-02-01T00:00:00Z';

const PROJECT_SLOT_ALLOWANCE = 1;

const PERMITTED_ENTITLEMENT = {
  billing_account_id: '44444444-4444-4444-8444-444444444444',
  status: 'resolved',
  errors: [],
  registry_revision: 'entitlements-v1',
  entitlement_lifecycle_version: 1,
  resolved_at: '2030-01-01T00:00:00Z',
  valid_until: ENTITLEMENT_PERIOD_END,
  subscription: {
    catalog_key: 'tier_2',
    credential_mode: 'byok',
    status: 'active',
    current_period_end: ENTITLEMENT_PERIOD_END,
    cancel_at_period_end: false,
    resumable_until: null,
    scheduled_change: null,
  },
  trial_grant: null,
  capabilities: [
    {
      key: 'project_slots',
      capability_type: 'counter.occupancy',
      value: PROJECT_SLOT_ALLOWANCE,
      contributing_grant_ids: [PROJECT_SLOTS_GRANT_ID],
      ordered_draw_grant_ids: [],
    },
    {
      key: 'agent',
      capability_type: 'flag',
      value: true,
      contributing_grant_ids: [AGENT_GRANT_ID],
      ordered_draw_grant_ids: [],
    },
  ],
  grants: [
    {
      grant_id: PROJECT_SLOTS_GRANT_ID,
      source_kind: 'plan',
      key: 'project_slots',
      value: 1,
      valid_from: '2030-01-01T00:00:00Z',
      effective_valid_until: ENTITLEMENT_PERIOD_END,
      revoked_at: null,
      catalog_revision: 'catalog-2030-01',
    },
    {
      grant_id: AGENT_GRANT_ID,
      source_kind: 'plan',
      key: 'agent',
      value: 1,
      valid_from: '2030-01-01T00:00:00Z',
      effective_valid_until: ENTITLEMENT_PERIOD_END,
      revoked_at: null,
      catalog_revision: 'catalog-2030-01',
    },
  ],
} as const;

function permittedUsage(projectCount: number) {
  return {
    billing_account_id: PERMITTED_ENTITLEMENT.billing_account_id,
    entitlement_lifecycle_version: 1,
    status: 'resolved',
    items: [
      {
        key: 'project_slots',
        capability_type: 'counter.occupancy',
        unit: 'project',
        limit_state: 'finite',
        allowance: PROJECT_SLOT_ALLOWANCE,
        consumed: projectCount,
        reserved: 0,
        remaining: Math.max(0, PROJECT_SLOT_ALLOWANCE - projectCount),
        window_started_at: null,
        resets_at: null,
        earliest_expiry: ENTITLEMENT_PERIOD_END,
        grants: [],
      },
    ],
  } as const;
}

function permittedWorkspaceEntitlement(workspaceId: string, projectCount = 1) {
  return {
    workspace_id: workspaceId,
    status: 'resolved',
    occupancy: [
      {
        key: 'project_slots',
        allowance: PROJECT_SLOT_ALLOWANCE,
        consumed: projectCount,
        remaining: Math.max(0, PROJECT_SLOT_ALLOWANCE - projectCount),
      },
    ],
    registry_revision: PERMITTED_ENTITLEMENT.registry_revision,
    entitlement_lifecycle_version: PERMITTED_ENTITLEMENT.entitlement_lifecycle_version,
    valid_until: PERMITTED_ENTITLEMENT.valid_until,
    credential_mode: 'byok',
    site_health: { sample_url_limit: 10, count_disclosure: false },
    capabilities: PERMITTED_ENTITLEMENT.capabilities.map((capability) => ({
      key: capability.key,
      type: capability.capability_type,
      value: capability.value,
      valid_until: PERMITTED_ENTITLEMENT.valid_until,
      provenance: 'effective_grant',
    })),
  } as const;
}

export const FIXTURE_PROJECT = makeProject({
  workspace_id: FIXTURE_WORKSPACE_ID,
  website_url: 'https://acme.example',
  industry: 'general',
  primary_market: 'United States',
});

export function fixtureProjectPath(href: string): string {
  const target = new URL(href, 'https://citeladder.test');
  target.searchParams.set('project', FIXTURE_PROJECT.id);
  return `${target.pathname}?${target.searchParams.toString()}`;
}

function workspacesFor(projects: ReadonlyArray<typeof FIXTURE_PROJECT>) {
  const ids = new Set(projects.map((project) => project.workspace_id));
  if (ids.size === 0) ids.add(FIXTURE_WORKSPACE_ID);
  return membershipRows([...ids]);
}

function membershipRows(ids: readonly string[]) {
  return ids.map((id) => ({
    id,
    name: 'Fixture Workspace',
    role: 'owner',
    capabilities: [
      'manage_billing',
      'manage_credentials',
      'manage_members',
      'read',
      'run',
      'write',
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
}

export async function stubAuthedShell(
  page: Page,
  stubs: ReadonlyArray<readonly [string | RegExp, unknown]> = [],
  projects: ReadonlyArray<typeof FIXTURE_PROJECT> = [FIXTURE_PROJECT],
): Promise<void> {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'e2e fixture: endpoint not stubbed' } }),
    }),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: FIXTURE_USER } }));
  await page.route('**/api/v1/workspaces', (route) =>
    route.fulfill({ json: workspacesFor(projects) }),
  );
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }));
  await page.route('**/api/v1/provider-catalog', (route) =>
    route.fulfill({ json: providerCatalogFixture }),
  );
  for (const project of projects) {
    await /* NOSONAR */ page.route(`**/api/v1/projects/${project.id}`, (route) =>
      route.fulfill({ json: project }),
    );
  }
  await page.route('**/api/v1/billing/entitlement', (route) =>
    route.fulfill({ json: PERMITTED_ENTITLEMENT }),
  );
  for (const workspaceId of new Set(workspacesFor(projects).map((workspace) => workspace.id))) {
    await /* NOSONAR */ page.route(`**/api/v1/workspaces/${workspaceId}/access`, (route) =>
      route.fulfill({ json: { status: 'active', expires_at: null } }),
    );
    await /* NOSONAR */ page.route(`**/api/v1/workspaces/${workspaceId}/entitlements`, (route) =>
      route.fulfill({
        json: permittedWorkspaceEntitlement(workspaceId, projects.length),
      }),
    );
  }
  await page.route('**/api/v1/billing/usage', (route) =>
    route.fulfill({ json: permittedUsage(projects.length) }),
  );
  await page.route('**/api/v1/workspaces/*/policies', (route) =>
    route.fulfill({
      json: {
        terms_revision: '2026-09-24',
        privacy_notice_revision: '2026-09-24',
        accepted_at: '2026-01-01T00:00:00Z',
      },
    }),
  );
  for (const [pattern, body] of stubs) {
    await page.route(pattern, (route) => route.fulfill({ json: body })); // NOSONAR
  }
}

export function auditPageBody(items: ReadonlyArray<{ status: string }>) {
  const count = (status: string) => items.filter((item) => item.status === status).length;
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 10,
    status_counts: Object.fromEntries(
      auditStatusSchema.options.map((status) => [status, count(status)]),
    ),
  };
}
