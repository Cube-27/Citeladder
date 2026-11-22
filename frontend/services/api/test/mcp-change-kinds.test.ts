import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { changeKinds } from '../src/changes/kinds.ts';
import { policy } from '../src/config.ts';
import { MCP_CHANGE_KINDS, type McpChangeKind } from '../src/mcp/change-kinds.ts';
import { auditTenant } from './audit-fixtures.ts';
import { kindCases, type KindRow, type KindScope } from './change-kind-cases.ts';
import { mcpWrites } from './mcp-write-support.ts';
import { actionRow } from './opportunity-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { SiteFixtures } from './site-health-fixtures.ts';
import { testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new SiteFixtures(db);
const { connection, call, failure, setRole, cleanup } = mcpWrites(db, config);

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanup();
  await fixtures.cleanup();
  await db.destroy();
});

const tenant = () => auditTenant(db, fixtures);
const enable = async (workspaceId: string, key: 'fact_checking' | 'commerce') =>
  grant(db, await billingAccount(db, workspaceId), { key, value: 1, sourceKind: 'override' });
const countWhere = (table: 'prompts' | 'brand_facts' | 'commerce_products', projectId: string) =>
  db
    .selectFrom(table)
    .select(sql<string>`count(*)`.as('count'))
    .where(table === 'prompts' ? 'prompt_set_id' : 'project_id', '=', projectId)
    .executeTakeFirstOrThrow()
    .then((row) => Number(row.count));

const MCP_ONLY: Record<
  'import_prompts' | 'import_brand_facts' | 'import_catalog' | 'declare_implemented',
  KindRow
> = {
  import_prompts: {
    foreign: 404,
    async arrange() {
      const t = await tenant();
      return {
        scope: t,
        payload: {
          prompt_set_id: t.setId,
          prompts: [{ text: 'Which trail running shoes grip best in mud?' }],
        },
        observe: () => countWhere('prompts', t.setId),
        before: 1,
        after: 2,
      };
    },
  },
  import_brand_facts: {
    foreign: 'none',
    async arrange() {
      const t = await tenant();
      await enable(t.workspaceId, 'fact_checking');
      return {
        scope: t,
        payload: {
          rows: [
            {
              topic: 'Integrations',
              statement: 'Acme Running integrates with Slack.',
              source_url: null,
            },
          ],
        },
        observe: () => countWhere('brand_facts', t.projectId),
        before: 0,
        after: 1,
      };
    },
  },
  import_catalog: {
    foreign: 'none',
    async arrange() {
      const t = await tenant();
      await enable(t.workspaceId, 'commerce');
      return {
        scope: t,
        payload: {
          source: 'csv',
          filename: 'products.csv',
          content: [
            'title,brand,price,currency,link,category',
            'Trail Runner,Acme,120.00,USD,https://shop.example/trail-runner,Footwear',
          ].join('\n'),
        },
        observe: () => countWhere('commerce_products', t.projectId),
        before: 0,
        after: 1,
      };
    },
  },
  declare_implemented: {
    foreign: 404,
    async arrange() {
      const t = await tenant();
      const row = actionRow(
        { workspace_id: t.workspaceId, project_id: t.projectId },
        { group_key: randomUUID(), target_kind: 'page', target_label: 'https://example.test/a' },
      );
      await db.insertInto('actions').values(row).execute();
      return {
        scope: t,
        payload: {
          action_id: row.id,
          declaration: { declared_implemented_at: new Date().toISOString() },
        },
        observe: () =>
          db
            .selectFrom('opportunity_implementation_events')
            .select('id')
            .where('action_id', '=', row.id)
            .execute()
            .then((found) => found.length),
        before: 0,
        after: 1,
      };
    },
  },
};

const cases: Record<McpChangeKind, KindRow> = { ...kindCases(db, fixtures), ...MCP_ONLY };

async function reservations(scope: KindScope) {
  const row = await db
    .selectFrom('consumable_ledger')
    .select(sql<string>`count(*)`.as('count'))
    .where('workspace_id', '=', scope.workspaceId)
    .where('entry_kind', '=', 'reservation')
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

const changeEvents = (scope: KindScope) =>
  db
    .selectFrom('security_events')
    .select(['event', 'target_id'])
    .where('actor_id', '=', scope.userId)
    .where('event', 'like', 'mcp.write.%')
    .execute();

it.each(MCP_CHANGE_KINDS)(
  '%s is refused to a read-only grant, a viewer and another workspace’s record, and changes nothing until confirmed',
  async (kind) => {
    const row = cases[kind];
    const arranged = await row.arrange();
    const { scope } = arranged;
    const prepare = (
      principal: Awaited<ReturnType<typeof connection>>,
      payload = arranged.payload,
    ) => call(principal, 'prepare_change', { project_id: scope.projectId, kind, payload });
    const principal = await connection(scope);

    expect(await failure(prepare(await connection(scope, ['citeladder:read'])))).toBe(
      'Unknown tool: prepare_change',
    );
    await setRole(scope, 'viewer');
    expect(await failure(prepare(principal))).toBe(
      policy.workspaces.denial_messages[changeKinds[kind].permission.capability],
    );
    await setRole(scope, 'owner');
    if (row.foreign !== 'none') {
      const other = await row.arrange();
      expect(await failure(prepare(principal, other.payload))).not.toBe('succeeded');
      expect(await other.observe()).toEqual(other.before);
    }

    const held = await reservations(scope);
    const prepared = await prepare(principal);
    expect(prepared).toMatchObject({ state: 'needs_confirmation', kind });
    expect(JSON.stringify(prepared.preview)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
    expect(await arranged.observe()).toEqual(arranged.before);
    expect(await reservations(scope)).toBe(held);
    expect(await changeEvents(scope)).toEqual([]);
    if (row.live) return;

    const confirmed = await call(principal, 'confirm_change', {
      confirmation_token: String(prepared.confirmation_token),
    });
    expect(confirmed).toMatchObject({ state: 'changed', change: kind });
    expect(await arranged.observe()).toEqual(arranged.after);
    expect(await changeEvents(scope)).toEqual([
      { event: `mcp.write.${kind}`, target_id: scope.projectId },
    ]);
  },
);
