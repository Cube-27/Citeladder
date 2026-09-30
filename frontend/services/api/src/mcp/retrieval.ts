import { sql, type Selectable } from 'kysely';
import { z } from 'zod';

import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import type { DB } from '../generated/db-schema.ts';
import { parseUuid } from '../http/uuid.ts';
import { effectiveStatus } from '../opportunities/action-status.ts';
import { getExecutionEvidence } from '../visibility/execution.ts';
import { authorizedWorkspaceIds, authorizeProject } from './data.ts';
import { projectBusinessContext } from './evidence.ts';
import { mcpPolicy } from './config.ts';
import type { Evidence, McpPrincipal } from './types.ts';

type Descriptor = { table: keyof DB; columns: readonly string[]; title: string };
function descriptor<T extends keyof DB>(
  table: T,
  title: string,
  columns: readonly (keyof Selectable<DB[T]> & string)[],
): Descriptor {
  return { table, columns, title };
}
// Only these persisted projections can be fetched. No provider transports or
// credentials enter a retrieval document, even if the owning table grows.
const records = {
  opportunity: descriptor('opportunities', 'Opportunity', [
    'id',
    'project_id',
    'title',
    'remediation',
    'severity',
    'priority_score',
    'target_url',
    'evidence',
    'analyzer_version',
    'rule_version',
    'formula_version',
    'action_id',
    'created_at',
  ]),
  site_snapshot: descriptor('site_health_snapshots', 'Site Snapshot', [
    'id',
    'project_id',
    'crawl_id',
    'web_fundamentals_score',
    'aeo_readiness_score',
    'coverage_evidence',
    'coverage_state',
    'status_counts',
    'top_issues',
    'created_at',
  ]),
  site_crawl: descriptor('site_crawls', 'Site Crawl', [
    'id',
    'project_id',
    'status',
    'discovery_status',
    'analysis_status',
    'root_url',
    'admitted_url_count',
    'discovered_url_count',
    'analyzed_url_count',
    'failed_url_count',
    'inventory_complete',
    'partial_reason',
    'extractor_version',
    'analyzer_version',
    'rule_catalog_version',
    'scoring_version',
    'created_at',
    'completed_at',
  ]),
  site_page: descriptor('site_page_analyses', 'Site Page', [
    'id',
    'project_id',
    'crawl_id',
    'site_url_id',
    'artifact_id',
    'page_kind',
    'page_kind_evidence',
    'status',
    'web_fundamentals_score',
    'web_fundamentals_state',
    'web_fundamentals_coverage',
    'aeo_readiness_score',
    'aeo_measurement_state',
    'aeo_measurement_reason',
    'aeo_measurement_coverage',
    'readiness_dimensions',
    'source_artifact_ids',
    'source_evaluation_ids',
    'analyzer_version',
    'classifier_version',
    'scoring_version',
    'created_at',
  ]),
  site_issue: descriptor('site_issues', 'Site Issue', [
    'id',
    'project_id',
    'crawl_id',
    'site_url_id',
    'analysis_id',
    'evaluation_id',
    'source_artifact_id',
    'rule_id',
    'dimension',
    'category',
    'severity',
    'finding_class',
    'evidence',
    'description',
    'remediation',
    'analyzer_version',
    'rule_version',
    'created_at',
  ]),
  site_link: descriptor('site_page_link_metrics', 'Site Link', [
    'id',
    'project_id',
    'crawl_id',
    'site_url_id',
    'inbound_count',
    'outbound_count',
    'main_content_inbound_count',
    'main_content_outbound_count',
    'top_inbound',
    'top_outbound',
    'anchor_diagnostics',
    'extractor_version',
    'formula_version',
    'created_at',
  ]),
  demand_snapshot: descriptor('demand_snapshots', 'Demand Snapshot', [
    'id',
    'project_id',
    'window_start',
    'window_end',
    'summary',
    'coverage',
    'comparison',
    'analyzer_version',
    'created_at',
  ]),
  query_snapshot: descriptor('query_evidence_snapshots', 'Query Snapshot', [
    'id',
    'project_id',
    'window_start',
    'window_end',
    'state',
    'coverage',
    'limitations',
    'analyzer_version',
    'resolver_version',
    'created_at',
  ]),
  query_row: descriptor('query_evidence_rows', 'Query Row', [
    'id',
    'project_id',
    'snapshot_id',
    'date',
    'normalized_query',
    'observed_page_url',
    'site_url_id',
    'resolved_page_url',
    'resolution_outcome',
    'resolution_candidates',
    'impressions',
    'clicks',
    'ctr',
    'position',
    'source_metric_row_id',
    'source_artifact_id',
    'created_at',
  ]),
  audit: descriptor('audits', 'Audit', [
    'id',
    'project_id',
    'status',
    'benchmark_mode',
    'audit_scope',
    'requested_count',
    'completed_count',
    'failed_count',
    'summary',
    'analyzer_version',
    'created_at',
    'completed_at',
  ]),
  visibility_result: descriptor('audit_tasks', 'Visibility Result', [
    'id',
    'project_id',
    'audit_id',
    'logical_engine',
    'prompt_index',
    'answer_text',
    'search_events',
    'created_at',
    'completed_at',
  ]),
  citation: descriptor('citations', 'Citation', [
    'id',
    'audit_id',
    'analysis_id',
    'ordinal',
    'url',
    'title',
    'domain',
    'classification',
    'source_class',
    'source_origin',
    'is_owned',
    'is_unintended',
    'matched_competitor',
    'resolved_url',
    'canonical_url',
    'analyzer_version',
    'created_at',
  ]),
  traffic_snapshot: descriptor('traffic_snapshots', 'Traffic Snapshot', [
    'id',
    'project_id',
    'window_start',
    'window_end',
    'granularity',
    'metrics',
    'dimension_counts',
    'coverage',
    'formula_version',
    'normalization_version',
    'created_at',
  ]),
  earned_source_snapshot: descriptor('source_page_snapshots', 'Earned Source Snapshot', [
    'id',
    'project_id',
    'source_page_id',
    'audit_id',
    'requested_url',
    'final_url',
    'redirect_chain',
    'status_code',
    'content_type',
    'body_bytes',
    'page_facts',
    'evidence_passages',
    'extracted_chars',
    'robots_state',
    'outcome',
    'outcome_reason',
    'extractor_version',
    'inspector_version',
    'fetched_at',
  ]),
  search_run: descriptor('search_intelligence_runs', 'Search Run', [
    'id',
    'project_id',
    'status',
    'action',
    'frozen_scope',
    'pricing_version',
    'planned_calls',
    'completed_calls',
    'planned_rows',
    'received_rows',
    'uncertain_calls',
    'error_code',
    'created_at',
    'completed_at',
  ]),
  search_dataset: descriptor('search_intelligence_datasets', 'Search Dataset', [
    'id',
    'project_id',
    'run_id',
    'dataset_kind',
    'target_domain',
    'target_hostname',
    'target_origin',
    'comparison_origin',
    'location_code',
    'language_code',
    'provider_filters',
    'status',
    'coverage',
    'requested_rows',
    'raw_rows_received',
    'unique_rows_saved',
    'provider_total',
    'truncated',
    'summary',
    'collection_started_at',
    'collection_ended_at',
    'published_at',
    'created_at',
  ]),
  search_row: descriptor('search_intelligence_rows', 'Search Row', [
    'id',
    'project_id',
    'dataset_id',
    'call_id',
    'row_kind',
    'keyword',
    'domain',
    'url',
    'search_volume',
    'difficulty',
    'intent',
    'rank_group',
    'owned_rank_group',
    'etv',
    'backlinks',
    'referring_main_domains',
    'dataforseo_rank',
    'auxiliary',
    'created_at',
  ]),
} as const;
type Kind = keyof typeof records | 'project' | 'prompt';

