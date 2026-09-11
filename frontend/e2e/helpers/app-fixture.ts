import type { Page } from '@playwright/test';

/**
 * Authed-shell network fixture for e2e + visual specs.
 *
 * The app authenticates by cookie session: `SessionGuard` calls
 * `GET /api/v1/auth/me`, `ProjectProvider` calls `GET /api/v1/workspaces` and
 * `GET /api/v1/projects`, and `EntitlementProvider` calls the billing
 * entitlement and usage endpoints. The workspace list is what resolves the
 * shell's workspace — it is answered independently of any project, because a
 * workspace with none is still a workspace.
 * Stubbing those endpoints is the whole "logged in with one project" arrangement
 * — no token needs seeding. Feature-permitted shell fixtures also provide a
 * schema-valid resolved billing entitlement; negative access states
 * belong in specs that explicitly exercise denied or unresolved behavior.
 */
const FIXTURE_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'shell@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

/** The workspace every fixture account belongs to. */
export const FIXTURE_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const PROJECT_SLOTS_GRANT_ID = '33333333-3333-4333-8333-333333333333';
const CONTENT_CREATION_GRANT_ID = '55555555-5555-4555-8555-555555555555';
const GROWTH_AGENT_GRANT_ID = '66666666-6666-4666-8666-666666666666';
const ENTITLEMENT_PERIOD_END = '2030-02-01T00:00:00Z';

/** A bounded, resolved account state for feature-permitted shell flows. */
export const PERMITTED_ENTITLEMENT = {
  billing_account_id: '44444444-4444-4444-8444-444444444444',
  status: 'resolved',
  errors: [],
  registry_revision: 'entitlements-v1',
  entitlement_lifecycle_version: 1,
  resolved_at: '2030-01-01T00:00:00Z',
  valid_until: ENTITLEMENT_PERIOD_END,
  subscription: {
    catalog_key: 'tier_2',
    status: 'active',
    current_period_end: ENTITLEMENT_PERIOD_END,
    cancel_at_period_end: false,
  },
  trial_grant: null,
  capabilities: [
    {
      key: 'project_slots',
      capability_type: 'counter.occupancy',
      value: 1,
      contributing_grant_ids: [PROJECT_SLOTS_GRANT_ID],
      ordered_draw_grant_ids: [],
    },
    {
      key: 'content_creation',
      capability_type: 'flag',
      value: true,
      contributing_grant_ids: [CONTENT_CREATION_GRANT_ID],
      ordered_draw_grant_ids: [],
    },
    {
      key: 'growth_agent',
      capability_type: 'flag',
      value: true,
      contributing_grant_ids: [GROWTH_AGENT_GRANT_ID],
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
      grant_id: CONTENT_CREATION_GRANT_ID,
      source_kind: 'plan',
      key: 'content_creation',
      value: 1,
      valid_from: '2030-01-01T00:00:00Z',
      effective_valid_until: ENTITLEMENT_PERIOD_END,
      revoked_at: null,
      catalog_revision: 'catalog-2030-01',
    },
    {
      grant_id: GROWTH_AGENT_GRANT_ID,
      source_kind: 'plan',
      key: 'growth_agent',
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
        allowance: 1,
        consumed: projectCount,
        reserved: 0,
        remaining: Math.max(0, 1 - projectCount),
        window_started_at: null,
        resets_at: null,
        earliest_expiry: ENTITLEMENT_PERIOD_END,
        grants: [],
      },
    ],
  } as const;
}

export function permittedWorkspaceEntitlement(workspaceId: string) {
  return {
    workspace_id: workspaceId,
    status: 'resolved',
    // Member-safe occupancy hints: the shell reads its remaining project
    // allowance from here rather than from the owner-private usage report.
    occupancy: [{ key: 'project_slots', allowance: 10, consumed: 1, remaining: 9 }],
    registry_revision: PERMITTED_ENTITLEMENT.registry_revision,
    entitlement_lifecycle_version: PERMITTED_ENTITLEMENT.entitlement_lifecycle_version,
    valid_until: PERMITTED_ENTITLEMENT.valid_until,
    capabilities: PERMITTED_ENTITLEMENT.capabilities.map((capability) => ({
      key: capability.key,
      type: capability.capability_type,
      value: capability.value,
      valid_until: PERMITTED_ENTITLEMENT.valid_until,
      provenance: 'effective_grant',
    })),
  } as const;
}

export const FIXTURE_PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Acme',
  brand_name: 'Acme',
  website_url: 'https://acme.example',
  industry: 'general',
  subindustry: '',
  primary_market: 'United States',
  country_code: 'US',
  language_code: 'en',
  benchmark_mode: 'consumer_like',
  default_repetitions: 3,
  brand: { aliases: [] },
  owned_domains: [],
  unintended_domains: [],
  competitors: [],
  prompt_sets: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as const;

/**
 * Stub the two shell endpoints, plus a 404 catch-all for everything else
 * under `/api/v1/`. The catch-all is what makes screenshots deterministic:
 * 4xx never retries (lib/api/query-client.ts), so every unstubbed data query
 * settles into its empty/error state in ONE attempt instead of flapping
 * between skeleton and error across the two-retry window. It is also what
 * keeps an unstubbed downstream call (GettingStartedCard's audits query, the
 * shell EntitlementProvider's entitlement query) from falling through to a
 * live backend, 401-ing, and tripping the session guard's "any 401 → logout"
 * path — which is how a spec that only stubs auth/me + projects ends up
 * bounced to /login.
 *
 * Playwright matches routes in reverse registration order, so register the
 * catch-all FIRST and the specific stubs after it; the last-registered
 * matching route wins. `stubs` lets a spec layer its own endpoints on top.
 */
/** One membership row per workspace the fixture projects belong to. */
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
    // The Owner's effective capabilities, as the backend's one role policy
    // publishes them. The shell gates controls on these names.
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

/**
 * Answer the shell's membership read for a spec that builds its own network
 * fixture.
 *
 * `ProjectProvider` resolves its workspace from `GET /workspaces` before it
 * scopes a single request, so a spec that leaves this to a 404 catch-all never
 * reaches the shell at all — the workspace read fails and the gate shows its
 * recoverable error instead of the screen under test.
 */
export async function stubWorkspaceList(page: Page, ...workspaceIds: string[]): Promise<void> {
  await page.route('**/api/v1/workspaces', (route) =>
    route.fulfill({ json: membershipRows(workspaceIds) }),
  );
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
      body: JSON.stringify({ detail: 'e2e fixture: endpoint not stubbed' }),
    }),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: FIXTURE_USER } }));
  // Answered even when `projects` is empty: the shell resolves its workspace
  // from here, not from a project, so an empty account still has a workspace to
  // scope its reads (and its allowance check) against.
  await page.route('**/api/v1/workspaces', (route) =>
    route.fulfill({ json: workspacesFor(projects) }),
  );
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }));
  await page.route('**/api/v1/billing/entitlement', (route) =>
    route.fulfill({ json: PERMITTED_ENTITLEMENT }),
  );
  for (const workspaceId of new Set(workspacesFor(projects).map((workspace) => workspace.id))) {
    await page.route(`**/api/v1/workspaces/${workspaceId}/entitlements`, (route) =>
      route.fulfill({ json: permittedWorkspaceEntitlement(workspaceId) }),
    );
  }
  await page.route('**/api/v1/billing/usage', (route) =>
    route.fulfill({ json: permittedUsage(projects.length) }),
  );
  for (const [pattern, body] of stubs) {
    await page.route(pattern, (route) => route.fulfill({ json: body }));
  }
}
