import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  performanceDashboardSchema,
  performanceTablePageSchema,
  performanceRangeTaskSchema,
} from '@citeladder/contracts/performance';
import {
  demandSnapshot,
  queryPageResponse,
  classificationResponse,
  recomputeResponse,
} from '../src/routes/demand-contracts.ts';
import type { Database } from '../src/db/database.ts';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { enqueue, seedImport, seedProject, type ImportSeed } from './referral-fixtures.ts';
import { Fixtures, sessionToken, testConfig } from './support.ts';

type ResponseBody = z.infer<typeof performanceDashboardSchema> &
  Omit<z.infer<typeof performanceTablePageSchema>, 'items'> &
  z.infer<typeof performanceRangeTaskSchema> &
  Required<z.infer<typeof demandSnapshot>> &
  Omit<z.infer<typeof queryPageResponse>, 'items'> &
  z.infer<typeof classificationResponse> &
  z.infer<typeof recomputeResponse> & {
    items: (z.infer<typeof performanceTablePageSchema>['items'][number] &
      z.infer<typeof queryPageResponse>['items'][number])[];
    detail: string;
    error: { code: string; details: { errors: { loc: string[]; type: string }[] } };
  };

export async function tenant(db: Database, fixtures: Fixtures) {
  const userId = await fixtures.user();
  const workspaceId = await fixtures.ownedWorkspace(userId);
  const projectId = await seedProject(db, workspaceId);
  return { userId, workspaceId, projectId };
}
export type Tenant = Awaited<ReturnType<typeof tenant>>;
export const WINDOW: [string, string] = ['2026-07-01', '2026-07-28'];
export async function metric(
  db: Database,
  seed: ImportSeed,
  options: {
    dataset?: string;
    date?: string;
    values?: string[];
    metrics?: Record<string, unknown>;
    revision?: number;
    property?: string;
  },
) {
  const id = randomUUID(),
    day = options.date ?? WINDOW[1];
  await db
    .insertInto('integration_metric_rows')
    .values({
      id,
      workspace_id: seed.workspaceId,
      project_id: seed.projectId,
      property_ref: options.property ?? 'property',
      provider: 'gsc',
      dataset: options.dataset ?? seed.dataset,
      date: day,
      dimension_key: (options.values ?? [day]).join(policy.traffic.dimension_key_separator),
      metrics: JSON.stringify(options.metrics ?? { impressions: 100, clicks: 1, position: 8.25 }),
      source_artifact_id: seed.artifactId,
      resync_seq: options.revision ?? 0,
      importer_version: 'test-1',
      created_at: new Date(),
    })
    .execute();
  return id;
}
export async function importSeed(db: Database, t: Tenant, dataset = 'gsc_day_daily') {
  return seedImport(db, { ...t, dataset, window: WINDOW });
}
export async function task(db: Database, t: Tenant, kind: string, window = WINDOW) {
  const id = await enqueue(db, {
    ...t,
    kind,
    payload: { window_start: window[0], window_end: window[1] },
  });
  return db
    .selectFrom('analytics_tasks')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}
export function requests(db: Database, t: Tenant) {
  const config = testConfig(),
    app = createApp(config, db);
  return async (
    suffix: string,
    options: {
      method?: string;
      body?: unknown;
      rawBody?: string;
      workspace?: string;
      user?: string;
      project?: string;
      authenticated?: boolean;
    } = {},
  ) => {
    const token = await sessionToken({ sub: options.user ?? t.userId, ver: 0 });
    const headers: Record<string, string> = {
      'x-workspace-id': options.workspace ?? t.workspaceId,
    };
    if (options.authenticated !== false) headers.cookie = `${config.session.cookieName}=${token}`;
    const body =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await app.request(
      `/api/v1/projects/${options.project ?? t.projectId}/${suffix}`,
      {
        method: options.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
      },
    );
    return { response, body: (await response.json()) as ResponseBody };
  };
}
