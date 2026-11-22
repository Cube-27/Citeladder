import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { ApiError } from '../src/errors.ts';
import { mcpPolicy } from '../src/mcp/config.ts';
import { admitWriteCall } from '../src/mcp/registration.ts';
import type { McpPrincipal } from '../src/mcp/types.ts';
import { auditTenant } from './audit-fixtures.ts';
import { mcpWrites } from './mcp-write-support.ts';
import { topic } from './prompt-fixtures.ts';
import { testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new VisibilityFixtures(db);
const { connection, call, failure, setRole, cleanup } = mcpWrites(db, config);

afterEach(async () => {
  await fixtures.cleanup();
});
afterAll(async () => {
  await cleanup();
  await db.destroy();
});

async function promptTexts(setId: string) {
  return (
    await db
      .selectFrom('prompts')
      .select(['text', 'status'])
      .where('prompt_set_id', '=', setId)
      .orderBy('created_at')
      .execute()
  ).map((row) => `${row.text} [${row.status}]`);
}

type Tenant = Awaited<ReturnType<typeof auditTenant>>;
const prepare = (principal: McpPrincipal, tenant: Tenant, kind: string, payload?: unknown) =>
  call(principal, 'prepare_change', { project_id: tenant.projectId, kind, payload });
const addPrompt = (principal: McpPrincipal, tenant: Tenant) =>
  prepare(principal, tenant, 'add_prompts', {
    prompt_set_id: tenant.setId,
    prompts: [{ text: 'Which running shoes last longest?' }],
  });
const confirm = (principal: McpPrincipal, prepared: Record<string, unknown>) =>
  call(principal, 'confirm_change', { confirmation_token: String(prepared.confirmation_token) });

it('previews a prompt add without writing, then adds it once on confirmation', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  const prepared = await addPrompt(principal, tenant);
  expect(prepared).toMatchObject({
    state: 'needs_confirmation',
    kind: 'add_prompts',
    preview: {
      title: 'Add 1 prompt',
      rows: expect.arrayContaining([
        { label: 'Prompt', value: 'Which running shoes last longest?' },
      ]),
    },
  });
  expect(await promptTexts(tenant.setId)).toEqual(['Which running shoes suit road use? [active]']);

  expect(await confirm(principal, prepared)).toMatchObject({
    state: 'changed',
    change: 'add_prompts',
  });
  expect(await promptTexts(tenant.setId)).toEqual([
    'Which running shoes suit road use? [active]',
    'Which running shoes last longest? [active]',
  ]);
  expect(await failure(confirm(principal, prepared))).toBe('This change was already confirmed.');
});

it('returns a kind’s payload shape on demand and refuses a kind MCP does not offer', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  expect(await prepare(principal, tenant, 'rename_topic')).toEqual({
    state: 'payload_shape',
    kind: 'rename_topic',
    payload: '{topic_id: uuid, name: string}',
  });
  expect(
    await failure(prepare(principal, tenant, 'delete_prompts', { prompt_ids: [tenant.promptId] })),
  ).toMatch(/^Invalid arguments: kind: /u);
  expect(await promptTexts(tenant.setId)).toEqual(['Which running shoes suit road use? [active]']);
  expect(await failure(prepare(principal, tenant, 'rename_topic', { name: 'Road' }))).toBe(
    'Invalid arguments: topic_id: Invalid input: expected string, received undefined. The rename_topic payload is {topic_id: uuid, name: string}',
  );
});

it('runs a token confirmed twice at once exactly one time', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  const prepared = await addPrompt(principal, tenant);
  const outcomes = await Promise.all([
    failure(confirm(principal, prepared)),
    failure(confirm(principal, prepared)),
  ]);
  expect(outcomes.sort()).toEqual(['This change was already confirmed.', 'succeeded']);
  expect(await promptTexts(tenant.setId)).toEqual([
    'Which running shoes suit road use? [active]',
    'Which running shoes last longest? [active]',
  ]);
});

