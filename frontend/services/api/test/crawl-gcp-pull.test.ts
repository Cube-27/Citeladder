import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { crawlLogs } from '../src/config/crawl-logs.ts';
import { createSource, createSourceSchema } from '../src/crawl-logs/sources.ts';
import { sourceList } from '../src/crawl-logs/source-reads.ts';
import { gcpLogFilter } from '../src/crawl-logs/gcp-filter.ts';

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
