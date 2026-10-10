import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { crawlLogs } from '../src/config/crawl-logs.ts';
import { confirmSinkFilter, createSource, createSourceSchema } from '../src/crawl-logs/sources.ts';
import { ingest } from '../src/crawl-logs/ingest.ts';
import { verifyPullSource } from '../src/crawl-logs/gcp-verify.ts';
import { sourceList } from '../src/crawl-logs/source-reads.ts';
import { gcpLogFilter } from '../src/crawl-logs/gcp-filter.ts';
import { GcpError, pubSubReader } from '../src/crawl-logs/gcp-client.ts';

/** An in-memory Google: metadata, IAM Credentials and one Pub/Sub subscription. */
function fakeGoogle(
  options: {
    labels?: Record<string, string>;
    push?: boolean;
    ackDeadline?: number;
    status?: number;
    tokenLifetimeMs?: number;
  } = {},
) {
  const state = {
    messages: [] as { messageId: string; data: string }[],
    acked: [] as string[],
    tokensMinted: 0,
    pulls: 0,
    status: options.status ?? 200,
    clock: Date.parse('2026-10-10T00:00:00Z'),
    log: [] as string[],
    labels: options.labels ?? {},
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const transport = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get('authorization');
    state.log.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith('http://metadata.google.internal/'))
      return reply(200, { access_token: 'runtime-token' });
    if (url.startsWith('https://iamcredentials.googleapis.com/')) {
      if (authorization !== 'Bearer runtime-token') return reply(401, {});
      state.tokensMinted += 1;
      return reply(200, {
        accessToken: 'reader-token-' + state.tokensMinted,
        expireTime: new Date(state.clock + (options.tokenLifetimeMs ?? 900_000)).toISOString(),
      });
    }
    if (!authorization?.startsWith('Bearer reader-token-')) return reply(401, {});
    if (state.status !== 200) return reply(state.status, { error: { message: 'secret detail' } });
    if (url.endsWith(':pull')) {
      state.pulls += 1;
      const { maxMessages } = JSON.parse(String(init?.body)) as { maxMessages: number };
      const batch = state.messages
        .filter((m) => !state.acked.includes(m.messageId))
        .slice(0, maxMessages);
      return reply(200, {
        receivedMessages: batch.map((message) => ({ ackId: 'ack-' + message.messageId, message })),
      });
    }
    if (url.endsWith(':acknowledge')) {
      const { ackIds } = JSON.parse(String(init?.body)) as { ackIds: string[] };
      state.acked.push(...ackIds.map((id) => id.slice(4)));
      return reply(200, {});
    }
    return reply(200, {
      name: SUBSCRIPTION,
      labels: state.labels,
      pushConfig: options.push ? { pushEndpoint: 'https://example.test/push' } : {},
      ackDeadlineSeconds: options.ackDeadline ?? 120,
    });
  };
  const reader = pubSubReader({ readerEmail: READER, transport, now: () => state.clock });
  return { state, reader };
}

const config = testConfig(),
  db = testDatabase(config),
  fixtures = new VisibilityFixtures(db);
const original = { ...crawlLogs };
const READER = 'citeladder-log-reader@citeladder-prod.iam.gserviceaccount.com';
const SUBSCRIPTION = 'projects/acme-prod/subscriptions/citeladder-ai-crawlers-sub';
const scope = (t: Tenant) => ({ workspaceId: t.workspaceId, projectId: t.projectId });

async function pullSource(tenant?: Tenant, rate?: number) {
  const owner = tenant ?? (await fixtures.tenant());
  const created = await createSource(db, scope(owner), owner.userId, {
    setup: 'gcp_pubsub_pull',
    origin: 'https://acme.example',
    format: 'ndjson',
    subscription: SUBSCRIPTION,
    ...(rate === undefined ? {} : { declared_sample_rate: rate }),
  });
  return { tenant: owner, id: created.id, token: created.token };
}

beforeAll(() => {
  crawlLogs.ingestion_enabled = true;
  process.env.CRAWL_LOG_READER_EMAIL = READER;
});
afterAll(async () => {
  Object.assign(crawlLogs, original);
  delete process.env.CRAWL_LOG_READER_EMAIL;
  await fixtures.cleanup();
  await db.destroy();
});

