/** Scoped citation inventory and selected organic-result candidates; no provider I/O. */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { citationIdentity } from '../site-health/url-identity.ts';
import { urlFormat } from './assessment.ts';
import type { SourceScope } from './admission.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { fenceInspectionTask } from './task-fence.ts';
import { compareText } from '../text-order.ts';

type OrganicResult = { url: string; title: string; rank: number };
/** One organic SERP item with a public page identity and a valid rank, or null. */
function organicRow(raw: unknown, fallbackRank: number): OrganicResult | null {
  const item = record(raw);
  if (item.type !== 'organic' || typeof item.url !== 'string') return null;
  const rank = item.rank_absolute ?? item.rank_group ?? fallbackRank;
  if (typeof rank !== 'number' || !Number.isSafeInteger(rank) || rank < 1) return null;
  if (!citationIdentity(item.url)) return null;
  const title = typeof item.title === 'string' ? item.title.slice(0, 1000) : '';
  return { url: item.url, title, rank };
}
export function organicResults(payload: unknown) {
  const results = record(payload).result;
  const rows: OrganicResult[] = [];
  const seen = new Set<string>();
  for (const result of Array.isArray(results) ? results : []) {
    const items = record(result).items;
    for (const raw of Array.isArray(items) ? items : []) {
      const url = record(raw).url;
      if (typeof url === 'string' && seen.has(url)) continue;
      const row = organicRow(raw, rows.length + 1);
      if (!row) continue;
      seen.add(row.url);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.rank - b.rank || compareText(a.url, b.url));
}
type PageInput = {
  url: string;
  hash: string;
  domain: string;
  answers: number;
  sourceClass?: string | null;
  taxonomy?: string | null;
};
async function upsertPage(
  db: Database,
  scope: SourceScope,
  auditId: string,
  input: PageInput,
  now: Date,
  citation: boolean,
) {
  const format = urlFormat(input.url);
  const weak = sql<boolean>`source_pages.page_format_method is null or source_pages.page_format_method in ('none', 'url_pattern')`;
  const row = await db
    .insertInto('source_pages')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      url_hash: input.hash,
      canonical_url: input.url,
      registrable_domain: input.domain,
      source_class: input.sourceClass ?? null,
      source_taxonomy_version: input.taxonomy ?? null,
      recurrence_count: input.answers,
      inspection_state: 'not_inspected',
      page_format: format.format,
      page_format_method: format.method,
      page_format_version: policy.source_pages.format_version,
      inspector_version: policy.source_pages.inspector_version,
      first_seen_audit_id: auditId,
      last_seen_audit_id: citation ? auditId : null,
      last_cited_at: citation ? now : null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(['project_id', 'url_hash']).doUpdateSet({
        updated_at: now,
        ...(citation
          ? {
              recurrence_count: sql<number>`case when source_pages.last_seen_audit_id is distinct from ${auditId}::uuid
        then source_pages.recurrence_count + ${input.answers} else source_pages.recurrence_count end`,
              last_cited_at: now,
              last_seen_audit_id: auditId,
              source_class: input.sourceClass ?? null,
              source_taxonomy_version: input.taxonomy ?? null,
              page_format: sql<string>`case when ${weak} then ${format.format} else source_pages.page_format end`,
              page_format_method: sql<string>`case when ${weak} then ${format.method} else source_pages.page_format_method end`,
              page_format_version: sql<string>`case when ${weak} then ${policy.source_pages.format_version} else source_pages.page_format_version end`,
            }
          : {}),
      }),
    )
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
export async function syncPages(
  db: Database,
  scope: SourceScope,
  auditId: string,
  now = new Date(),
  task?: QueueTask,
) {
  return db.transaction().execute(async (trx) => {
    await fenceInspectionTask(trx, task);
    const audit = await trx
      .selectFrom('audits')
      .select('id')
      .where('id', '=', auditId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .executeTakeFirst();
    if (!audit) throw new Error('Source-page audit is outside its project');
    await acquireProjectLock(trx, scope.projectId);
    const rows = await trx
      .selectFrom('citations')
      .select([
        'url_hash',
        sql<string>`min(canonical_url)`.as('url'),
        sql<string>`min(domain)`.as('domain'),
        sql<string | null>`min(source_class)`.as('sourceClass'),
        sql<string | null>`min(source_taxonomy_version)`.as('taxonomy'),
        sql<string>`count(distinct analysis_id)`.as('answers'),
      ])
      .where('workspace_id', '=', scope.workspaceId)
      .where('audit_id', '=', auditId)
      .where('url_hash', 'is not', null)
      .where('is_owned', '=', false)
      .groupBy('url_hash')
      .execute();
    for (const row of rows)
      await upsertPage(
        trx,
        scope,
        auditId,
        { ...row, hash: row.url_hash!, answers: Number(row.answers) },
        now,
        true,
      );
    await trx
      .updateTable('source_pages')
      .set({ inspection_state: 'stale', updated_at: now })
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('inspection_state', '=', 'inspected')
      .where(
        'last_inspected_at',
        '<',
        new Date(now.getTime() - policy.source_pages.stale_after_hours * 3_600_000),
      )
      .execute();
    await syncOrganicPages(trx, scope, auditId, now);
    const unresolved = await trx
      .selectFrom('citations')
      .select(['url', 'domain'])
      .distinct()
      .where('workspace_id', '=', scope.workspaceId)
      .where('audit_id', '=', auditId)
      .where('url_identity_method', '=', 'unresolved')
      .where('is_owned', '=', false)
      .orderBy('domain')
      .orderBy('url')
      .execute();
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    return unresolved.flatMap((row) => {
      const count = counts.get(row.domain) ?? 0;
      if (seen.has(row.url) || count >= policy.source_pages.max_redirects_per_domain) return [];
      counts.set(row.domain, count + 1);
      seen.add(row.url);
      return [row.url];
    });
  });
}
async function syncOrganicPages(db: Database, scope: SourceScope, auditId: string, now: Date) {
  const rows = await db
    .selectFrom('raw_response_artifacts as artifact')
    .innerJoin('audit_tasks as task', 'task.id', 'artifact.task_id')
    .select([
      'artifact.provider_metadata',
      'artifact.created_at',
      'task.id',
      'task.prompt_text',
      'task.logical_engine',
      'task.request_snapshot',
    ])
    .where('task.workspace_id', '=', scope.workspaceId)
    .where('task.project_id', '=', scope.projectId)
    .where('artifact.audit_id', '=', auditId)
    .where('artifact.transport_provider', '=', 'dataforseo')
    .orderBy('artifact.created_at')
    .orderBy('artifact.id')
    .execute();
  for (const row of rows) {
    const selected = new Set<string>();
    for (const result of organicResults(row.provider_metadata)) {
      const identity = citationIdentity(result.url)!;
      if (selected.has(identity.hash)) continue;
      selected.add(identity.hash);
      const pageId = await upsertPage(db, scope, auditId, { ...identity, answers: 0 }, now, false);
      await db
        .insertInto('content_differentiation_candidates')
        .values({
          id: randomUUID(),
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          audit_id: auditId,
          audit_task_id: row.id,
          source_page_id: pageId,
          query_text: row.prompt_text,
          rank: result.rank,
          result_title: result.title,
          created_at: now,
          search_context: JSON.stringify({
            logical_engine: row.logical_engine,
            provider: 'dataforseo',
            observed_at: row.created_at.toISOString(),
            request: record(row.request_snapshot),
          }),
        })
        .onConflict((oc) => oc.columns(['audit_task_id', 'source_page_id']).doNothing())
        .execute();
      if (selected.size >= policy.content_differentiation.result_limit) break;
    }
  }
}
export async function resolveCitation(
  db: Database,
  scope: SourceScope,
  redirect: string,
  finalUrl: string,
  task?: QueueTask,
) {
  const identity = citationIdentity(finalUrl);
  if (!identity) return null;
  await db.transaction().execute(async (trx) => {
    await fenceInspectionTask(trx, task);
    await acquireProjectLock(trx, scope.projectId);
    await trx
      .updateTable('citations')
      .set({
        canonical_url: identity.url,
        resolved_url: finalUrl,
        url_hash: identity.hash,
        url_identity_method: 'unwrapped_redirect',
        url_identity_version: policy.source_pages.identity_version,
      })
      .where('workspace_id', '=', scope.workspaceId)
      .where('url', '=', redirect)
      .where('url_identity_method', '=', 'unresolved')
      .where(
        'audit_id',
        'in',
        trx
          .selectFrom('audits')
          .select('id')
          .where('workspace_id', '=', scope.workspaceId)
          .where('project_id', '=', scope.projectId),
      )
      .execute();
  });
  return identity;
}
