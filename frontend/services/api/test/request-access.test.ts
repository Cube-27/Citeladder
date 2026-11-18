/**
 * The per-request access path: one read proves the session and its membership,
 * one batch reads the workspace's entitlement state, and every helper in the
 * same request reuses it. Nothing is kept between requests.
 */
import { randomUUID } from 'node:crypto';

import type { KyselyPlugin, RootOperationNode } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { PRODUCT_ROUTES } from '../src/routes/index.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new Fixtures(db);

/** Every statement the request executed, in order; subqueries are part of their statement. */
const executed: string[] = [];
const pending = new Map<string, RootOperationNode>();
const recorder: KyselyPlugin = {
  transformQuery({ node, queryId }) {
    pending.set(queryId.queryId, node);
    return node;
  },
  transformResult({ queryId, result }) {
    const node = pending.get(queryId.queryId);
    if (node) executed.push(db.getExecutor().compileQuery(node, queryId).sql);
    return Promise.resolve(result);
  },
};
const app = createApp(config, db.withPlugin(recorder));

const AUTH_TABLES = [
  'users',
  'workspace_members',
  'projects',
  'billing_accounts',
  'account_grants',
  'grant_revocations',
  'billing_subscriptions',
];

/** Statements per authorization table, by the table each statement reads from first. */
function authReads(statements: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const statement of statements) {
    const table = /\bfrom "(\w+)"/u.exec(statement)?.[1];
    if (table && AUTH_TABLES.includes(table)) counts[table] = (counts[table] ?? 0) + 1;
  }
  return counts;
}

let userId: string;
let workspaceId: string;
let projectId: string;
let chatId: string;
let cookie: string;