describe('Google Cloud pull sources', () => {
  it('creates a tokenless source awaiting verification, visible to its workspace only', async () => {
    const { tenant, id, token } = await pullSource(undefined, 0.5);
    const other = await fixtures.tenant();
    expect(token).toBeNull();
    const list = await sourceList(db, scope(tenant));
    expect(list.gcp_pull).toMatchObject({ availability: 'available', reader_email: READER });
    const [item] = list.items;
    expect(item).toMatchObject({
      id,
      kind: 'pull',
      setup: 'gcp_pubsub_pull',
      preset: 'gcp_log_entry',
      collection_point: 'cdn_edge',
      sampling: { kind: 'sampled', rate: 0.5 },
      state: 'awaiting_verification',
      token_prefix: null,
      pull: {
        subscription: SUBSCRIPTION,
        verified_at: null,
        filter_current: true,
        declared_sample_rate: 0.5,
        last_drained_at: null,
      },
    });
    expect(item!.pull!.verification_nonce).toMatch(/^[a-z2-7]{26}$/u);
    expect((await sourceList(db, scope(other))).items).toEqual([]);
  });
  it('keeps one live source per host across webhook and pull kinds', async () => {
    const tenant = await fixtures.tenant();
    await createSource(db, scope(tenant), tenant.userId, {
      setup: 'custom',
      origin: 'https://acme.example',
      format: 'ndjson',
    });
    await expect(pullSource(tenant)).rejects.toMatchObject({
      status: 409,
      message: 'An active live source already covers this host',
    });
    // The database index refuses the same pair even past the service check.
    const { id } = await pullSource();
    const source = await db
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('crawl_log_sources')
        .values({
          ...source,
          sampling: JSON.stringify(source.sampling),
          accepted_hosts: JSON.stringify(source.accepted_hosts),
          id: crypto.randomUUID(),
          kind: 'webhook',
          setup: 'custom',
          subscription: null,
          verification_nonce: null,
          filter_catalog_version: null,
          declared_sample_rate: null,
        })
        .execute(),
    ).rejects.toThrow(/uq_crawl_log_live_host/u);
  });
  it('accepts a subscription path only on the Google Cloud setup', () => {
    const parse = (input: Record<string, unknown>) =>
      createSourceSchema.safeParse({ origin: 'https://acme.example', ...input }).success;
    expect(parse({ setup: 'gcp_pubsub_pull', subscription: SUBSCRIPTION })).toBe(true);
    expect(parse({ setup: 'gcp_pubsub_pull' })).toBe(false);
    expect(parse({ setup: 'gcp_pubsub_pull', subscription: 'acme-prod/citeladder' })).toBe(false);
    expect(
      parse({ setup: 'gcp_pubsub_pull', subscription: SUBSCRIPTION, declared_sample_rate: 0 }),
    ).toBe(false);
    expect(parse({ setup: 'custom', subscription: SUBSCRIPTION })).toBe(false);
    expect(parse({ setup: 'custom', declared_sample_rate: 1 })).toBe(false);
  });
  it('hides the connector when no reader service account is configured', async () => {
    const tenant = await fixtures.tenant();
    process.env.CRAWL_LOG_READER_EMAIL = '';
    try {
      expect((await sourceList(db, scope(tenant))).gcp_pull).toMatchObject({
        availability: 'pull_unavailable',
        reader_email: null,
      });
      await expect(pullSource(tenant)).rejects.toMatchObject({ status: 409 });
    } finally {
      process.env.CRAWL_LOG_READER_EMAIL = READER;
    }
  });
});

describe('sink filter', () => {
  it('escapes RE2 metacharacters and string quotes in every catalog pattern', () => {
    const filter = gcpLogFilter({
      bots: [
        { ua_patterns: ['gptbot/1.0', 'a+b(c)'] },
        { ua_patterns: ['say "hi"', 'gptbot/1.0'] },
      ],
    });
    expect(filter).toBe(
      [
        '(resource.type="http_load_balancer"',
        '  OR (resource.type="cloud_run_revision" AND log_id("run.googleapis.com/requests")))',
        String.raw`AND httpRequest.userAgent=~"(?i)(a\\+b\\(c\\)|gptbot/1\\.0|say \"hi\")"`,
      ].join('\n'),
    );
  });
});

