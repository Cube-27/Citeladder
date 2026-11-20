import { delay, http, HttpResponse, type DefaultBodyType, type JsonBodyType } from 'msw';
import { waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';

import { createAppQueryClient, setAppQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { mswServer } from '@/test/msw-server';
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ACTIVE_WORKSPACE_STORAGE_KEY,
} from '@/lib/project/active-project-storage';

import { bootstrapPrivateRoutes } from './bootstrap-loader';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  role: 'user',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const WORKSPACE_ROW = {
  id: WORKSPACE,
  name: 'Test Workspace',
  role: 'owner',
  capabilities: ['manage_billing', 'manage_credentials', 'manage_members', 'read', 'run', 'write'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const PROJECT_ROW = {
  id: PROJECT,
  workspace_id: WORKSPACE,
  name: 'Acme',
  brand_name: 'Acme',
  website_url: 'https://acme.example',
  industry: 'software',
  subindustry: 'analytics',
  primary_market: 'US',
  country_code: 'US',
  language_code: 'en',
  benchmark_mode: 'consumer_like',
  default_repetitions: 1,
  brand: { alias_suggestions: [], aliases: [], logo_url: null },
  owned_domains: ['acme.example'],
  unintended_domains: [],
  competitors: [],
  prompt_sets: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** What the workspace's list carries for the project. */
const PROJECT_SUMMARY = {
  id: PROJECT,
  name: 'Acme',
  brand_name: 'Acme',
  website_url: 'https://acme.example',
  brand: { logo_url: null },
};

function entitlement(remainingProjectSlots: number) {
  return {
    workspace_id: WORKSPACE,
    status: 'resolved',
    registry_revision: 'r1',
    entitlement_lifecycle_version: 1,
    valid_until: null,
    credential_mode: 'byok',
    capabilities: [],
    occupancy: [
      {
        key: 'project_slots',
        allowance: 3,
        consumed: 3 - remainingProjectSlots,
        remaining: remainingProjectSlots,
      },
    ],
    site_health: { sample_url_limit: 10, count_disclosure: false },
  };
}

function stub({ projects, slots = 1 }: { projects: unknown[]; slots?: number }) {
  mswServer.use(
    http.get('/api/v1/auth/me', () => HttpResponse.json({ user: USER })),
    http.get('/api/v1/workspaces', () => HttpResponse.json([WORKSPACE_ROW])),
    http.get('/api/v1/projects', () => HttpResponse.json(projects)),
    http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
      HttpResponse.json(entitlement(slots)),
    ),
  );
}

/** A response the test releases when it chooses. */
function deferred() {
  let answer!: (response: HttpResponse<DefaultBodyType>) => void;
  const response = new Promise<HttpResponse<DefaultBodyType>>((resolve) => {
    answer = resolve;
  });
  return { response, answer };
}

/** What the loader did: a redirect's destination, or null for "let it render". */
async function run(pathname: string): Promise<string | null> {
  const request = new Request(`https://citeladder.local${pathname}`);
  try {
    await bootstrapPrivateRoutes({ request });
    return null;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.headers.get('Location');
    throw thrown;
  }
}

beforeAll(async () => {
  mswServer.listen({ onUnhandledFrame: 'bypass' });
  // Route prefetches import these lazily; a first import still resolving after
  // its test ended would send that test's reads into the next one's log.
  await Promise.all([import('@/lib/api/projects'), import('@/lib/overview/widget-queries')]);
});
afterAll(() => mswServer.close());
let client: ReturnType<typeof createAppQueryClient>;
beforeEach(() => {
  client = createAppQueryClient();
  setAppQueryClient(client);
  window.localStorage.clear();
  mswServer.use(
    http.get(`/api/v1/workspaces/${WORKSPACE}/access`, () =>
      HttpResponse.json({ status: 'active', expires_at: null }),
    ),
  );
});
afterEach(async () => {
  // A read still retrying must not reach the next test's request log.
  await client.cancelQueries();
  client.clear();
  mswServer.resetHandlers();
  setAppQueryClient(undefined);
});

/**
 * The shell's opening decision, made before anything mounts.
 *
 * What these guard is the DIRECTION of each answer, and — just as much — the
 * states that must NOT produce one. A read that failed, an allowance nobody
 * confirmed, a project that is merely missing: each has a notice and a retry
 * of its own in `OnboardingGate`, and a loader that redirected or threw on any
 * of them would replace that with a bare route error.
 */
describe('bootstrapPrivateRoutes', () => {
  it.each(['/projects', '/onboarding'])(
    'settles access alongside workspace reads before mounting %s',
    async (pathname) => {
      stub({ projects: [] });
      const client = createAppQueryClient();
      setAppQueryClient(client);
      let answer!: (response: HttpResponse<DefaultBodyType>) => void;
      const response = new Promise<HttpResponse<DefaultBodyType>>((resolve) => {
        answer = resolve;
      });
      mswServer.use(http.get(`/api/v1/workspaces/${WORKSPACE}/access`, () => response));
      let settled = false;
      const pending = run(pathname).then(() => {
        settled = true;
      });
      await waitFor(() =>
        expect(client.getQueryData(queryKeys.billing.workspaceEntitlement(WORKSPACE))).toEqual(
          entitlement(1),
        ),
      );
      expect(settled).toBe(false);
      answer(HttpResponse.json({ status: 'active', expires_at: null }));
      await pending;
      expect(client.getQueryData(queryKeys.workspaces.access(WORKSPACE))).toEqual({
        status: 'active',
        expires_at: null,
      });
    },
  );

  it('leaves a failed access read to the gate rather than failing the route', async () => {
    stub({ projects: [PROJECT_SUMMARY] });
    mswServer.use(
      http.get(`/api/v1/workspaces/${WORKSPACE}/access`, () =>
        HttpResponse.json({ error: { message: 'Access unavailable' } }, { status: 403 }),
      ),
    );
    expect(await run('/settings')).toBeNull();
  });

  it.each(['/invitations/accept'])(
    'does not wait for access on the recovery route %s',
    async (pathname) => {
      stub({ projects: [] });
      let requests = 0;
      mswServer.use(
        http.get(`/api/v1/workspaces/${WORKSPACE}/access`, () => {
          requests += 1;
          return HttpResponse.json({ error: { message: 'Access unavailable' } }, { status: 403 });
        }),
      );
      expect(await run(pathname)).toBeNull();
      expect(requests).toBe(0);
    },
  );

  it('sends an empty workspace to project setup, carrying the workspace', async () => {
    stub({ projects: [] });
    expect(await run('/projects')).toBe(`/onboarding?workspace=${WORKSPACE}`);
  });

  it('starts the session and membership reads together rather than in series', async () => {
    // A degraded network multiplies every serialized round trip, and both
    // reads need only the session cookie, so the membership list must not
    // queue behind `me`. Prove both are in flight before either has answered.
    const entered: string[] = [];
    let answerMe!: (response: HttpResponse<DefaultBodyType>) => void;
    let answerWorkspaces!: (response: HttpResponse<DefaultBodyType>) => void;
    const me = new Promise<HttpResponse<DefaultBodyType>>((resolve) => {
      answerMe = resolve;
    });
    const memberships = new Promise<HttpResponse<DefaultBodyType>>((resolve) => {
      answerWorkspaces = resolve;
    });
    mswServer.use(
      http.get('/api/v1/auth/me', () => {
        entered.push('me');
        return me;
      }),
      http.get('/api/v1/workspaces', () => {
        entered.push('workspaces');
        return memberships;
      }),
      http.get('/api/v1/projects', () => HttpResponse.json([])),
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json(entitlement(1)),
      ),
    );

    const pending = run('/projects');
    await waitFor(() => expect(entered).toContain('workspaces'));
    // `me` is still unanswered (its deferred is pending by construction), so
    // the membership read can only have started alongside it.
    expect(entered).toContain('me');

    answerMe(HttpResponse.json({ user: USER }));
    answerWorkspaces(HttpResponse.json([WORKSPACE_ROW]));
    expect(await pending).toBe(`/onboarding?workspace=${WORKSPACE}`);
  });

  it('puts the resolved project in the address instead of rewriting it a frame later', async () => {
    stub({ projects: [PROJECT_SUMMARY] });
    expect(await run('/projects')).toBe(`/projects?project=${PROJECT}`);
  });

  it('leaves an address that already names its project alone', async () => {
    stub({ projects: [PROJECT_SUMMARY] });
    mswServer.use(http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)));
    expect(await run(`/projects?project=${PROJECT}`)).toBeNull();
  });

  it('sends an unauthenticated visitor to sign in', async () => {
    mswServer.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ error: { message: 'no' } }, { status: 401 }),
      ),
    );
    expect(await run('/projects')).toBe('/login');
  });

  it('does not route a workspace-only destination on the projects it lacks', async () => {
    // Settings and onboarding manage the WORKSPACE. An empty one is a normal
    // place to be on those routes, not a reason to redirect.
    stub({ projects: [] });
    expect(await run('/settings')).toBeNull();
    expect(await run('/onboarding')).toBeNull();
  });

  it('renders rather than redirects when a read fails', async () => {
    // The gate owns "your workspace could not be loaded" and its retry. A
    // loader that threw here would show a route error instead and lose which
    // read actually failed.
    mswServer.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: USER })),
      http.get('/api/v1/workspaces', () =>
        HttpResponse.json({ error: { message: 'nope' } }, { status: 500 }),
      ),
    );
    expect(await run('/projects')).toBeNull();
  });

  it('does not offer creation on an allowance nobody confirmed', async () => {
    // An unread allowance is not evidence of a spare slot. Routing into setup
    // on it is how a transient failure becomes a rejected creation attempt.
    mswServer.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: USER })),
      http.get('/api/v1/workspaces', () => HttpResponse.json([WORKSPACE_ROW])),
      http.get('/api/v1/projects', () => HttpResponse.json([])),
      http.get(`/api/v1/workspaces/${WORKSPACE}/entitlements`, () =>
        HttpResponse.json({ error: { message: 'nope' } }, { status: 503 }),
      ),
    );
    expect(await run('/projects')).toBeNull();
  });

  it('does not offer creation when the workspace has no slots left', async () => {
    stub({ projects: [], slots: 0 });
    expect(await run('/projects')).toBeNull();
  });

  describe('the workspace chooser sign-in lands on', () => {
    function memberOf(workspaces: JsonBodyType, status = 200) {
      mswServer.use(
        http.get('/api/v1/auth/me', () => HttpResponse.json({ user: USER })),
        http.get('/api/v1/workspaces', () => HttpResponse.json(workspaces, { status })),
      );
    }

    it('leaves a failed membership read to the chooser, which owns that notice', async () => {
      memberOf({ error: { message: 'nope' } }, 403);
      expect(await run('/workspaces')).toBeNull();
    });

    it('goes straight into the only workspace a person owns, before it paints', async () => {
      memberOf([WORKSPACE_ROW]);
      expect(await run('/workspaces')).toBe(`/projects?workspace=${WORKSPACE}`);
    });

    it('sends someone who belongs to no workspace to set up their own', async () => {
      memberOf([]);
      expect(await run('/workspaces')).toBe('/onboarding?setup=workspace');
    });

    it('lets someone with a workspace to choose, or none of their own, choose', async () => {
      const invited = {
        ...WORKSPACE_ROW,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Invited',
        role: 'member',
      };
      memberOf([WORKSPACE_ROW, invited]);
      expect(await run('/workspaces')).toBeNull();
      setAppQueryClient(createAppQueryClient());
      memberOf([invited]);
      expect(await run('/workspaces')).toBeNull();
    });

    it('lands the redirected address on its project in the same document', async () => {
      stub({ projects: [PROJECT_SUMMARY] });
      expect(await run('/workspaces')).toBe(`/projects?workspace=${WORKSPACE}`);
      expect(await run(`/projects?workspace=${WORKSPACE}`)).toBe(`/projects?project=${PROJECT}`);
    });
  });

  describe('a reload of a project address', () => {
    /** Every request path (with its query) the loader sends while `work` runs. */
    function recordRequests() {
      const paths: string[] = [];
      const listener = ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        paths.push(url.pathname + url.search);
      };
      mswServer.events.on('request:start', listener);
      return { paths, stop: () => mswServer.events.removeListener('request:start', listener) };
    }
    const projectReads = (paths: string[]) =>
      paths.filter((path) => path === '/api/v1/projects' || path === `/api/v1/projects/${PROJECT}`);

    it.each([
      ['lists it', [PROJECT_SUMMARY]],
      ['does not list it yet', []],
    ])(
      'reads the project’s view once beside the list when the remembered workspace %s',
      async (_case, listed) => {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE);
        stub({ projects: listed });
        mswServer.use(
          http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)),
        );
        const requests = recordRequests();

        expect(await run(`/settings?project=${PROJECT}`)).toBeNull();
        requests.stop();

        expect(projectReads(requests.paths).sort()).toEqual([
          '/api/v1/projects',
          `/api/v1/projects/${PROJECT}`,
        ]);
      },
    );

    it.each([
      [
        `/ai-traffic?project=${PROJECT}`,
        [
          `/api/v1/projects/${PROJECT}/ai-traffic/insights?range=30d`,
          `/api/v1/projects/${PROJECT}/ai-traffic/overview?range=30d`,
          `/api/v1/projects/${PROJECT}/crawl-logs/sources`,
        ],
      ],
      // A tab in the address warms that tab's reads, not the landing tab's.
      [
        `/ai-traffic?project=${PROJECT}&tab=pages`,
        [`/api/v1/projects/${PROJECT}/crawl-logs/sources`],
      ],
      [
        `/search-intelligence?project=${PROJECT}&tab=keywords`,
        [`/api/v1/projects/${PROJECT}/search-intelligence`],
      ],
    ])('starts %s’s reads while the access gate is still answering', async (address, reads) => {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE);
      stub({ projects: [PROJECT_SUMMARY] });
      let answer!: (response: HttpResponse<DefaultBodyType>) => void;
      const access = new Promise<HttpResponse<DefaultBodyType>>((resolve) => {
        answer = resolve;
      });
      mswServer.use(
        http.get(`/api/v1/workspaces/${WORKSPACE}/access`, () => access),
        http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)),
        // What the screen reads answer is not this test's concern.
        http.get(`/api/v1/projects/${PROJECT}/*`, () =>
          HttpResponse.json({ error: { message: 'not here' } }, { status: 404 }),
        ),
      );
      const requests = recordRequests();
      let settled = false;

      const pending = run(address).then((location) => {
        settled = true;
        return location;
      });
      // The shell's Actions badge read rides along on every screen; this test
      // is about the screen's own reads.
      const screenReads = () =>
        requests.paths
          .filter((path) => path.startsWith(`/api/v1/projects/${PROJECT}/`))
          .filter((path) => !path.startsWith(`/api/v1/projects/${PROJECT}/actions`))
          .sort();
      await waitFor(() => expect(screenReads()).toEqual(reads));
      expect(settled).toBe(false);

      answer(HttpResponse.json({ status: 'active', expires_at: null }));
      expect(await pending).toBeNull();
      requests.stop();
    });

    it('asks for the gates, the shell’s reads and the screen’s in the same round as the session', async () => {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE);
      stub({ projects: [PROJECT_SUMMARY] });
      const me = deferred();
      const memberships = deferred();
      mswServer.use(
        http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)),
        http.get('/api/v1/auth/me', () => me.response),
        http.get('/api/v1/workspaces', () => memberships.response),
        http.get(`/api/v1/projects/${PROJECT}/*`, () =>
          HttpResponse.json({ error: { message: 'not here' } }, { status: 404 }),
        ),
      );
      const requests = recordRequests();
      const started = () => requests.paths.map((path) => path.replace(/\?.*$/u, ''));

      const pending = run(`/site?project=${PROJECT}`);
      const firstRound = [
        '/api/v1/projects',
        `/api/v1/projects/${PROJECT}`,
        `/api/v1/workspaces/${WORKSPACE}/access`,
        `/api/v1/workspaces/${WORKSPACE}/entitlements`,
        `/api/v1/workspaces/${WORKSPACE}/policies`,
        `/api/v1/projects/${PROJECT}/actions`,
        `/api/v1/projects/${PROJECT}/site-health`,
      ];
      // `me` and the membership list are unanswered by construction.
      await waitFor(() =>
        expect(firstRound.filter((path) => started().includes(path))).toEqual(firstRound),
      );
      // Site Health reads the workspace entitlement; its own copy is gone.
      expect(started().filter((path) => path.endsWith('/entitlements'))).toEqual([
        `/api/v1/workspaces/${WORKSPACE}/entitlements`,
      ]);
      expect(started()).not.toContain('/api/v1/billing/usage');

      me.answer(HttpResponse.json({ user: USER }));
      memberships.answer(HttpResponse.json([WORKSPACE_ROW]));
      expect(await pending).toBeNull();
      // An Owner's usage waits only for the membership list to name the role.
      await waitFor(() => expect(started()).toContain('/api/v1/billing/usage'));
      requests.stop();
    });

    it('after sign-in, reads the selected project’s view and its screen before redirecting to it', async () => {
      // Sign-in clears the remembered project, so nothing can be guessed.
      stub({ projects: [PROJECT_SUMMARY] });
      mswServer.use(
        http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)),
        http.get(`/api/v1/projects/${PROJECT}/*`, () =>
          HttpResponse.json({ error: { message: 'not here' } }, { status: 404 }),
        ),
      );
      const requests = recordRequests();
      const started = () => requests.paths.map((path) => path.replace(/\?.*$/u, ''));

      expect(await run('/projects')).toBe(`/projects?project=${PROJECT}`);
      // Only the first pass ran: the redirected load would join these, not start them.
      await waitFor(() =>
        expect(
          [`/api/v1/projects/${PROJECT}`, `/api/v1/projects/${PROJECT}/command-center`].filter(
            (path) => started().includes(path),
          ),
        ).toEqual([`/api/v1/projects/${PROJECT}`, `/api/v1/projects/${PROJECT}/command-center`]),
      );
      requests.stop();
    });

    it('withdraws a remembered workspace’s guess and reads the project in its own', async () => {
      const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, OTHER);
      const empty = {
        project_id: PROJECT,
        crawl: null,
        score_summary: null,
        phase: 'empty',
        snapshot_id: null,
        quota: { used: 0, limit: 50 },
        root_errors: [],
      };
      stub({ projects: [] });
      mswServer.use(
        http.get('/api/v1/workspaces', () =>
          HttpResponse.json([WORKSPACE_ROW, { ...WORKSPACE_ROW, id: OTHER, name: 'Other' }]),
        ),
        http.get('/api/v1/projects', ({ request }) =>
          HttpResponse.json(
            request.headers.get('x-workspace-id') === WORKSPACE ? [PROJECT_SUMMARY] : [],
          ),
        ),
        http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)),
        // Asked under the wrong workspace, the dashboard is still answering
        // `Project not found` when the project names its own.
        http.get(`/api/v1/projects/${PROJECT}/site-health`, async ({ request }) => {
          if (request.headers.get('x-workspace-id') === WORKSPACE) return HttpResponse.json(empty);
          await delay(200);
          return HttpResponse.json({ error: { message: 'Project not found' } }, { status: 404 });
        }),
        http.get(`/api/v1/projects/${PROJECT}/*`, () =>
          HttpResponse.json({ error: { message: 'not here' } }, { status: 404 }),
        ),
      );
      const client = createAppQueryClient();
      setAppQueryClient(client);

      expect(await run(`/site?project=${PROJECT}`)).toBeNull();

      await waitFor(() =>
        expect(
          client.getQueryData(
            queryKeys.siteHealth.dashboard({ workspaceId: WORKSPACE, projectId: PROJECT }),
          ),
        ).toEqual(empty),
      );
    });
  });

  it('keeps a stored workspace that the membership list still contains', async () => {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, WORKSPACE);
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, PROJECT);
    stub({ projects: [PROJECT_SUMMARY] });
    mswServer.use(http.get(`/api/v1/projects/${PROJECT}`, () => HttpResponse.json(PROJECT_ROW)));
    expect(await run('/projects')).toBe(`/projects?project=${PROJECT}`);
  });
});