export function parseRecordId(value: string): { kind: Kind; id: string; part: number } {
  const uri = new URL(value);
  const kind = uri.hostname;
  const id = parseUuid(uri.pathname.slice(1));
  if (
    uri.protocol !== 'citeladder:' ||
    uri.username ||
    uri.password ||
    uri.port ||
    uri.hash ||
    !id ||
    (kind !== 'project' && kind !== 'prompt' && !Object.hasOwn(records, kind))
  ) {
    throw new Error('id must be an allowlisted citeladder:// record URI');
  }
  const parts = uri.searchParams.getAll('part');
  if (
    [...uri.searchParams.keys()].some((key) => key !== 'part') ||
    parts.length > 1 ||
    (parts[0] !== undefined && !/^\d+$/.test(parts[0]))
  )
    throw new Error('Record URI contains unsupported parameters');
  const part = Number(parts[0] ?? 0);
  if (!Number.isSafeInteger(part)) throw new Error('Record part must be a non-negative integer');
  return { kind: kind as Kind, id, part };
}

const missing = () => new Error('The requested record was not found in this account');
const text = (value: unknown) => (typeof value === 'string' ? value : '');
function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  return value;
}

async function resolveRecord(
  db: Database,
  principal: McpPrincipal,
  kind: Kind,
  id: string,
): Promise<{ record: Evidence; title: string; projectId: string; observedAt: unknown }> {
  if (kind === 'project') {
    const project = await authorizeProject(db, principal, id);
    return {
      record: await projectBusinessContext(db, principal, id),
      title: project.name,
      projectId: id,
      observedAt: null,
    };
  }
  const workspaces = await authorizedWorkspaceIds(db, principal);
  if (!workspaces.length) throw missing();
  if (kind === 'prompt') {
    const row = await db
      .selectFrom('prompts as p')
      .innerJoin('prompt_sets as s', 's.id', 'p.prompt_set_id')
      .innerJoin('projects as project', 'project.id', 's.project_id')
      .select([
        'p.id',
        's.project_id',
        'p.text',
        'p.theme',
        'p.intent',
        'p.buyer_stage',
        'p.status',
        'p.origin',
        'p.generation_evidence',
        'p.created_at',
      ])
      .where('p.id', '=', id)
      .where('project.workspace_id', 'in', workspaces)
      .executeTakeFirst();
    if (!row) throw missing();
    await authorizeProject(db, principal, row.project_id);
    return {
      record: { ...row, type: kind },
      title: row.theme || 'Prompt',
      projectId: row.project_id,
      observedAt: row.created_at,
    };
  }
  const spec = records[kind];
  const scope = sql`r.workspace_id in (${sql.join(workspaces.map((workspace) => sql`${workspace}::uuid`))})`;
  const published =
    kind === 'search_dataset'
      ? sql`and r.status = 'published'`
      : kind === 'search_row'
        ? sql`and exists (select 1 from search_intelligence_datasets d where d.id = r.dataset_id and d.workspace_id = r.workspace_id and d.project_id = r.project_id and d.status = 'published')`
        : sql``;
  const row = (
    await sql<Evidence>`select ${sql.join([...spec.columns.map((column) => sql.ref(`r.${column}`)), sql`r.workspace_id`])} from ${sql.table(spec.table)} r where r.id = ${id}::uuid and ${scope} ${published}`.execute(
      db,
    )
  ).rows[0];
  if (!row) throw missing();
  let projectId = text(row.project_id);
  if (kind === 'citation') {
    const audit = await db
      .selectFrom('audits')
      .select('project_id')
      .where('id', '=', text(row.audit_id))
      .where('workspace_id', '=', text(row.workspace_id))
      .executeTakeFirst();
    if (!audit) throw missing();
    projectId = audit.project_id;
    row.project_id = projectId;
  }
  const project = await authorizeProject(db, principal, projectId);
  if (project.workspace_id !== row.workspace_id) throw missing();
  const observedAt =
    row.fetched_at ?? row.completed_at ?? row.published_at ?? row.created_at ?? null;
  let title = text(row.title) || text(row.description) || spec.title;
  delete row.workspace_id;
  if (kind === 'visibility_result') {
    const audit = await db
      .selectFrom('audits')
      .select('id')
      .where('id', '=', text(row.audit_id))
      .where('workspace_id', '=', project.workspace_id)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    if (!audit) throw missing();
    const evidence = await getExecutionEvidence(db, {
      workspaceId: project.workspace_id,
      taskId: id,
    });
    title = `${text(row.logical_engine)} answer for prompt ${Number(row.prompt_index) + 1}`;
    return {
      record: { ...evidence, answer_text: row.answer_text, search_events: row.search_events ?? [] },
      title,
      projectId,
      observedAt,
    };
  }
  if (kind === 'opportunity') {
    const status = row.action_id
      ? await db
          .selectFrom('actions')
          .select(effectiveStatus().as('status'))
          .where('id', '=', text(row.action_id))
          .where('workspace_id', '=', project.workspace_id)
          .where('project_id', '=', projectId)
          .executeTakeFirst()
      : undefined;
    row.status = status?.status ?? 'open';
    row.provenance = {
      analyzer_version: row.analyzer_version,
      rule_version: row.rule_version,
      formula_version: row.formula_version,
    };
    delete row.action_id;
  }
  if (kind === 'site_snapshot') {
    row.scores = {
      web_fundamentals: row.web_fundamentals_score,
      aeo_readiness: row.aeo_readiness_score,
    };
    row.coverage = row.coverage_evidence;
    delete row.web_fundamentals_score;
    delete row.aeo_readiness_score;
    delete row.coverage_evidence;
  }
  if (kind === 'site_crawl' || kind === 'audit' || kind === 'search_run') {
    const fields =
      kind === 'site_crawl'
        ? {
            admitted: 'admitted_url_count',
            discovered: 'discovered_url_count',
            analyzed: 'analyzed_url_count',
            failed: 'failed_url_count',
          }
        : kind === 'audit'
          ? { requested: 'requested_count', completed: 'completed_count', failed: 'failed_count' }
          : {
              planned_calls: 'planned_calls',
              completed_calls: 'completed_calls',
              planned_rows: 'planned_rows',
              received_rows: 'received_rows',
              uncertain_calls: 'uncertain_calls',
            };
    row.counts = Object.fromEntries(
      Object.entries(fields).map(([name, column]) => [name, row[column]]),
    );
    for (const column of Object.values(fields)) delete row[column];
  }
  if (kind === 'site_link') row.grain = 'page_link_metrics_with_bounded_neighbors';
  if (kind === 'query_row') {
    row.query = row.normalized_query;
    delete row.normalized_query;
  }
  if (kind === 'site_page') {
    const url = await db
      .selectFrom('site_urls')
      .select(['display_url', 'latest_title'])
      .where('id', '=', text(row.site_url_id))
      .where('workspace_id', '=', project.workspace_id)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    if (!url) throw missing();
    title = url.latest_title || url.display_url || title;
    Object.assign(row, url);
    const artifact = await db
      .selectFrom('site_fetch_artifacts')
      .select([
        'id',
        'requested_url',
        'final_url',
        'normalized_facts',
        'extractor_version',
        'fetched_at',
      ])
      .where('id', '=', text(row.artifact_id))
      .where('workspace_id', '=', project.workspace_id)
      .where('crawl_id', '=', text(row.crawl_id))
      .executeTakeFirst();
    row.artifact = artifact ?? null;
    row.evaluations = await db
      .selectFrom('site_rule_evaluations')
      .select([
        'id',
        'rule_id',
        'outcome',
        'reason_code',
        'dimension',
        'category',
        'severity',
        'finding_class',
        'evidence',
        'score_applicability',
        'display_applicability',
        'source_artifact_id',
        'supporting_artifact_ids',
        'analyzer_version',
        'extractor_version',
        'rule_version',
      ])
      .where('analysis_id', '=', id)
      .where('workspace_id', '=', project.workspace_id)
      .orderBy('rule_id')
      .orderBy('id')
      .execute();
    row.issues = await db
      .selectFrom('site_issues')
      .select([
        'id as occurrence_id',
        'rule_id',
        'severity',
        'description',
        'remediation',
        'evidence',
        'evaluation_id',
        'source_artifact_id',
      ])
      .where('analysis_id', '=', id)
      .where('workspace_id', '=', project.workspace_id)
      .where('project_id', '=', projectId)
      .orderBy('id')
      .execute();
    row.issues = (row.issues as Evidence[]).map((issue) => ({
      ...issue,
      record_uri: `citeladder://site_issue/${text(issue.occurrence_id)}`,
    }));
  }
  if (kind === 'earned_source_snapshot') {
    const source = await db
      .selectFrom('source_pages')
      .select(['canonical_url', 'source_class', 'page_format', 'page_format_method'])
      .where('id', '=', text(row.source_page_id))
      .where('workspace_id', '=', project.workspace_id)
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    Object.assign(
      row,
      source ?? {
        canonical_url: null,
        source_class: null,
        page_format: null,
        page_format_method: null,
      },
    );
    row.entity_presences = await db
      .selectFrom('source_page_entity_presences')
      .select([
        'id',
        'entity_kind',
        'entity_name',
        'presence',
        'match_method',
        'match_count',
        'passage_refs',
      ])
      .where('snapshot_id', '=', id)
      .where('workspace_id', '=', project.workspace_id)
      .where('project_id', '=', projectId)
      .orderBy('id')
      .execute();
    title =
      text(jsonObject(row.page_facts ?? {}, 'page_facts').title) || text(row.final_url) || title;
  }
  if (kind === 'search_dataset') {
    row.acquisition = jsonObject(row.provider_filters, 'provider_filters');
    row.research_scope =
      jsonObject(row.provider_filters, 'provider_filters').research_scope ?? 'exact_host';
    delete row.provider_filters;
  }
  if (kind === 'search_row') {
    for (const [key, value] of Object.entries(jsonObject(row.auxiliary, 'auxiliary'))) {
      if (!Object.hasOwn(row, key)) row[key] = value;
    }
  }
  return { record: row, title, projectId, observedAt };
}

