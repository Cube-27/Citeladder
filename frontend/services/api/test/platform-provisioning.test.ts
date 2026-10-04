import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { provisionPlatformConnections } from '../src/providers/platform-provisioning.ts';
import { providerPolicy } from '../src/providers/config.ts';
import { Fixtures, testConfig, testDatabase } from './support.ts';

const config = testConfig(),
  db = testDatabase(config),
  fixtures = new Fixtures(db);
let system: string;
let actor: string, member: string;
beforeAll(async () => {
  actor = `${await fixtures.user()}@example.test`;
  member = `${await fixtures.user()}@example.test`;
  await db.updateTable('users').set({ role: 'admin' }).where('email', '=', actor).execute();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

it('previews, converges concurrently and rotates only platform metadata without touching BYOK', async () => {
  const reference = 'vault://platform/openai';
  await expect(
    provisionPlatformConnections(db, actor, { openai: reference }),
  ).resolves.toMatchObject([{ status: 'created' }]);
  expect(
    await db.selectFrom('workspaces').select('id').where('is_system', '=', true).execute(),
  ).toEqual([]);
  system = await fixtures.systemWorkspace();
  const customer = await fixtures.ownedWorkspace(await fixtures.user()),
    byokId = randomUUID(),
    now = new Date();
  await db
    .insertInto('provider_connections')
    .values({
      id: byokId,
      workspace_id: customer,
      label: 'Customer',
      transport_provider: 'openai',
      credential_source: 'byok',
      credential_revision: randomUUID(),
      api_key_encrypted: 'recorded-ciphertext',
      base_url: '',
      active: true,
      last_test_status: '',
      last_tested_at: null,
      paused_at: null,
      pause_until: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  const [first, second] = await Promise.all([
    provisionPlatformConnections(db, actor, { openai: reference }, { apply: true }),
    provisionPlatformConnections(db, actor, { openai: reference }, { apply: true }),
  ]);
  expect(first[0]!.connection_id).toBe(second[0]!.connection_id);
  expect([first[0]!.status, second[0]!.status].sort()).toEqual(['created', 'unchanged']);
  const connectionId = first[0]!.connection_id;
  const prior = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('id', '=', connectionId)
    .executeTakeFirstOrThrow();
  await db
    .updateTable('provider_connections')
    .set({
      paused_at: now,
      pause_until: new Date(now.getTime() + 60_000),
      pause_reason: 'rate_limit',
      last_test_status: 'failed',
      last_tested_at: now,
    })
    .where('id', '=', connectionId)
    .execute();
  const route = await db
    .selectFrom('provider_routes')
    .selectAll()
    .where('connection_id', '=', connectionId)
    .executeTakeFirstOrThrow();
  await db
    .updateTable('provider_routes')
    .set({ active: false, is_default: false, transport_model: 'retired' })
    .where('id', '=', route.id)
    .execute();
  expect(
    (await provisionPlatformConnections(db, actor, { openai: reference }, { apply: true }))[0]!
      .status,
  ).toBe('updated');
  expect(
    (
      await db
        .selectFrom('provider_connections')
        .select('paused_at')
        .where('id', '=', connectionId)
        .executeTakeFirstOrThrow()
    ).paused_at,
  ).not.toBeNull();
  await provisionPlatformConnections(db, actor, { openai: `${reference}-v2` });
  expect(
    (
      await db
        .selectFrom('provider_connections')
        .select('credential_revision')
        .where('id', '=', connectionId)
        .executeTakeFirstOrThrow()
    ).credential_revision,
  ).toBe(prior.credential_revision);
  await provisionPlatformConnections(db, actor, { openai: `${reference}-v2` }, { apply: true });
  const rotated = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('id', '=', connectionId)
    .executeTakeFirstOrThrow();
  expect(rotated).toMatchObject({
    workspace_id: system,
    api_key_encrypted: '',
    paused_at: null,
    pause_until: null,
    pause_reason: '',
    last_tested_at: null,
    last_test_status: '',
  });
  expect(rotated.credential_revision).not.toBe(prior.credential_revision);
  expect(
    await db
      .selectFrom('provider_routes')
      .selectAll()
      .where('id', '=', route.id)
      .executeTakeFirstOrThrow(),
  ).toMatchObject({
    transport_model: providerPolicy.routes.chatgpt.transport_model,
    active: true,
    is_default: true,
  });
  expect(
    (
      await db
        .selectFrom('provider_connections')
        .select('api_key_encrypted')
        .where('id', '=', byokId)
        .executeTakeFirstOrThrow()
    ).api_key_encrypted,
  ).toBe('recorded-ciphertext');
  const anthropic = await provisionPlatformConnections(
    db,
    actor,
    {
      anthropic: 'vault://platform/anthropic',
    },
    { apply: true },
  );
  expect(
    (
      await db
        .selectFrom('provider_routes')
        .select('logical_engine')
        .where('connection_id', '=', anthropic[0]!.connection_id)
        .execute()
    ).map((row) => row.logical_engine),
  ).toEqual(['claude']);
});

it('previews CLI rotation unless apply is explicit and refuses conflicting mutation flags', async () => {
  const reference = 'vault://platform/openai-cli';
  const run = (flags: string[]) =>
    promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../src/cli/provision-platform-providers.ts', import.meta.url)),
        '--actor',
        actor,
        '--credential-ref',
        `openai=${reference}`,
        ...flags,
      ],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          APP_ENV: 'test',
          CITELADDER_DISABLE_DOTENV: '1',
          DATABASE_URL: config.databaseUrl,
          JWT_SECRET_KEY: config.session.secretKey,
        },
        timeout: 10_000,
        windowsHide: true,
      },
    );
  const prior = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('workspace_id', '=', system)
    .where('transport_provider', '=', 'openai')
    .executeTakeFirstOrThrow();
  for (const flags of [[], ['--dry-run']]) {
    const { stdout } = await run(flags);
    expect(JSON.parse(stdout)).toMatchObject([{ connection_id: prior.id, status: 'updated' }]);
    expect(
      await db
        .selectFrom('provider_connections')
        .selectAll()
        .where('id', '=', prior.id)
        .executeTakeFirstOrThrow(),
    ).toEqual(prior);
  }
  await expect(run(['--apply', '--dry-run'])).rejects.toMatchObject({ code: 1 });
  expect(
    await db
      .selectFrom('provider_connections')
      .selectAll()
      .where('id', '=', prior.id)
      .executeTakeFirstOrThrow(),
  ).toEqual(prior);
  await run(['--apply']);
  const applied = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('id', '=', prior.id)
    .executeTakeFirstOrThrow();
  expect(applied.platform_credential_ref).toBe(reference);
  expect(applied.credential_revision).not.toBe(prior.credential_revision);
});