describe('Google REST client', () => {
  it('reuses the reader token until shortly before it expires, then mints another', async () => {
    const google = fakeGoogle();
    await google.reader.subscription(SUBSCRIPTION);
    google.state.clock += 830_000;
    await google.reader.subscription(SUBSCRIPTION);
    expect(google.state.tokensMinted).toBe(1);
    google.state.clock += 20_000;
    await google.reader.subscription(SUBSCRIPTION);
    expect(google.state.tokensMinted).toBe(2);
    expect(google.state.log.filter((line) => line.includes('pubsub.googleapis.com'))).toEqual([
      'GET https://pubsub.googleapis.com/v1/projects/acme-prod/subscriptions/citeladder-ai-crawlers-sub',
      'GET https://pubsub.googleapis.com/v1/projects/acme-prod/subscriptions/citeladder-ai-crawlers-sub',
      'GET https://pubsub.googleapis.com/v1/projects/acme-prod/subscriptions/citeladder-ai-crawlers-sub',
    ]);
  });
  it.each([
    [403, 'permission_denied'],
    [404, 'not_found'],
    [400, 'invalid'],
    [503, 'unavailable'],
  ])('maps a %i subscription response to %s without its body', async (status, failure) => {
    const google = fakeGoogle({ status });
    const error = await google.reader.subscription(SUBSCRIPTION).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GcpError);
    expect(error).toMatchObject({ failure, message: 'gcp_' + failure });
  });
  it('reports a failed token mint as unavailable, never as the customer denying access', async () => {
    const reader = pubSubReader({
      readerEmail: READER,
      transport: async () => new Response('{}', { status: 403 }),
    });
    await expect(reader.pull(SUBSCRIPTION, 10)).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

/** The persisted source row as a pull source sees it. */
const row = (id: string) =>
  db.selectFrom('crawl_log_sources').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
/** A Google whose subscription carries this source's own nonce label. */
async function labelled(id: string, options: Parameters<typeof fakeGoogle>[0] = {}) {
  const source = await row(id);
  return fakeGoogle({ labels: { 'citeladder-source': source.verification_nonce! }, ...options });
}

describe('subscription verification', () => {
  it.each([
    [{ labels: { 'citeladder-source': 'someone-elses-nonce' } }, 'label_mismatch'],
    [{ push: true }, 'push_subscription'],
    [{ ackDeadline: 30 }, 'ack_deadline'],
    [{ status: 403 }, 'permission_denied'],
    [{ status: 404 }, 'not_found'],
  ] as const)('stalls on %j with %s', async (options, failure) => {
    const { tenant, id } = await pullSource();
    const google = await labelled(id, options);
    expect(await verifyPullSource(db, await row(id), google.reader)).toEqual({
      verified: false,
      failure,
    });
    expect((await sourceList(db, scope(tenant))).items[0]).toMatchObject({
      state: 'stalled',
      stall_reason: 'verification_failed',
      pull: { verified_at: null, verification_failure: failure },
    });
  });
  it('activates on a passing check and lifts a verification stall only through a check', async () => {
    const { tenant, id } = await pullSource();
    const google = await labelled(id, { ackDeadline: 30 });
    await verifyPullSource(db, await row(id), google.reader);
    const stalledAt = (await row(id)).stalled_at;
    // A heartbeat receipt cannot lift it: only the subscription owner fixing it can.
    await ingest(db, await row(id), Buffer.alloc(0), { key: 'pull-heartbeat' });
    expect((await row(id)).stall_reason).toBe('verification_failed');
    const again = await verifyPullSource(db, await row(id), google.reader);
    expect(again.failure).toBe('ack_deadline');
    expect((await row(id)).stalled_at).toEqual(stalledAt);
    const fixed = await labelled(id);
    expect(await verifyPullSource(db, await row(id), fixed.reader)).toEqual({
      verified: true,
      failure: null,
    });
    expect((await sourceList(db, scope(tenant))).items[0]).toMatchObject({
      state: 'active',
      stall_reason: null,
      pull: { verification_failure: null },
    });
    expect((await row(id)).verified_at).not.toBeNull();
  });
  it('changes nothing when Google is unavailable', async () => {
    const { tenant, id } = await pullSource();
    const google = await labelled(id, { status: 503 });
    expect(await verifyPullSource(db, await row(id), google.reader)).toEqual({
      verified: false,
      failure: 'unavailable',
    });
    expect((await sourceList(db, scope(tenant))).items[0]).toMatchObject({
      state: 'awaiting_verification',
      stall_reason: null,
      pull: { verification_checked_at: null },
    });
  });
  it('records a confirmed sink filter for the current catalog in the owning workspace only', async () => {
    const { tenant, id } = await pullSource();
    const other = await fixtures.tenant();
    await db
      .updateTable('crawl_log_sources')
      .set({ filter_catalog_version: '1' })
      .where('id', '=', id)
      .execute();
    expect((await sourceList(db, scope(tenant))).items[0]!.pull!.filter_current).toBe(false);
    // Another workspace naming this source's UUID finds nothing to confirm.
    await expect(confirmSinkFilter(db, scope(other), other.userId, id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await row(id)).filter_catalog_version).toBe('1');
    await confirmSinkFilter(db, scope(tenant), tenant.userId, id);
    expect((await sourceList(db, scope(tenant))).items[0]!.pull).toMatchObject({
      filter_catalog_version: '2',
      filter_current: true,
    });
  });
});