function recordUrl(
  kind: Kind,
  projectId: string,
  id: string,
  record: Evidence,
  origin: string,
): string {
  const path = kind.startsWith('site_')
    ? '/website'
    : ['audit', 'visibility_result', 'citation'].includes(kind)
      ? '/visibility'
      : kind === 'opportunity'
        ? '/agent/actions'
        : kind === 'prompt'
          ? '/visibility/prompts'
          : kind.startsWith('search_')
            ? '/search-intelligence'
            : ['traffic_snapshot', 'demand_snapshot', 'query_snapshot', 'query_row'].includes(kind)
              ? '/performance'
              : '/dashboard';
  const url = new URL(path, origin);
  url.searchParams.set('project', projectId);
  if (kind !== 'opportunity') url.searchParams.set(kind === 'prompt' ? 'prompt' : 'evidence', id);
  if (['audit', 'visibility_result', 'citation'].includes(kind) && text(record.url))
    url.searchParams.set('source', text(record.url));
  return url.href;
}

/** Split by Unicode code points, measuring the entire encoded document in UTF-8. */
export function retrievalDocument(
  kind: Kind,
  id: string,
  part: number,
  record: Evidence,
  title: string,
  projectId: string,
  observedAt: unknown,
  origin: string,
): Evidence {
  const normalized = z.record(z.string(), z.json()).parse(jsonValue(record));
  const serialized = JSON.stringify(normalized);
  const uri = `citeladder://${kind}/${id}`;
  const url = recordUrl(kind, projectId, id, normalized, origin);
  const limit = mcpPolicy.max_document_bytes;
  const document = (textPart: string, partUris: string[] = []) => ({
    ...(partUris.length ? {} : normalized),
    id: partUris.length ? `${uri}?part=${part}` : uri,
    title,
    text: textPart,
    url,
    metadata: {
      project_id: projectId,
      record_type: kind,
      observed_at: jsonValue(observedAt),
      complete: partUris.length === 0,
      record: partUris.length ? {} : normalized,
      part: partUris.length ? part : null,
      part_count: partUris.length || 1,
      part_uris: partUris,
    },
  });
  const bytes = (value: Evidence) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  const full = document(serialized);
  if (bytes(full) <= limit) {
    if (part !== 0) throw new Error('The requested evidence part was not found');
    return full;
  }
  const characters = Array.from(serialized);
  for (
    let chunkSize = Math.floor(limit / 2);
    chunkSize > 0;
    chunkSize = Math.floor(chunkSize / 2)
  ) {
    const count = Math.ceil(characters.length / chunkSize);
    const uris = Array.from({ length: count }, (_, index) => `${uri}?part=${index}`);
    // Bound metadata first: decreasing chunk size cannot rescue a URI manifest
    // that already exceeds the document budget.
    if (bytes(document('', uris)) > limit)
      throw new Error('Retrieval metadata exceeds the document size limit');
    const parts = Array.from({ length: count }, (_, index) =>
      characters.slice(index * chunkSize, (index + 1) * chunkSize).join(''),
    );
    if (parts.every((entry) => bytes(document(entry, uris)) <= limit)) {
      if (part >= count) throw new Error('The requested evidence part was not found');
      return document(parts[part]!, uris);
    }
  }
  throw new Error('Retrieval metadata exceeds the document size limit');
}

export async function fetchRecord(
  db: Database,
  principal: McpPrincipal,
  value: string,
  origin: string,
): Promise<Evidence> {
  const { kind, id, part } = parseRecordId(value);
  const resolved = await resolveRecord(db, principal, kind, id);
  return retrievalDocument(
    kind,
    id,
    part,
    resolved.record,
    resolved.title,
    resolved.projectId,
    resolved.observedAt,
    origin,
  );
}