it.each(['', 'sk-live-value', 'production-secret', 'password-value'])(
  'refuses secret-shaped reference %s atomically',
  async (reference) => {
    const before = await db
      .selectFrom('provider_connections')
      .selectAll()
      .where('workspace_id', '=', system)
      .execute();
    expect(() => provisionPlatformConnections(db, actor, { openai: reference })).toThrow(
      'non-secret opaque',
    );
    expect(
      await db
        .selectFrom('provider_connections')
        .selectAll()
        .where('workspace_id', '=', system)
        .execute(),
    ).toEqual(before);
  },
);
it('refuses unsupported transports', () => {
  expect(() =>
    provisionPlatformConnections(db, actor, { mistral: 'vault://platform/mistral' }),
  ).toThrow('unknown transport');
});

it('refuses non-admin, inactive and unknown operators without changing metadata', async () => {
  const before = await db
    .selectFrom('provider_connections')
    .selectAll()
    .where('workspace_id', '=', system)
    .execute();
  for (const email of [member, 'missing@example.test']) {
    await expect(
      provisionPlatformConnections(db, email, { openai: 'vault://changed' }, { apply: true }),
    ).rejects.toThrow('active platform administrator');
  }
  await db.updateTable('users').set({ is_active: false }).where('email', '=', actor).execute();
  await expect(
    provisionPlatformConnections(db, actor, { openai: 'vault://changed' }),
  ).rejects.toThrow('active platform administrator');
  await expect(
    provisionPlatformConnections(db, actor, { openai: 'vault://changed' }, { apply: true }),
  ).rejects.toThrow('active platform administrator');
  expect(
    await db
      .selectFrom('provider_connections')
      .selectAll()
      .where('workspace_id', '=', system)
      .execute(),
  ).toEqual(before);
});
