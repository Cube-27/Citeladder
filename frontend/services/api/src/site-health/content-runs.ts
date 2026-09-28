import { randomUUID } from 'node:crypto';
import { contentStructureSchema, type ContentStructure } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { ApiError } from '../errors.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import { effectiveStatus } from '../opportunities/action-status.ts';
import { linkCandidates, topicCandidates } from './content-candidates.ts';
import { loadContentPages, type ContentScope } from './content-evidence.ts';
import { contentRequest } from './content-requests.ts';

export async function latestContentCrawl(db: Database, scope: ContentScope) {
  return db
    .selectFrom('site_crawls')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('completed_at', 'is not', null)
    .orderBy('completed_at', 'desc')
    .executeTakeFirst();
}

export async function contentRun(db: Database, scope: ContentScope, id?: string) {
  let query = db
    .selectFrom('site_content_structure_runs')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId);
  if (id) query = query.where('id', '=', id);
  const row = await query.orderBy('created_at', 'desc').executeTakeFirst();
  if (id && !row) throw new ApiError(404, 'Content analysis not found');
  const crawl = await latestContentCrawl(db, scope);
  const savedRuns = await db
    .selectFrom('site_content_structure_runs')
    .select(['id', 'created_at', 'state'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .limit(policy.content_structure.history_limit)
    .execute();
  const history = savedRuns.map((run) => ({
    ...run,
    state: contentStructureSchema.shape.state.parse(run.state),
    created_at: run.created_at.toISOString(),
  }));
  if (!row)
    return {
      history,
      analysis: null,
      crawl_id: crawl?.id ?? null,
      availability: crawl ? ('ready' as const) : ('crawl_required' as const),
    };
  const manifest = record(row.manifest);
  const analysis = row.result
    ? contentStructureSchema.parse(row.result)
    : contentStructureSchema.parse({
        id: row.id,
        crawl_id: row.crawl_id,
        created_at: row.created_at.toISOString(),
        state: row.state,
        page_count: manifest.page_count,
        omitted_pages: manifest.omitted_pages,
        omitted_candidates: manifest.omitted_candidates,
        unassigned_pages: 0,
        unavailable_judgments: 0,
        stale: false,
        recommendations: [],
        topics: [],
        pages: [],
      });
  analysis.stale = crawl?.id !== row.crawl_id;
  if (analysis.recommendations.length) {
    const actions = await db
      .selectFrom('actions')
      .select(['id', 'target_url', effectiveStatus().as('status')])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('target_url', 'in', [
        ...new Set(analysis.recommendations.map((link) => link.source.url)),
      ])
      .where('evidence_cleared_at', 'is', null)
      .execute();
    for (const link of analysis.recommendations) {
      const action = actions.find((item) => item.target_url === link.source.url);
      link.action_id = action?.id ?? null;
      link.action_status = action?.status ?? null;
    }
  }
  if (row.state === 'cancelled') analysis.state = 'cancelled';
  return {
    history,
    analysis,
    crawl_id: crawl?.id ?? null,
    availability: crawl ? ('ready' as const) : ('crawl_required' as const),
  };
}

export async function admitContentRun(
  db: Database,
  scope: ContentScope,
  actorId: string,
  input: { crawl_id: string; idempotency_key: string },
) {
  const id = await db.transaction().execute(async (trx) => {
    // Serialize admission for this project, including concurrent idempotent requests.
    await trx
      .selectFrom('projects')
      .select('id')
      .where('id', '=', scope.projectId)
      .where('workspace_id', '=', scope.workspaceId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const previous = await trx
      .selectFrom('site_content_structure_runs')
      .select(['id', 'crawl_id'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('idempotency_key', '=', input.idempotency_key)
      .executeTakeFirst();
    if (previous) {
      if (previous.crawl_id !== input.crawl_id)
        throw new ApiError(409, 'Request key already used for another crawl');
      return previous.id;
    }
    const active = await trx
      .selectFrom('site_content_structure_runs')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('state', 'in', ['queued', 'running'])
      .executeTakeFirst();
    if (active) throw new ApiError(409, 'A content analysis is already running');
    const crawl = await trx
      .selectFrom('site_crawls')
      .select('id')
      .where('id', '=', input.crawl_id)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('completed_at', 'is not', null)
      .executeTakeFirst();
    if (!crawl) throw new ApiError(404, 'Completed crawl not found');
    const { pages, omittedPages, omittedPassages } = await loadContentPages(trx, scope, crawl.id);
    if (!pages.length) throw new ApiError(409, 'Run a fresh crawl to capture content passages');
    const links = linkCandidates(pages);
    const topics = topicCandidates(pages);
    const candidates = [...links.candidates, ...topics.candidates].map((candidate) => ({
      ...candidate,
      request: contentRequest(candidate, pages),
    }));
    const runId = randomUUID();
    await trx
      .insertInto('site_content_structure_runs')
      .values({
        id: runId,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        crawl_id: crawl.id,
        actor_id: actorId,
        idempotency_key: input.idempotency_key,
        state: 'queued',
        policy_version: policy.content_structure.version,
        created_at: new Date(),
        manifest: JSON.stringify({
          pages,
          candidates,
          page_count: pages.length,
          omitted_pages: omittedPages,
          omitted_passages: omittedPassages,
          omitted_candidates: links.omitted + topics.omitted,
          policy: policy.content_structure,
        }),
      })
      .execute();
    await enqueueTask(trx, {
      ...scope,
      kind: 'content_structure_judgment',
      payload: { run_id: runId },
      keyParts: [runId],
      maxAttempts: 2,
    });
    return runId;
  });
  return contentRun(db, scope, id);
}

export async function cancelContentRun(db: Database, scope: ContentScope, id: string) {
  await contentRun(db, scope, id);
  await db
    .updateTable('site_content_structure_runs')
    .set({ state: 'cancelled' })
    .where('id', '=', id)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('state', 'in', ['queued', 'running'])
    .execute();
  return contentRun(db, scope, id);
}

export function pageSummary(page: ContentStructure['pages'][number] & { passages?: unknown }) {
  const { passages: _passages, ...summary } = page;
  return summary;
}
