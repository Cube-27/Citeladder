import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { sql } from 'kysely';
import { createApp } from '../src/app.ts';
import { testConfig, testDatabase, sessionToken } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { crawlLogs } from '../src/config/crawl-logs.ts';
import { createSource, mutateSource } from '../src/crawl-logs/sources.ts';
import { ingest, decodedBody } from '../src/crawl-logs/ingest.ts';
import { createUpload, completeUpload } from '../src/crawl-logs/uploads.ts';
import { refreshCrawlLogs } from '../src/crawl-logs/rollup.ts';
import {
  abandonUploads,
  botRequestRetentionSweep,
  botIpRangeRefresh,
} from '../src/crawl-logs/maintenance.ts';
import { crawlers } from '../src/config/crawlers.ts';
import { crawlSummary, activityPage, crawlerPage } from '../src/crawl-logs/reads.ts';
import { dispatchTool } from '../src/mcp/tools.ts';
import { verifyBot } from '../src/crawl-logs/identity.ts';
import {
  logLines,
  parseLogLine,
  UnsupportedLogFormat,
} from '@citeladder/contracts/crawl-log-format';

const config = testConfig(),
  db = testDatabase(config),
  fixtures = new VisibilityFixtures(db),
  app = createApp(config, db);
const original = { ...crawlLogs };
const snapshotIds: string[] = [];
const now = new Date();
const scope = (t: Tenant) => ({ workspaceId: t.workspaceId, projectId: t.projectId });
const event = (changes: Record<string, unknown> = {}) => ({
  timestamp: now.toISOString(),
  host: 'acme.example',
  path: '/products/guide.pdf?secret=drop#fragment',
  method: 'GET',
  status: 200,
  user_agent: 'GPTBot/1.0 private-agent',
  client_ip: '192.0.2.2',
  ...changes,
});
async function setup(
  kind: 'custom' | 'upload' | 'cloudflare_worker' | 'cloudflare_logpush' = 'custom',
) {
  const tenant = await fixtures.tenant();
  const result = await createSource(db, scope(tenant), tenant.userId, {
    setup: kind,
    origin: 'https://acme.example',
    format: 'ndjson',
  });
  const source = await db
    .selectFrom('crawl_log_sources')
    .selectAll()
    .where('id', '=', result.id)
    .executeTakeFirstOrThrow();
  return { tenant, source, token: result.token! };
}
const body = (...rows: Record<string, unknown>[]) =>
  Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n'));
const send = (id: string, token: string, payload: Buffer, key = randomUUID()) =>
  app.request('/api/v1/crawl-logs/ingest/' + id, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/x-ndjson',
      'idempotency-key': key,
    },
    body: new Uint8Array(payload),
  });
beforeAll(() => {
  crawlLogs.ingestion_enabled = true;
});
afterAll(async () => {
  Object.assign(crawlLogs, original);
  await fixtures.cleanup();
  if (snapshotIds.length)
    await db.deleteFrom('bot_ip_range_snapshots').where('id', 'in', snapshotIds).execute();
  await db.destroy();
});