it('refuses a confirmation of a kind no longer offered, or after expiry, revocation, demotion or from another connection', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  const confirmAs = (as: McpPrincipal, prepared: Record<string, unknown>) =>
    failure(confirm(as, prepared));

  const dropped = await addPrompt(principal, tenant);
  await db
    .updateTable('mcp_confirmations')
    .set({ kind: 'delete_prompts' })
    .where('grant_id', '=', principal.grantId)
    .execute();
  expect(await confirmAs(principal, dropped)).toBe(
    'This kind of change is no longer offered here. Make it in CiteLadder.',
  );

  const expired = await addPrompt(principal, tenant);
  await db
    .updateTable('mcp_confirmations')
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where('grant_id', '=', principal.grantId)
    .execute();
  expect(await confirmAs(principal, expired)).toBe(
    'This confirmation expired. Prepare the change again and confirm it within ten minutes.',
  );

  const other = await connection(tenant);
  expect(await confirmAs(other, await addPrompt(principal, tenant))).toBe(
    'This confirmation token is not valid for this connection. Prepare the change again.',
  );

  const demoted = await addPrompt(principal, tenant);
  await setRole(tenant, 'viewer');
  expect(await confirmAs(principal, demoted)).toBe('Workspace member access is required');
  await setRole(tenant, 'owner');

  const narrowed = await addPrompt(principal, tenant);
  await db
    .updateTable('mcp_oauth_grants')
    .set({ scopes: JSON.stringify(['citeladder:read']) })
    .where('id', '=', principal.grantId)
    .execute();
  expect(await confirmAs(principal, narrowed)).toBe(
    'This connection can only read. Reconnect CiteLadder and tick Allow changes to make changes.',
  );
  await db
    .updateTable('mcp_oauth_grants')
    .set({ scopes: JSON.stringify(['citeladder:read', 'citeladder:write']) })
    .where('id', '=', principal.grantId)
    .execute();

  const revoked = await addPrompt(principal, tenant);
  await db
    .updateTable('mcp_oauth_grants')
    .set({ revoked_at: new Date() })
    .where('id', '=', principal.grantId)
    .execute();
  expect(await confirmAs(principal, revoked)).toBe('Project was not found in this account');
  expect(await promptTexts(tenant.setId)).toEqual(['Which running shoes suit road use? [active]']);
});

it('refuses a project in another workspace before preparing anything', async () => {
  const tenant = await auditTenant(db, fixtures);
  const elsewhere = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  expect(
    await failure(prepare(principal, elsewhere, 'create_topic', { name: 'Trail running' })),
  ).toBe('Project was not found in this account');
  expect(
    await db
      .selectFrom('mcp_confirmations')
      .select('id')
      .where('grant_id', '=', principal.grantId)
      .execute(),
  ).toEqual([]);
});

const generationRuns = (tenant: Tenant) =>
  db
    .selectFrom('prompt_generation_runs')
    .select('request')
    .where('project_id', '=', tenant.projectId)
    .execute();

it('refuses topic previews and generation runs the owner refuses, before any model call', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  expect(await failure(call(principal, 'preview_topics', { project_id: tenant.projectId }))).toBe(
    'Add at least one offering before proposing topics',
  );
  await topic(db, tenant.projectId, 'Road running');
  const elsewhere = await auditTenant(db, fixtures);
  expect(
    await failure(
      prepare(principal, tenant, 'generate_prompts', {
        prompt_set_id: elsewhere.setId,
        request: {},
      }),
    ),
  ).toBe('Prompt set not found');
  expect(
    await failure(
      prepare(principal, tenant, 'generate_prompts', {
        prompt_set_id: tenant.setId,
        request: { distribution: { comparison_share: 0.2 } },
      }),
    ),
  ).toBe('Add a competitor before generating comparison prompts');
  expect(await generationRuns(tenant)).toEqual([]);
});

it('keys a confirmed generation run by its confirmation, so a retry replays instead of generating again', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  await topic(db, tenant.projectId, 'Road running');
  const prepared = await prepare(principal, tenant, 'generate_prompts', {
    prompt_set_id: tenant.setId,
    request: { count: 10 },
  });
  expect(prepared).toMatchObject({ preview: { spend: expect.stringMatching(/^AI credits/u) } });
  expect(await generationRuns(tenant)).toEqual([]);
  const { id } = await db
    .selectFrom('mcp_confirmations')
    .select('id')
    .where('grant_id', '=', principal.grantId)
    .executeTakeFirstOrThrow();
  await db
    .insertInto('prompt_generation_runs')
    .values({
      id: randomUUID(),
      workspace_id: tenant.workspaceId,
      project_id: tenant.projectId,
      prompt_set_id: tenant.setId,
      generator_version: '1',
      request: JSON.stringify({ count: 10, idempotency_key: id }),
      provenance: JSON.stringify({ candidates_generated: 0 }),
      created_at: new Date(),
    })
    .execute();
  const outcomes = await Promise.all([
    failure(confirm(principal, prepared)),
    failure(confirm(principal, prepared)),
  ]);
  expect(outcomes.filter((outcome) => outcome === 'succeeded')).toHaveLength(1);
  expect(await generationRuns(tenant)).toHaveLength(1);
  expect(
    await db
      .selectFrom('security_events')
      .select('event')
      .where('actor_id', '=', tenant.userId)
      .where('event', 'like', 'mcp.write.%')
      .execute(),
  ).toEqual([{ event: 'mcp.write.generate_prompts' }]);
});

it('spends a narrower per-connection budget on changes', async () => {
  const tenant = await auditTenant(db, fixtures);
  const principal = await connection(tenant);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-01T10:00:15Z') });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  for (let index = 0; index < mcpPolicy.write_call_grant_limit; index++)
    await admitWriteCall(db, principal.grantId);
  const refused = await admitWriteCall(db, principal.grantId).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).status).toBe(429);
});
