import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createSecretCipher } from '../src/integrations/fernet.ts';
import {
  createConnection,
  getConnection,
  provisionRoutes,
  updateConnection,
  deleteConnection,
  approvedEndpoint,
} from '../src/providers/connections.ts';
import { providerSettings } from '../src/providers/config.ts';
import { createConnectionInput, updateConnectionInput } from '../src/providers/inputs.ts';
import { probeConnection } from '../src/providers/probes.ts';
import { connectionStates } from '../src/providers/states.ts';
import { sendProbe } from '../src/providers/probe-transport.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const settings = providerSettings({});
const key = 'provider-tests-encryption-key';
let actor: string;
let workspace: string;
let token: string;
beforeAll(async () => {
  actor = await fixtures.user();
  workspace = await fixtures.ownedWorkspace(actor);
  token = await sessionToken({ sub: actor, ver: 0 });
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
const create = (input: Record<string, unknown> = {}) =>
  createConnection(
    db,
    workspace,
    actor,
    createConnectionInput.parse({
      transport_provider: 'openai',
      api_key: 'test-key',
      routes: [{ logical_engine: 'chatgpt' }],
      ...input,
    }),
    key,
    settings,
  );

describe('provider credential custody', () => {
  it('normalizes trailing separators without widening the approved destination', () => {
    const separators = '/'.repeat(20_000);
    const endpoint = settings.endpoints.dataforseo;
    expect(approvedEndpoint('dataforseo', ` ${endpoint}${separators} `, settings)).toBe(endpoint);
    expect(() =>
      approvedEndpoint('dataforseo', `${endpoint}/other${separators}`, settings),
    ).toThrow('Provider endpoint is not approved');
  });
  it('refuses unsafe destinations and incomplete or mixed credential shapes before storing anything', async () => {
    for (const input of [
      { transport_provider: 'dataforseo', api_key: 'key' },
      { transport_provider: 'dataforseo', api_login: 'user' },
      { transport_provider: 'openai', api_login: 'user', api_password: 'password' },
      { transport_provider: 'openai' },
      { transport_provider: 'openai', api_key: 'key', base_url: 'http://private.example.test' },
      {
        transport_provider: 'openai',
        api_key: 'key',
        app_routes: [
          {
            feature: 'agent',
            model: 'model',
            disclosure_accepted: true,
            api_base_url: 'https://user:password@example.test',
          },
        ],
      },
    ])
      expect(createConnectionInput.safeParse(input).success).toBe(false);
    expect(updateConnectionInput.safeParse({ api_login: 'user' }).success).toBe(false);
    await expect(create({ base_url: 'https://attacker.example.test/v1' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(create({ routes: [{ logical_engine: 'claude' }] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      sendProbe({
        url: 'https://127.0.0.1/v1',
        headers: {},
        timeoutSeconds: 1,
        maxBytes: 128,
        customerDestination: true,
      }),
    ).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  it('preserves credentials on omitted updates and makes successful verification stale after rotation', async () => {
    const response = await create();
    const original = await getConnection(db, workspace, response.id);
    await probeConnection(db, workspace, response.id, key, settings, async () => ({
      status: 200,
      body: { output: [{ content: [{ type: 'output_text', text: 'ok' }] }] },
    }));
    await updateConnection(
      db,
      workspace,
      actor,
      response.id,
      updateConnectionInput.parse({ label: 'New label' }),
      key,
      settings,
    );
    expect((await getConnection(db, workspace, response.id)).api_key_encrypted).toBe(
      original.api_key_encrypted,
    );
    await updateConnection(
      db,
      workspace,
      actor,
      response.id,
      updateConnectionInput.parse({ api_key: 'fresh-key' }),
      key,
      settings,
    );
    expect((await getConnection(db, workspace, response.id)).last_tested_at).toBeNull();
    await expect(
      updateConnection(
        db,
        workspace,
        actor,
        response.id,
        updateConnectionInput.parse({ api_login: 'user', api_password: 'password' }),
        key,
        settings,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('bounds app compatibility retries and rejects stale app-route probe success', async () => {
    const w = await fixtures.ownedWorkspace(await fixtures.user());
    const input = {
      disclosure_accepted: true as const,
      feature: 'agent',
      model: 'old-model',
      api_base_url: 'https://models.example.test/v1',
    };
    const response = await createConnection(
      db,
      w,
      actor,
      createConnectionInput.parse({
        transport_provider: 'openai',
        api_key: 'test-key',
        app_routes: [input],
      }),
      key,
      settings,
    );
    let calls = 0;
    const result = await probeConnection(db, w, response.id, key, settings, async (request) => {
      calls++;
      if (calls === 1)
        return { status: 400, body: { error: { message: 'max_completion_tokens unsupported' } } };
      expect(request.body).toHaveProperty('max_tokens');
      expect(request.body).not.toHaveProperty('max_completion_tokens');
      await updateConnection(
        db,
        w,
        actor,
        response.id,
        updateConnectionInput.parse({ app_routes: [{ ...input, model: 'new-model' }] }),
        key,
        settings,
      );
      return { status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
    });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ status: 'failed', error_code: 'revision_changed' });
    expect((await getConnection(db, w, response.id)).last_tested_at).toBeNull();
    const appRoute = await db
      .selectFrom('provider_app_routes')
      .selectAll()
      .where('connection_id', '=', response.id)
      .executeTakeFirstOrThrow();
    expect(appRoute.probed_revision).toBeNull();
  });
  it('stores only encrypted credentials, preserves disabled capabilities on explicit rollout, and isolates workspaces', async () => {
    const response = await create({
      transport_provider: 'dataforseo',
      api_key: '',
      api_login: 'account@example.test',
      api_password: 'test-password',
      routes: [],
    });
    const row = await getConnection(db, workspace, response.id);
    expect(JSON.parse(createSecretCipher(key).decrypt(row.api_key_encrypted))).toEqual({
      login: 'account@example.test',
      password: 'test-password',
    });
    await db
      .updateTable('provider_routes')
      .set({ active: false, deactivation_reason: 'disabled' })
      .where('connection_id', '=', response.id)
      .where('logical_engine', '=', 'chatgpt_search')
      .execute();
    await db
      .deleteFrom('provider_routes')
      .where('connection_id', '=', response.id)
      .where('logical_engine', '=', 'gemini_consumer')
      .execute();
    const updated = await provisionRoutes(db, workspace, response.id);
    expect(updated.routes.find((route) => route.logical_engine === 'chatgpt_search')?.active).toBe(
      false,
    );
    expect(updated.routes.some((route) => route.logical_engine === 'gemini_consumer')).toBe(true);
    expect((await getConnection(db, workspace, response.id)).api_key_encrypted).toBe(
      row.api_key_encrypted,
    );
    await expect(provisionRoutes(db, randomUUID(), response.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      updateConnection(
        db,
        workspace,
        actor,
        response.id,
        updateConnectionInput.parse({ api_key: 'wrong-shape' }),
        key,
        settings,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('serializes app feature ownership and refuses destination changes without fresh confirmed custody', async () => {
    const input = {
      app_routes: [
        {
          disclosure_accepted: true,
          feature: 'agent',
          model: 'test-model',
          api_base_url: 'https://models.example.test/v1',
        },
      ],
    };
    const owner = await fixtures.user();
    const w = await fixtures.ownedWorkspace(owner);
    const attempt = () =>
      createConnection(
        db,
        w,
        owner,
        createConnectionInput.parse({
          transport_provider: 'openai',
          api_key: 'test-key',
          ...input,
        }),
        key,
        settings,
      );
    const outcomes = await Promise.allSettled([attempt(), attempt()]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const result = outcomes.find((item) => item.status === 'fulfilled');
    if (result?.status !== 'fulfilled') throw new Error('No created connection');
    const change = {
      app_routes: [{ ...input.app_routes[0], api_base_url: 'https://different.example.test/v1' }],
    };
    await expect(
      updateConnection(
        db,
        w,
        owner,
        result.value.id,
        updateConnectionInput.parse(change),
        key,
        settings,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const updated = await updateConnection(
      db,
      w,
      owner,
      result.value.id,
      updateConnectionInput.parse({
        ...change,
        api_key: 'fresh-key',
        confirm_destination_change: true,
      }),
      key,
      settings,
    );
    expect(updated.app_routes[0]?.verified).toBe(false);
    const disclosures = await db
      .selectFrom('provider_disclosures')
      .select('destination')
      .where('connection_id', '=', updated.id)
      .execute();
    expect(disclosures.map((row) => row.destination)).toEqual([
      'https://models.example.test/v1',
      'https://different.example.test/v1',
    ]);
  });

  it('commits probe I/O outside locks and prevents a rotated credential from becoming verified', async () => {
    const response = await create();
    const result = await probeConnection(
      db,
      workspace,
      response.id,
      key,
      settings,
      async (request) => {
        expect(request.body).toMatchObject({ input: expect.any(String), store: false });
        expect(request.body).not.toHaveProperty('tools');
        await updateConnection(
          db,
          workspace,
          actor,
          response.id,
          updateConnectionInput.parse({ api_key: 'rotated-key' }),
          key,
          settings,
        );
        return {
          status: 200,
          body: { output: [{ content: [{ type: 'output_text', text: 'ok' }] }] },
        };
      },
    );
    expect(result).toMatchObject({ status: 'failed', error_code: 'revision_changed' });
    expect((await getConnection(db, workspace, response.id)).last_test_status).toBe('');
    const receipt = await db
      .selectFrom('provider_connection_tests')
      .select('error_code')
      .where('connection_id', '=', response.id)
      .executeTakeFirstOrThrow();
    expect(receipt.error_code).toBe('revision_changed');
  });

  it('classifies an unreadable credential as authentication failure before sending a probe', async () => {
    const row = await create();
    let calls = 0;
    const result = await probeConnection(
      db,
      workspace,
      row.id,
      'different-test-key',
      settings,
      async () => {
        calls++;
        throw new Error('Unexpected probe');
      },
    );
    expect(result).toMatchObject({ status: 'failed', error_code: 'auth_failure' });
    expect(calls).toBe(0);
  });
  it('DataForSEO tests only credential liveness and honors body-level auth failures', async () => {
    const row = await create({
      transport_provider: 'dataforseo',
      api_key: '',
      api_login: 'u@example.test',
      api_password: 'test-password',
      routes: [],
    });
    const result = await probeConnection(db, workspace, row.id, key, settings, async (request) => {
      expect(request.url).toBe('https://api.dataforseo.com/v3/appendix/user_data');
      expect(request.body).toBeUndefined();
      return { status: 200, body: { status_code: 40100, status_message: 'raw-secret-echo' } };
    });
    expect(result).toMatchObject({ status: 'failed', error_code: 'auth_failure' });
    expect(result.detail).not.toContain('raw-secret-echo');
  });

  it('keeps never-probed, connected and paused states distinct without I/O', async () => {
    const w = await fixtures.ownedWorkspace(await fixtures.user());
    const id = (
      await createConnection(
        db,
        w,
        actor,
        createConnectionInput.parse({
          transport_provider: 'anthropic',
          api_key: 'test-key',
          routes: [{ logical_engine: 'claude' }],
        }),
        key,
        settings,
      )
    ).id;
    const state = async () =>
      (await connectionStates(db, w)).providers.find((entry) => entry.key === 'claude');
    expect((await state())?.state).toBe('missing');
    await probeConnection(db, w, id, key, settings, async () => ({
      status: 200,
      body: { content: [{ type: 'text', text: 'ok' }] },
    }));
    expect((await state())?.state).toBe('connected');
    await db
      .updateTable('provider_connections')
      .set({ paused_at: new Date(), pause_until: null, pause_reason: 'auth_failure' })
      .where('id', '=', id)
      .execute();
    expect(await state()).toMatchObject({ state: 'failed', safe_reason: 'auth_failure' });
  });

  it('enforces credential administration at the HTTP boundary', async () => {
    const app = createApp(config, db);
    const request = (session: string, method: string, path = '/api/v1/provider-connections') =>
      app.request(path, {
        method,
        headers: {
          cookie: `${config.session.cookieName}=${session}`,
          'x-workspace-id': workspace,
          'content-type': 'application/json',
        },
        ...(method === 'POST'
          ? { body: JSON.stringify({ transport_provider: 'openai', api_key: 'test-key' }) }
          : {}),
      });
    for (const [role, permitted] of [
      ['owner', true],
      ['admin', true],
      ['member', false],
      ['viewer', false],
    ] as const) {
      const user = role === 'owner' ? actor : await fixtures.user();
      if (role !== 'owner') await fixtures.member(workspace, user, role);
      const roleToken = await sessionToken({ sub: user, ver: 0 });
      expect((await request(roleToken, 'POST')).status).toBe(permitted ? 201 : 403);
      expect((await request(roleToken, 'GET')).status).toBe(200);
    }
    const foreign = await createConnection(
      db,
      await fixtures.ownedWorkspace(await fixtures.user()),
      actor,
      createConnectionInput.parse({ transport_provider: 'openai', api_key: 'test-key' }),
      key,
      settings,
    );
    expect(
      (await request(token, 'DELETE', `/api/v1/provider-connections/${foreign.id}`)).status,
    ).toBe(404);
  });

  it('deletes capacity buckets in the same transaction as the connection', async () => {
    for (let index = 0; index < 2; index++) {
      const row = await create();
      const now = new Date();
      await db
        .insertInto('provider_capacity_buckets')
        .values({
          id: randomUUID(),
          connection_id: row.id,
          billing_account_id: null,
          pool_kind: 'connection',
          transport_provider: 'openai',
          capacity: '1',
          tokens: '1',
          refill_tokens_per_second: '0',
          refilled_at: now,
          blocked_until: null,
          policy_version: 'test',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await deleteConnection(db, workspace, actor, row.id);
      await expect(getConnection(db, workspace, row.id)).rejects.toMatchObject({ status: 404 });
    }
  });
});