describe('bounded formats', () => {
  it('parses NDJSON, array and Combined while refusing CLF and missing identification fields', () => {
    const mapping = crawlLogs.presets.custom_ndjson!;
    expect(parseLogLine(JSON.stringify(event()), 'ndjson', mapping)?.path).toContain('/products/');
    expect(logLines(JSON.stringify([event(), event()]), 'json_array', 2)).toHaveLength(2);
    const line =
      '192.0.2.2 - - [03/Oct/2026:10:00:00 +0000] "GET /robots.txt HTTP/1.1" 403 10 "-" "GPTBot/1.0"';
    expect(parseLogLine(line, 'combined', mapping)).toMatchObject({
      timestamp: '2026-10-03T10:00:00+00:00',
      status: 403,
      user_agent: 'GPTBot/1.0',
    });
    expect(() =>
      parseLogLine(
        '192.0.2.2 - - [03/Oct/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 10',
        'combined',
        mapping,
      ),
    ).toThrow(UnsupportedLogFormat);
    expect(() => parseLogLine('{"path":"/"}', 'ndjson', mapping)).toThrow(UnsupportedLogFormat);
    expect(() => logLines('a\nb', 'ndjson', 1)).toThrow(RangeError);
    expect(() =>
      decodedBody(gzipSync(Buffer.alloc(crawlLogs.max_batch_bytes + 1)), 'gzip'),
    ).toThrow(/too large/);
    expect(() => decodedBody(Buffer.from([255]), undefined)).toThrow(/UTF-8/);
  });
});
describe('sanitized durable admission', () => {
  it('retains unsupported diagnostics and accepts Logpush validation without claiming coverage', async () => {
    const custom = await setup();
    const invalid = Buffer.from('{"path":"/without-identification"}');
    await expect(ingest(db, custom.source, invalid, {})).rejects.toThrow(/crawler identification/);
    const saved = await db
      .selectFrom('crawl_log_batches')
      .selectAll()
      .where('source_id', '=', custom.source.id)
      .executeTakeFirstOrThrow();
    expect(saved).toMatchObject({
      status: 'unsupported_format',
      missing_fields: ['timestamp', 'user_agent'],
      heartbeat: false,
    });
    expect(saved.idempotency_key).toBe(createHash('sha256').update(invalid).digest('hex'));
    await expect(ingest(db, custom.source, invalid, {})).rejects.toThrow(/crawler identification/);
    expect(
      await db
        .selectFrom('crawl_log_batches')
        .select('id')
        .where('source_id', '=', custom.source.id)
        .execute(),
    ).toHaveLength(1);
    const cloudflare = await setup('cloudflare_logpush');
    const probe = await send(
      cloudflare.source.id,
      cloudflare.token,
      gzipSync(Buffer.from('{"content":"tests"}')),
    );
    expect(probe.status).toBe(202);
    await refreshCrawlLogs(db, scope(cloudflare.tenant));
    expect(await crawlSummary(db, scope(cloudflare.tenant))).toMatchObject({
      coverage: 'unknown',
      requests: null,
      connection: 'awaiting_data',
    });
    // Crawl admission has its own authenticated bound, above the ordinary API limit.
    const large = await send(
      custom.source.id,
      custom.token,
      body(event({ ignored: 'x'.repeat(3 * 1024 * 1024) })),
    );
    expect(large.status).toBe(202);
    expect(await large.json()).toMatchObject({ lines_rejected: 1, lines_matched: 0 });
  });
  it('discards unmatched/out-of-scope/bounded lines, retains public UUID identity and redacts secrets', async () => {
    const { tenant, source } = await setup();
    const a = randomUUID(),
      b = randomUUID();
    const receipt = await ingest(
      db,
      source,
      body(
        event({ user_agent: 'Mozilla/5.0' }),
        event({ host: 'other.example' }),
        event({ path: '/reset/very-private-token' }),
        event({ path: '/products/' + a }),
        event({ path: '/products/' + b }),
        event({ path: '/' + 'x'.repeat(crawlLogs.max_line_bytes) }),
        event({ timestamp: new Date(now.getTime() + 2 * 3600000).toISOString() }),
        event({ timestamp: new Date(now.getTime() - 81 * 86400000).toISOString() }),
      ),
      { now },
    );
    expect(receipt).toMatchObject({
      lines_matched: 3,
      lines_unmatched: 1,
      lines_out_of_scope: 1,
      lines_rejected: 3,
    });
    const rows = await db
      .selectFrom('bot_requests')
      .selectAll()
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    expect(rows.find((r) => r.identity === 'non_joinable')).toMatchObject({
      display_path: '/reset/[redacted]',
      url_hash: null,
      identity_reason: 'redacted_secret',
    });
    expect(new Set(rows.filter((r) => r.identity === 'exact').map((r) => r.url_hash)).size).toBe(2);
    const persisted = JSON.stringify(rows);
    for (const secret of ['192.0.2.2', 'very-private-token', 'private-agent', 'secret=drop'])
      expect(persisted).not.toContain(secret);
    const tasks = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ task_kind: 'crawl_log_rollup_refresh', status: 'queued' });
    expect(tasks[0]!.available_at.getTime()).toBeGreaterThan(now.getTime());
  });
  it('returns the original receipt for replay and deduplicates request IDs and byte-identical lines', async () => {
    const { tenant, source, token } = await setup();
    const key = randomUUID(),
      payload = body(
        event({ request_id: 'ray-123' }),
        event({ path: '/repeat' }),
        event({ path: '/repeat' }),
      );
    const first = await send(source.id, token, payload, key),
      second = await send(source.id, token, payload, key);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual(await first.json());
    const third = await ingest(db, source, payload, { key: randomUUID() });
    expect(third).toMatchObject({ lines_matched: 0, lines_duplicate: 3 });
    expect(
      await db
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(2);
  });
  it('refuses wrong, rotated and revoked tokens and never permits a token from another project', async () => {
    const a = await setup(),
      b = await setup();
    expect((await send(b.source.id, a.token, body(event()))).status).toBe(401);
    expect((await send(a.source.id, 'wrong', body(event()))).status).toBe(401);
    const rotated = await mutateSource(db, scope(a.tenant), a.tenant.userId, a.source.id, 'rotate');
    expect((await send(a.source.id, a.token, body(event()))).status).toBe(401);
    expect((await send(a.source.id, rotated.token!, body(event()))).status).toBe(202);
    await mutateSource(db, scope(a.tenant), a.tenant.userId, a.source.id, 'revoke');
    expect((await send(a.source.id, rotated.token!, body(event()))).status).toBe(409);
    expect(
      await db
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', b.tenant.workspaceId)
        .execute(),
    ).toHaveLength(0);
  });
  it('limits batches with Retry-After and rejects gzip bombs over HTTP', async () => {
    const a = await setup();
    const old = crawlLogs.batches_per_source_per_hour;
    crawlLogs.batches_per_source_per_hour = 1;
    try {
      expect((await send(a.source.id, a.token, Buffer.alloc(0))).status).toBe(202);
      const refused = await send(a.source.id, a.token, Buffer.alloc(0));
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      crawlLogs.batches_per_source_per_hour = old;
    }
    const b = await setup();
    const bomb = await app.request('/api/v1/crawl-logs/ingest/' + b.source.id, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + b.token, 'content-encoding': 'gzip' },
      body: new Uint8Array(gzipSync(Buffer.alloc(crawlLogs.max_batch_bytes + 1))),
    });
    expect(bomb.status).toBe(413);
  });
  it('requires Owner/Admin and workspace authorization for source mutations', async () => {
    const a = await setup(),
      b = await setup();
    const cookie =
      config.session.cookieName + '=' + (await sessionToken({ sub: b.tenant.userId, ver: 0 }));
    expect(
      (
        await app.request('/api/v1/projects/' + a.tenant.projectId + '/crawl-logs/sources', {
          headers: { cookie },
        })
      ).status,
    ).toBe(404);
    const member = await fixtures.user();
    await fixtures.member(a.tenant.workspaceId, member, 'member');
    const memberCookie =
      config.session.cookieName + '=' + (await sessionToken({ sub: member, ver: 0 }));
    expect(
      (
        await app.request(
          '/api/v1/projects/' +
            a.tenant.projectId +
            '/crawl-logs/sources/' +
            a.source.id +
            '/rotate',
          { method: 'POST', headers: { cookie: memberCookie } },
        )
      ).status,
    ).toBe(403);
    await expect(
      createSource(db, scope(a.tenant), a.tenant.userId, {
        setup: 'custom',
        origin: 'https://acme.example',
        format: 'ndjson',
      }),
    ).rejects.toThrow(/active webhook/);
  });
});
describe('verification vocabulary', () => {
  it('records every reason and both verification bases using IPv4 and IPv6 ranges', () => {
    const bot = crawlers.bots.find((b) => b.bot_id === 'openai_gptbot')!;
    const snapshot = {
      id: randomUUID(),
      bot_id: bot.bot_id,
      cidrs: ['192.0.2.0/24', '2001:db8::/32'],
      content_hash: 'test',
      source_url: 'https://example.test',
      fetched_at: now,
      status: 'succeeded',
    };
    expect(verifyBot(bot, null, snapshot, now, now).verification_reason).toBe('missing_ip');
    expect(
      verifyBot({ ...bot, verification: { method: 'none' } }, '192.0.2.1', undefined, now, now)
        .verification_reason,
    ).toBe('no_published_ranges');
    expect(verifyBot(bot, '192.0.2.1', undefined, now, now).verification_reason).toBe(
      'no_snapshot',
    );
    expect(
      verifyBot(
        bot,
        '192.0.2.1',
        { ...snapshot, fetched_at: new Date(now.getTime() - 73 * 3600000) },
        now,
        now,
      ).verification_reason,
    ).toBe('stale_snapshot');
    expect(verifyBot(bot, '203.0.113.1', snapshot, now, now)).toMatchObject({
      verification: 'failed_verification',
      verification_reason: 'ip_outside_ranges',
    });
    expect(verifyBot(bot, '192.0.2.1', snapshot, now, now)).toMatchObject({
      verification: 'verified',
      verification_basis: 'contemporaneous',
    });
    expect(
      verifyBot(bot, '2001:db8::1', snapshot, new Date(now.getTime() - 48 * 3600000), now),
    ).toMatchObject({ verification: 'verified', verification_basis: 'later_snapshot' });
  });
});
describe('uploads, coverage and serialized recomputation', () => {
  it('a completed zero-match file scan excludes a different source on its reporting day', async () => {
    const { tenant, source } = await setup('upload');
    const upload = await createUpload(
      db,
      scope(tenant),
      source.id,
      { filename: 'zero.log', size_bytes: 100 },
      tenant.userId,
    );
    const day = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    await completeUpload(
      db,
      scope(tenant),
      source.id,
      upload.id,
      {
        scanned_lines: 2,
        first_line_at: day + 'T00:00:00Z',
        last_line_at: day + 'T23:59:59Z',
        scanned_dates: [{ date: day, complete: true }],
      },
      tenant.userId,
    );
    await refreshCrawlLogs(db, scope(tenant));
    expect(await crawlSummary(db, scope(tenant), { start_date: day, end_date: day })).toMatchObject(
      {
        connection: 'connected',
        coverage: 'declared_complete',
        requests: 0,
      },
    );
    const live = await createSource(db, scope(tenant), tenant.userId, {
      setup: 'custom',
      origin: source.origin,
      format: 'ndjson',
    });
    const liveSource = await db
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('id', '=', live.id)
      .executeTakeFirstOrThrow();
    const receipt = await ingest(
      db,
      liveSource,
      body(event({ timestamp: day + 'T12:00:00Z' })),
      {},
    );
    expect(receipt).toMatchObject({ lines_matched: 0, lines_overlapping: 1 });
    expect(
      await db
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(0);
  });
  it('resumes/replays batches, re-filters client evidence and records a zero-match client scan', async () => {
    const { tenant, source } = await setup('upload');
    const upload = await createUpload(
      db,
      scope(tenant),
      source.id,
      { filename: 'logs.json', size_bytes: 100 },
      tenant.userId,
    );
    const options = { uploadId: upload.id, seq: 0, key: upload.id + ':0' };
    const first = await ingest(db, source, body(event({ user_agent: 'unmatched' })), options);
    expect(first.lines_unmatched).toBe(1);
    expect((await ingest(db, source, body(event({ user_agent: 'unmatched' })), options)).id).toBe(
      first.id,
    );
    const day = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    await completeUpload(
      db,
      scope(tenant),
      source.id,
      upload.id,
      {
        scanned_lines: 100,
        first_line_at: day + 'T00:00:00Z',
        last_line_at: day + 'T23:59:59Z',
        scanned_dates: [{ date: day, complete: true }],
      },
      tenant.userId,
    );
    await refreshCrawlLogs(db, scope(tenant));
    const coverage = await db
      .selectFrom('crawl_log_coverage_daily')
      .select(['coverage', 'reason'])
      .where('source_id', '=', source.id)
      .where('reporting_date', '=', new Date(day + 'T00:00:00Z'))
      .executeTakeFirstOrThrow();
    expect(coverage).toEqual({ coverage: 'declared_complete', reason: 'client_reported' });
    expect(
      (
        await db
          .selectFrom('crawl_log_uploads')
          .select('last_ack_seq')
          .where('id', '=', upload.id)
          .executeTakeFirstOrThrow()
      ).last_ack_seq,
    ).toBe(0);
  });
  it('counts cross-source overlap, preserves request-ID uniqueness and abandons stale open uploads', async () => {
    const { tenant, source } = await setup();
    expect(await ingest(db, source, body(event({ request_id: 'shared-ray' })), {})).toMatchObject({
      lines_received: 1,
      lines_parsed: 1,
      lines_matched: 1,
      lines_rejected: 0,
      lines_unmatched: 0,
      lines_out_of_scope: 0,
      lines_overlapping: 0,
      lines_duplicate: 0,
    });
    const result = await createSource(db, scope(tenant), tenant.userId, {
      setup: 'upload',
      origin: 'https://acme.example',
      format: 'ndjson',
    });
    const uploadSource = await db
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('id', '=', result.id)
      .executeTakeFirstOrThrow();
    const upload = await createUpload(
      db,
      scope(tenant),
      result.id,
      { filename: 'backfill', size_bytes: 100 },
      tenant.userId,
    );
    const receipt = await ingest(
      db,
      uploadSource,
      body(event({ request_id: 'shared-ray' }), event({ path: '/overlap' })),
      { uploadId: upload.id, seq: 0, key: upload.id + ':0' },
    );
    expect(receipt.lines_overlapping).toBe(2);
    expect(
      await db
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(1);
    expect(
      (await ingest(db, source, body(event({ path: '/after-rejected-overlap' })), {}))
        .lines_matched,
    ).toBe(1);
    await db
      .updateTable('crawl_log_uploads')
      .set({ updated_at: new Date(now.getTime() - 25 * 3600000) })
      .where('id', '=', upload.id)
      .execute();
    expect(await abandonUploads(db, tenant.workspaceId, now)).toBe(1);
    expect(
      (
        await db
          .selectFrom('crawl_log_uploads')
          .select('status')
          .where('id', '=', upload.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('abandoned');
  });
  it('two concurrent refreshes converge, new receipts coalesce and Worker coverage stays partial', async () => {
    const { tenant, source } = await setup('cloudflare_worker');
    await ingest(db, source, body(event()), { key: 'first' });
    await ingest(db, source, body(event({ path: '/second' })), { key: 'second' });
    await Promise.all([refreshCrawlLogs(db, scope(tenant)), refreshCrawlLogs(db, scope(tenant))]);
    const total = await db
      .selectFrom('bot_activity_daily')
      .select(sql<number>`sum(requests)::integer`.as('requests'))
      .where('workspace_id', '=', tenant.workspaceId)
      .executeTakeFirstOrThrow();
    expect(total.requests).toBe(2);
    const day = await db
      .selectFrom('crawl_log_coverage_daily')
      .selectAll()
      .where('source_id', '=', source.id)
      .where('batch_count', '>', 0)
      .executeTakeFirstOrThrow();
    expect(day).toMatchObject({ coverage: 'partial', reason: 'best_effort_worker' });
    expect(
      await db
        .selectFrom('analytics_tasks')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(1);
  });
  it('freezes old rollups even after raw retention deletes their requests', async () => {
    const { tenant, source } = await setup();
    await ingest(db, source, body(event()), {});
    await refreshCrawlLogs(db, scope(tenant), now);
    const future = new Date(now.getTime() + 100 * 86400000);
    await db.deleteFrom('bot_requests').where('workspace_id', '=', tenant.workspaceId).execute();
    await refreshCrawlLogs(db, scope(tenant), future);
    const total = await db
      .selectFrom('bot_activity_daily')
      .select(sql<number>`sum(requests)::integer`.as('requests'))
      .where('workspace_id', '=', tenant.workspaceId)
      .executeTakeFirstOrThrow();
    expect(total.requests).toBe(1);
  });
});

describe('persisted analytics and coverage decisions', () => {
  it('requires a whole unsampled day with bounded receipt gaps before showing measured zero', async () => {
    const { tenant, source } = await setup();
    const day = new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
      start = new Date(day + 'T00:00:00Z');
    await db
      .updateTable('crawl_log_sources')
      .set({ created_at: start })
      .where('id', '=', source.id)
      .execute();
    const seed = await ingest(db, source, Buffer.alloc(0), { now: start, key: 'heartbeat-seed' });
    const receipts = Array.from({ length: 287 }, (_, i) => ({
      ...seed,
      id: randomUUID(),
      idempotency_key: 'heartbeat-' + i,
      received_at: new Date(start.getTime() + (i + 1) * 5 * 60000),
    }));
    await db.insertInto('crawl_log_batches').values(receipts).execute();
    await refreshCrawlLogs(db, scope(tenant));
    const options = { start_date: day, end_date: day };
    expect(await crawlSummary(db, scope(tenant), options)).toMatchObject({
      coverage: 'complete',
      requests: 0,
      pages: 0,
      active_bots: 0,
    });
    await db
      .deleteFrom('crawl_log_batches')
      .where('workspace_id', '=', tenant.workspaceId)
      .where('idempotency_key', '=', 'heartbeat-20')
      .execute();
    await refreshCrawlLogs(db, scope(tenant));
    expect(await crawlSummary(db, scope(tenant), options)).toMatchObject({
      coverage: 'partial',
      requests: null,
      pages: null,
      active_bots: null,
    });
  });
  it('applies verification to all denominators and binds activity cursors to scope and filters', async () => {
    const { tenant, source } = await setup(),
      id = randomUUID();
    snapshotIds.push(id);
    await db
      .insertInto('bot_ip_range_snapshots')
      .values({
        id,
        bot_id: 'openai_gptbot',
        source_url: 'https://openai.com/gptbot.json',
        fetched_at: now,
        content_hash: 'test',
        cidrs: '["192.0.2.0/24"]',
        status: 'succeeded',
      })
      .execute();
    await ingest(
      db,
      source,
      body(
        event({ path: '/verified', status: 200 }),
        event({ path: '/unverifiable', client_ip: null, status: 404 }),
        event({ path: '/spoofed', client_ip: '203.0.113.1', status: 403 }),
      ),
      {},
    );
    await refreshCrawlLogs(db, scope(tenant));
    expect(await crawlSummary(db, scope(tenant))).toMatchObject({
      requests: 2,
      pages: 2,
      active_bots: 1,
      error_share: 0.5,
      failed_verification_requests: 1,
    });
    expect(await crawlSummary(db, scope(tenant), { verification: 'verified' })).toMatchObject({
      requests: 1,
      pages: 1,
      active_bots: 1,
      error_share: null,
    });
    expect(
      (await crawlerPage(db, scope(tenant), { verification: 'failed_verification' })).items[0],
    ).toMatchObject({ requests: 1, pages: 1, status_codes: { '403': 1 } });
    const page = await activityPage(db, scope(tenant), { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.next_cursor).not.toBeNull();
    const next = await activityPage(db, scope(tenant), { limit: 1, cursor: page.next_cursor });
    expect(next.items[0]!.id).not.toBe(page.items[0]!.id);
    await expect(
      activityPage(db, scope(tenant), { limit: 1, cursor: page.next_cursor, status: 403 }),
    ).rejects.toThrow(/filters/);
    const other = await fixtures.tenant();
    await expect(
      activityPage(db, scope(other), { limit: 1, cursor: page.next_cursor }),
    ).rejects.toThrow(/filters/);
    const principal = {
      kind: 'member' as const,
      userId: tenant.userId,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
    };
    const mcp = await dispatchTool(
      db,
      principal,
      'read_crawl_logs',
      { project_id: tenant.projectId, view: 'summary', verification: 'verified' },
      'https://citeladder.test',
    );
    expect(mcp).toMatchObject({ requests: 1, pages: 1, unit: 'requests' });
    await expect(
      dispatchTool(
        db,
        principal,
        'list_bot_requests',
        { project_id: other.projectId },
        'https://citeladder.test',
      ),
    ).rejects.toThrow();
    const cookie =
      config.session.cookieName + '=' + (await sessionToken({ sub: tenant.userId, ver: 0 }));
    const exported = await app.request(
      '/api/v1/projects/' + tenant.projectId + '/ai-traffic/activity/export?status=404',
      { headers: { cookie } },
    );
    expect(exported.status).toBe(200);
    const csv = await exported.text();
    expect(csv).toContain('/unverifiable');
    expect(csv).not.toContain('/verified');
    expect(csv).not.toContain('203.0.113.1');
  });
});

describe('bounded maintenance', () => {
  it('deletes expired raw requests while retaining receipts and projections', async () => {
    const { tenant, source } = await setup();
    await ingest(db, source, body(event()), {});
    await refreshCrawlLogs(db, scope(tenant));
    await db
      .updateTable('bot_requests')
      .set({ occurred_at: new Date(Date.now() - 91 * 86400000) })
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
    const task = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('workspace_id', '=', tenant.workspaceId)
      .executeTakeFirstOrThrow();
    await botRequestRetentionSweep(task, { db, maxAttempts: 3, checkCancelled: async () => {} });
    expect(
      await db
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(0);
    expect(
      await db
        .selectFrom('crawl_log_batches')
        .select('id')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom('bot_activity_daily')
        .select('requests')
        .where('workspace_id', '=', tenant.workspaceId)
        .execute(),
    ).toMatchObject([{ requests: 1 }]);
  });
  it('appends successful and failed IP snapshots through fenced settlement without live I/O', async () => {
    const { tenant, source } = await setup();
    await ingest(db, source, Buffer.alloc(0), {});
    const row = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('workspace_id', '=', tenant.workspaceId)
      .executeTakeFirstOrThrow();
    const task = { ...row, payload: { bot_id: 'openai_gptbot' } };
    for (const success of [true, false]) {
      const execute = botIpRangeRefresh(async () => ({
        url: 'https://openai.com/gptbot.json',
        status: success ? 200 : 503,
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ prefixes: [{ ipv4Prefix: '192.0.2.0/24' }] })),
      }));
      const result = await execute(task, { db, maxAttempts: 3, checkCancelled: async () => {} });
      if (!result) throw new Error('Snapshot settlement absent');
      await db.transaction().execute(result.persist);
    }
    const snapshots = await db
      .selectFrom('bot_ip_range_snapshots')
      .selectAll()
      .where('bot_id', '=', 'openai_gptbot')
      .execute();
    snapshotIds.push(...snapshots.filter((s) => !snapshotIds.includes(s.id)).map((s) => s.id));
    expect(
      snapshots.some(
        (s) =>
          s.status === 'succeeded' && Array.isArray(s.cidrs) && s.cidrs.includes('192.0.2.0/24'),
      ),
    ).toBe(true);
    expect(
      snapshots.some(
        (s) => s.status === 'failed' && Array.isArray(s.cidrs) && s.cidrs.length === 0,
      ),
    ).toBe(true);
  });
});
