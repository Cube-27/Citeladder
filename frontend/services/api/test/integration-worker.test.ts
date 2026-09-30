import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationClient } from '../src/integrations/client.ts';
import { IntegrationError } from '../src/integrations/client.ts';
import { integrationPolicy, integrationSettings } from '../src/integrations/config.ts';
import { IntegrationWorker } from '../src/workers/integration-worker.ts';
import { seedProject } from './referral-fixtures.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
const settings = { ...integrationSettings({}), sync_page_size: 2 };
let ownerId: string;

beforeAll(async () => {
  ownerId = await fixtures.user();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

describe('integration worker paging and resume', () => {
  it('continues after a committed provider page when a later request fails', async () => {
    const recordedPage = async (name: string): Promise<Record<string, unknown>> =>
      JSON.parse(
        await readFile(
          new URL(`../../../backend/tests/fixtures/integrations/${name}`, import.meta.url),
          'utf8',
        ),
      ) as Record<string, unknown>;
    const pageOne = await recordedPage('gsc_search_analytics_page1.json');
    const pageTwo = await recordedPage('gsc_search_analytics_page2.json');
    const workspaceId = await fixtures.ownedWorkspace(ownerId);
    const projectId = await seedProject(db, workspaceId);
    const grantId = randomUUID();
    const connectionId = randomUUID();
    const mappingId = randomUUID();
    const runId = randomUUID();
    const now = new Date();
    await db
      .insertInto('integration_oauth_grants')
      .values({
        id: grantId,
        workspace_id: workspaceId,
        transport: 'google_oauth',
        access_token_encrypted: 'recorded-access-token',
        refresh_token_encrypted: 'recorded-refresh-token',
        token_expires_at: new Date(Date.now() + 3_600_000),
        token_revision: 1,
        refresh_claim_id: null,
        refresh_claim_expires_at: null,
        granted_scopes: JSON.stringify(['https://www.googleapis.com/auth/webmasters.readonly']),
        status: 'connected',
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto('integration_connections')
      .values({
        id: connectionId,
        workspace_id: workspaceId,
        grant_id: grantId,
        provider: 'gsc',
        label: 'Recorded Search Console',
        account_ref: 'https://example.test',
        dataset_capabilities: JSON.stringify({}),
        last_synced_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto('integration_property_mappings')
      .values({
        id: mappingId,
        workspace_id: workspaceId,
        connection_id: connectionId,
        provider: 'gsc',
        property_ref: 'https://example.test',
        project_id: projectId,
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .execute();
    await db
      .insertInto('integration_sync_runs')
      .values({
        id: runId,
        workspace_id: workspaceId,
        connection_id: connectionId,
        mapping_id: mappingId,
        property_ref: 'https://example.test',
        project_id: projectId,
        sync_kind: 'on_demand',
        window_start: new Date('2026-07-20T00:00:00Z'),
        window_end: new Date('2026-07-21T00:00:00Z'),
        resync_seq: 1,
        idempotency_key: `sync-test:${runId}`,
        status: 'queued',
        priority: 0,
        randomized_position: 0,
        available_at: now,
        attempt_count: 0,
        max_attempts: 4,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        error_code: '',
        error_detail: '',
        created_at: now,
        updated_at: now,
        completed_at: null,
      })
      .execute();

    const firstDataset = Object.values(integrationPolicy.datasets).find(
      (item) => item.dataset === 'gsc_page_daily',
    );
    if (!firstDataset) throw new Error('GSC page dataset policy is missing');
    let interrupted = false;
    const offsets: number[] = [];
    const client: Pick<IntegrationClient, 'page'> = {
      async page(_provider, _token, _property, template, _start, _end, offset) {
        if (template.dataset !== firstDataset.dataset)
          return { payload: { rows: [] }, rawRowCount: 0 };
        offsets.push(offset);
        if (offset === 2 && !interrupted) {
          interrupted = true;
          throw new IntegrationError('provider_api_error', 'recorded page interruption', true);
        }
        const payload = offset === 0 ? pageOne : pageTwo;
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        return { payload, rawRowCount: rows.length };
      },
    };
    const worker = new IntegrationWorker(db, client, settings, async () => 'recorded-access-token');

    expect(await worker.runOnce()).toBe(true);
    const firstAttempt = await db
      .selectFrom('integration_sync_runs')
      .select(['status', 'attempt_count'])
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(firstAttempt.status).toBe('retry_wait');
    expect(firstAttempt.attempt_count).toBe(1);
    const committed = await db
      .selectFrom('integration_import_artifacts')
      .select(['query_snapshot', 'row_count'])
      .where('sync_run_id', '=', runId)
      .where('dataset', '=', firstDataset.dataset)
      .executeTakeFirstOrThrow();
    expect(committed.row_count).toBe(2);
    expect((committed.query_snapshot as { page_offset: number }).page_offset).toBe(0);

    await db
      .updateTable('integration_sync_runs')
      .set({ available_at: new Date(Date.now() - 1000) })
      .where('id', '=', runId)
      .execute();
    expect(await worker.runOnce()).toBe(true);
    const finished = await db
      .selectFrom('integration_sync_runs')
      .select('status')
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(finished.status).toBe('succeeded');
    expect(offsets).toEqual([0, 2, 2]);
    const pages = await db
      .selectFrom('integration_import_artifacts')
      .select(['query_snapshot', 'row_count'])
      .where('sync_run_id', '=', runId)
      .where('dataset', '=', firstDataset.dataset)
      .execute();
    const pageSummary = pages
      .map((page) => ({
        offset: (page.query_snapshot as { page_offset: number }).page_offset,
        rowCount: page.row_count,
      }))
      .sort((left, right) => left.offset - right.offset);
    expect(pageSummary).toEqual([
      { offset: 0, rowCount: 2 },
      { offset: 2, rowCount: 1 },
    ]);
    const metrics = await db
      .selectFrom('integration_metric_rows as metric')
      .innerJoin(
        'integration_import_artifacts as artifact',
        'artifact.id',
        'metric.source_artifact_id',
      )
      .select(['metric.source_artifact_id'])
      .where('artifact.sync_run_id', '=', runId)
      .where('artifact.dataset', '=', firstDataset.dataset)
      .execute();
    expect(metrics).toHaveLength(3);
  });
});