async function call(
  path: string,
  headers: Record<string, string> = { 'x-workspace-id': workspaceId },
  method = 'GET',
) {
  executed.length = 0;
  pending.clear();
  const write = method === 'GET' ? {} : { body: '{}' };
  const response = await app.request(path, {
    method,
    headers: {
      cookie,
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...write,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** Statements whose first table is `table`. */
function readsOf(statements: readonly string[], table: string): number {
  return statements.filter((statement) => /\bfrom "(\w+)"/u.exec(statement)?.[1] === table).length;
}

async function insertProject(workspace: string): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('projects')
    .values({
      id,
      workspace_id: workspace,
      name: 'Access path',
      brand_name: 'Access path',
      website_url: 'https://example.test',
      industry: 'software',
      subindustry: 'analytics',
      primary_market: 'US',
      country_code: 'US',
      language_code: 'en',
      benchmark_mode: 'consumer_like',
      default_repetitions: 1,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  return id;
}

async function insertChat(workspace: string, project: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db
    .insertInto('agent_chats')
    .values({
      id,
      workspace_id: workspace,
      project_id: project,
      title: 'Access path',
      context_refs: {},
      turn_count: 0,
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

beforeAll(async () => {
  userId = await fixtures.user();
  workspaceId = await fixtures.ownedWorkspace(userId);
  projectId = await insertProject(workspaceId);
  chatId = await insertChat(workspaceId, projectId);
  cookie = `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`;
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

const ONE_ENTITLEMENT_READ = {
  billing_accounts: 1,
  account_grants: 1,
  grant_revocations: 1,
  billing_subscriptions: 1,
};

describe('per-request access', () => {
  it('authorizes a project read with one session read and one entitlement read', async () => {
    const { status } = await call(`/api/v1/projects/${projectId}/readiness`);
    expect(status).toBe(200);
    expect(authReads(executed)).toEqual({ users: 1, ...ONE_ENTITLEMENT_READ });
  });

  it.each([
    ['the project list', '/api/v1/projects'],
    ['crawl log sources', '/api/v1/projects/{project}/crawl-logs/sources'],
    ['API keys', '/api/v1/api-keys'],
  ])('reads entitlements once for %s, whose handler asks again', async (_label, template) => {
    const { status } = await call(template.replace('{project}', projectId));
    expect(status).toBe(200);
    expect(authReads(executed)).toMatchObject({ users: 1, ...ONE_ENTITLEMENT_READ });
  });

  it('opens an Agent chat and its revisions reading the chat once, with no further access reads', async () => {
    const answers = [];
    for (const path of [
      `/api/v1/agent/chats/${chatId}`,
      `/api/v1/agent/chats/${chatId}/outputs/${randomUUID()}/revisions`,
    ]) {
      const { status } = await call(path);
      answers.push([status, authReads(executed), readsOf(executed, 'agent_chats')]);
    }
    expect(answers).toEqual([
      [200, { users: 1, ...ONE_ENTITLEMENT_READ }, 1],
      [200, { users: 1, ...ONE_ENTITLEMENT_READ }, 1],
    ]);
  });

  it.each([
    ['the Agent chat list', '/api/v1/projects/{project}/agent/chats'],
    ['the Agent instructions', '/api/v1/projects/{project}/agent/instructions'],
    ['the Overview layout', '/api/v1/projects/{project}/overview/layout'],
    ['the opportunity catalog', '/api/v1/projects/{project}/opportunities'],
    ['the topic list', '/api/v1/projects/{project}/topics'],
  ])('opens %s on the session and entitlement reads alone', async (_label, template) => {
    const { status } = await call(template.replace('{project}', projectId));
    expect(status).toBe(200);
    expect(authReads(executed)).toEqual({ users: 1, ...ONE_ENTITLEMENT_READ });
  });

  it('answers /auth/me from the session read without reading the password hash', async () => {
    const { status, body } = await call('/api/v1/auth/me');
    expect(status).toBe(200);
    expect(body.user).toMatchObject({ id: userId, email: `${userId}@example.test` });
    expect(executed).toHaveLength(1);
    expect(executed.join('\n')).not.toContain('password_hash');
  });

  it('applies a revoked grant and a removed membership from the next request', async () => {
    const path = `/api/v1/projects/${projectId}/readiness`;
    expect((await call(path)).status).toBe(200);
    const grant = await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .select('account_grants.id')
      .where('billing_accounts.workspace_id', '=', workspaceId)
      .where('account_grants.key', '=', 'workspace_access')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('grant_revocations')
      .values({
        id: randomUUID(),
        grant_id: grant.id,
        effective_from: new Date(Date.now() - 1000),
        reason: 'test',
        actor_kind: 'operator',
        actor_user_id: null,
        idempotency_key: randomUUID(),
        created_at: new Date(),
      })
      .execute();
    const revoked = await call(path);
    expect([revoked.status, revoked.body.error]).toEqual([
      403,
      expect.objectContaining({ code: 'access_unresolved' }),
    ]);
    await db
      .deleteFrom('workspace_members')
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .execute();
    const removed = await call(path);
    expect([removed.status, removed.body.error]).toEqual([
      404,
      expect.objectContaining({ message: 'Workspace not found' }),
    ]);
  });
});

describe('routes that authorize the path project or chat', () => {
  /** Every browser route below a project path, from the route registry. */
  const PROJECT_ROUTES = PRODUCT_ROUTES.flatMap(({ contract }) =>
    contract.path.startsWith('/api/v1/projects/{project_id}')
      ? [[contract.method.toUpperCase(), contract.path] as const]
      : [],
  );
  /** The template with the project filled in and every other ID made up. */
  const concrete = (template: string, project: string) =>
    template.replace('{project_id}', project).replaceAll(/\{[a-z_]+\}/gu, () => randomUUID());
  /** Writes that need more than a viewer's `read` capability. */
  const VIEWER_REFUSED_WRITES: [string, string][] = [
    ['POST', '/api/v1/projects/{project}/agent/chats'],
    ['PUT', '/api/v1/projects/{project}/agent/instructions'],
    ['PUT', '/api/v1/projects/{project}/overview/layout'],
    ['PUT', '/api/v1/projects/{project}/opportunities/order'],
    ['POST', '/api/v1/projects/{project}/topics'],
    ['POST', '/api/v1/projects/{project}/topics/preview'],
    ['POST', '/api/v1/projects/{project}/topics/confirm'],
    ['POST', '/api/v1/projects/{project}/prompts/bulk-topic'],
    ['POST', '/api/v1/projects/{project}/prompts/bulk-delete'],
  ];
  const CHAT_READS = [
    '/api/v1/agent/chats/{chat}',
    `/api/v1/agent/chats/{chat}/outputs/${randomUUID()}/revisions`,
  ];
  // Its own tenant: the per-request suite revokes the shared one's access.
  let workspaceId: string;
  let projectId: string;
  let chatId: string;
  let owner: string;

  beforeAll(async () => {
    const userId = await fixtures.user();
    workspaceId = await fixtures.ownedWorkspace(userId);
    projectId = await insertProject(workspaceId);
    chatId = await insertChat(workspaceId, projectId);
    owner = `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`;
  });

  async function stranger() {
    const member = await fixtures.user();
    await fixtures.ownedWorkspace(member);
    return `${config.session.cookieName}=${await sessionToken({ sub: member, ver: 0 })}`;
  }

  it('hides another workspace project, and a missing one, on every registered project route', async () => {
    const session = await stranger();
    const missing = randomUUID();
    const answers = [];
    for (const [method, template] of PROJECT_ROUTES) {
      const foreign = await call(concrete(template, projectId), { cookie: session }, method);
      const absent = await call(concrete(template, missing), { cookie: owner }, method);
      answers.push([method, template, foreign.status, foreign.body.error, absent.status]);
    }
    const notFound = expect.objectContaining({ message: 'Project not found' });
    // The registry, not a hand list: a route added below a project path is covered.
    expect(PROJECT_ROUTES).toContainEqual(['GET', '/api/v1/projects/{project_id}/topics']);
    expect(answers).toEqual(
      PROJECT_ROUTES.map(([method, template]) => [method, template, 404, notFound, 404]),
    );
  });

  it('hides another workspace chat', async () => {
    const session = await stranger();
    const answers = [];
    for (const template of CHAT_READS) {
      const foreign = await call(template.replace('{chat}', chatId), { cookie: session });
      answers.push([template, foreign.status, foreign.body.error]);
    }
    expect(answers).toEqual(
      CHAT_READS.map((template) => [
        template,
        404,
        expect.objectContaining({ message: 'Chat not found' }),
      ]),
    );
  });

  it('lets a viewer read the project but refuses its writes before reading the body', async () => {
    const viewer = await fixtures.user();
    await fixtures.member(workspaceId, viewer, 'viewer');
    const session = `${config.session.cookieName}=${await sessionToken({ sub: viewer, ver: 0 })}`;
    const headers = { cookie: session, 'x-workspace-id': workspaceId };
    const reads = [];
    for (const template of ['/api/v1/projects/{project}/opportunities', ...CHAT_READS])
      reads.push(
        (await call(template.replace('{project}', projectId).replace('{chat}', chatId), headers))
          .status,
      );
    const writes = [];
    for (const [method, template] of VIEWER_REFUSED_WRITES)
      writes.push((await call(template.replace('{project}', projectId), headers, method)).status);
    expect([reads, writes]).toEqual([[200, 200, 200], VIEWER_REFUSED_WRITES.map(() => 403)]);
  });
});

describe('active workspace selection', () => {
  it('refuses an empty X-Workspace-Id instead of falling back to the default workspace', async () => {
    const member = await fixtures.user();
    const workspace = await fixtures.ownedWorkspace(member);
    const project = await insertProject(workspace);
    const session = `${config.session.cookieName}=${await sessionToken({ sub: member, ver: 0 })}`;
    const answers = [];
    for (const path of ['/api/v1/api-keys', `/api/v1/projects/${project}/readiness`]) {
      const empty = await call(path, { cookie: session, 'x-workspace-id': '' });
      const absent = await call(path, { cookie: session });
      answers.push([path, empty.status, empty.body.error, absent.status]);
    }
    expect(answers).toEqual(
      ['/api/v1/api-keys', `/api/v1/projects/${project}/readiness`].map((path) => [
        path,
        400,
        expect.objectContaining({ message: 'Invalid X-Workspace-Id' }),
        200,
      ]),
    );
  });

  it('breaks a tie between equally old memberships by membership ID', async () => {
    /** Whether the default workspace reads the lower-ID membership's project and refuses the other's. */
    async function defaultIsLowerId(ownedIdPrefix: '0' | 'f') {
      const member = await fixtures.user();
      const owned = await fixtures.ownedWorkspace(member);
      // A person owns one workspace; the other membership is an invitation.
      const invited = await fixtures.ownedWorkspace(await fixtures.user());
      await fixtures.member(invited, member, 'admin');
      const at = new Date('2026-01-01T00:00:00Z');
      for (const [workspace, prefix] of [
        [owned, ownedIdPrefix],
        [invited, ownedIdPrefix === '0' ? 'f' : '0'],
      ] as const)
        await db
          .updateTable('workspace_members')
          .set({ id: prefix + randomUUID().slice(1), created_at: at })
          .where('workspace_id', '=', workspace)
          .where('user_id', '=', member)
          .execute();
      const lower = await insertProject(ownedIdPrefix === '0' ? owned : invited);
      const higher = await insertProject(ownedIdPrefix === '0' ? invited : owned);
      const session = `${config.session.cookieName}=${await sessionToken({ sub: member, ver: 0 })}`;
      return [
        (await call(`/api/v1/projects/${lower}/readiness`, { cookie: session })).status,
        (await call(`/api/v1/projects/${higher}/readiness`, { cookie: session })).status,
      ];
    }
    // Both orders, so neither insertion order nor workspace IDs can decide it.
    expect([await defaultIsLowerId('0'), await defaultIsLowerId('f')]).toEqual([
      [200, 404],
      [200, 404],
    ]);
  });
});
