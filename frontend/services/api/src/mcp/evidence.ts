/** MCP adapters over the persisted product read owners. */
import { sql } from 'kysely';
import {
  crawlSummary,
  crawlerPage,
  coveragePage,
  activityPage,
  type CrawlReadOptions,
  crawlReadArtifacts,
} from '../crawl-logs/reads.ts';
import { policy } from '../config.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { pagesRead, urlRead } from '../crawl-logs/pages.ts';
import { insightsRead } from '../crawl-logs/insights.ts';
import { canonicalPage, hash } from '../traffic/normalization.ts';
import { robotsFactsSchema } from '@citeladder/contracts/site-health';
import { mcpPolicy } from './config.ts';
import { readIntegrationStatus } from './evidence-integrations.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { record, strings } from '../db/json.ts';
import { isoDateText, utcText } from '../db/timestamps.ts';
import { parseUuid } from '../http/uuid.ts';
import { queryEvidencePage } from '../demand/reads.ts';
import { getPerformance, getPerformanceTable } from '../traffic/performance.ts';
import { readAiReferrals } from '../analytics/ai-referrals.ts';
import { getVisibilityEvidence } from '../visibility/evidence.ts';
import { getVisibilitySources } from '../visibility/sources.ts';
import { readiness, datasetPage } from '../search-intelligence/reads.ts';
import { opportunityStatusClause, validateStatus } from '../opportunities/action-status.ts';
import { authorizeProject, decodeCursor, encodeCursor, pagination } from './data.ts';
import { McpInputError, type Evidence, type EvidencePrincipal, type ReadScope } from './types.ts';

const reference = (kind: string, id: string, retrievable = true) => ({
  kind,
  id,
  record_uri: retrievable ? `citeladder://${kind}/${id}` : null,
  retrievable,
  reason: retrievable ? null : 'raw_record_not_exposed',
});
const unavailable = (reason: string): Evidence => ({
  state: 'unavailable',
  reason,
  artifact_refs: [],
  omissions: [{ reason, count: 1 }],
});
export type ReadArguments = Record<string, string | number | boolean | string[] | null | undefined>;
const text = (args: ReadArguments, key: string) =>
  typeof args[key] === 'string' ? (args[key] as string) : null;
const limit = (args: ReadArguments) => Number(args.limit ?? mcpPolicy.default_list_limit);
const workspace = (scope: ReadScope) => new WorkspaceScope(scope.workspaceId);

async function siteSnapshot(db: Database, scope: ReadScope): Promise<Evidence> {
  const row = await workspace(scope)
    .selectFrom(db, 'site_health_snapshots')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row
    ? {
        state: 'available',
        scores: {
          web_fundamentals: row.web_fundamentals_score,
          aeo_readiness: row.aeo_readiness_score,
          aeo_measurement_coverage: row.aeo_measurement_coverage,
        },
        coverage: { selected_urls: row.selected_url_count, analyzed_urls: row.analyzed_url_count },
        versions: { analyzer: row.analyzer_version, scoring: row.scoring_version },
        artifact_refs: [reference('site_snapshot', row.id), reference('site_crawl', row.crawl_id)],
        omissions: [],
      }
    : unavailable('no_site_snapshot');
}
async function crawlability(db: Database, scope: ReadScope): Promise<Evidence> {
  const row = await workspace(scope)
    .selectFrom(db, 'site_crawls')
    .select(['id', 'site_facts', 'robots_snapshot_id'])
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  if (!row) return unavailable('no_site_crawl');
  const parsed = robotsFactsSchema.safeParse(record(row.site_facts).robots);
  if (!parsed.success) return unavailable('robots_not_observed');
  return {
    state: 'available',
    crawl_id: row.id,
    ...parsed.data,
    artifact_refs: [
      reference('site_crawl', row.id),
      ...(row.robots_snapshot_id
        ? [reference('robots_snapshot', row.robots_snapshot_id, false)]
        : []),
    ],
    omissions: [],
  };
}
async function demandSnapshot(db: Database, scope: ReadScope): Promise<Evidence> {
  const row = await workspace(scope)
    .selectFrom(db, 'demand_snapshots')
    .selectAll()
    .select([
      isoDateText(sql.ref('window_start')).as('start'),
      isoDateText(sql.ref('window_end')).as('end'),
    ])
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row
    ? {
        state: 'available',
        window: { start: row.start, end: row.end },
        summary: row.summary,
        coverage: row.coverage,
        comparison: row.comparison,
        artifact_refs: [
          reference('demand_snapshot', row.id),
          ...strings(row.source_artifact_ids).map((id) =>
            reference('integration_artifact', id, false),
          ),
          ...strings(row.source_metric_row_ids).map((id) =>
            reference('integration_metric_row', id, false),
          ),
        ],
        omissions: [],
      }
    : unavailable('no_demand_snapshot');
}
async function ranked(db: Database, scope: ReadScope, args: ReadArguments): Promise<Evidence> {
  let query = workspace(scope)
    .selectFrom(db, 'opportunities')
    .selectAll()
    .where('project_id', '=', scope.projectId)
    .where('superseded_at', 'is', null);
  const status = text(args, 'status');
  if (status) {
    validateStatus(status);
    query = query.where(opportunityStatusClause(status));
  }
  const cursor = text(args, 'cursor');
  if (cursor) {
    if (!parseUuid(cursor)) throw new McpInputError('cursor must be a UUID');
    const row = await query.where('id', '=', cursor).executeTakeFirst();
    if (!row) throw new McpInputError('cursor is invalid for this opportunity selection');
    query = query.where(
      sql<boolean>`(priority_score < ${row.priority_score} or (priority_score = ${row.priority_score} and id > ${row.id}::uuid))`,
    );
  }
  const count = Number(args.limit ?? mcpPolicy.default_roadmap_limit);
  const rows = await query
      .orderBy('priority_score', 'desc')
      .orderBy('id')
      .limit(count + 1)
      .execute(),
    selected = rows.slice(0, count);
  if (!selected.length) return unavailable('no_opportunities');
  const items = selected.map((r, index) => ({
    id: r.id,
    record_uri: `citeladder://opportunity/${r.id}`,
    rank: index + 1,
    priority_score: r.priority_score,
    severity: r.severity,
    type: r.opportunity_type,
    title: r.title,
    remediation: r.remediation,
    target_url: r.target_url,
  }));
  return {
    state: 'available',
    ordering: 'priority_score_desc_then_id',
    items,
    artifact_refs: selected.map((r) => reference('opportunity', r.id)),
    pagination: pagination(items, rows.length > count ? selected.at(-1)!.id : null),
    omissions: rows.length > count ? [{ reason: 'roadmap_item_limit', count: null }] : [],
  };
}
async function audit(db: Database, scope: ReadScope, args: ReadArguments): Promise<Evidence> {
  let query = workspace(scope)
    .selectFrom(db, 'audits')
    .selectAll()
    .where('project_id', '=', scope.projectId);
  if (args.audit_id) query = query.where('id', '=', text(args, 'audit_id')!);
  else if (args.completed_baseline)
    query = query.where('status', 'in', ['completed', 'partially_completed']);
  const row = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').executeTakeFirst();
  return row
    ? {
        state: 'available',
        status: row.status,
        audit_id: row.id,
        summary: row.summary,
        counts: {
          requested: row.requested_count,
          completed: row.completed_count,
          failed: row.failed_count,
        },
        analyzer_version: row.analyzer_version,
        created_at: row.created_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        measurement_identity: row.configuration,
        continuations: { results: 'read_visibility_results', sources: 'read_visibility_sources' },
        artifact_refs: [reference('audit', row.id)],
        omissions: [],
      }
    : unavailable(args.audit_id ? 'audit_not_found' : 'no_audit');
}
async function promptPortfolio(
  db: Database,
  scope: ReadScope,
  args: ReadArguments,
): Promise<Evidence> {
  let query = workspace(scope)
    .selectFrom(db, 'projects')
    .innerJoin('prompt_sets as s', 's.project_id', 'projects.id')
    .innerJoin('prompts as p', 'p.prompt_set_id', 's.id')
    .select([
      'p.id',
      'p.prompt_set_id',
      's.name as prompt_set_name',
      'p.topic_id',
      'p.text',
      'p.theme',
      'p.intent',
      'p.buyer_stage',
      'p.prompt_intent',
      'p.cohort',
      'p.enabled',
      'p.status',
      'p.origin',
      'p.generation_evidence',
      'p.created_at',
    ])
    .select(utcText(sql.ref('p.created_at')).as('cursor_at'))
    .where('projects.id', '=', scope.projectId);
  if (args.prompt_set_id) query = query.where('s.id', '=', text(args, 'prompt_set_id')!);
  if (args.active_only)
    query = query.where('p.enabled', '=', true).where('p.status', '=', 'active');
  if (args.cohort) query = query.where('p.cohort', '=', text(args, 'cohort')!);
  if (args.cursor) {
    const [at, id] = decodeCursor(text(args, 'cursor')!, 2);
    if (!at || Number.isNaN(Date.parse(at)) || !parseUuid(id))
      throw new McpInputError('cursor is invalid');
    query = query.where(sql<boolean>`(p.created_at,p.id) > (${at}::timestamptz,${id}::uuid)`);
  }
  const count = limit(args),
    rows = await query
      .orderBy('p.created_at')
      .orderBy('p.id')
      .limit(count + 1)
      .execute(),
    selected = rows.slice(0, count),
    last = selected.at(-1);
  const items = selected.map(({ enabled, cursor_at: _at, ...r }) => ({
    ...r,
    record_uri: `citeladder://prompt/${r.id}`,
    active: enabled && r.status === 'active',
  }));
  const topics = await workspace(scope)
    .selectFrom(db, 'projects')
    .innerJoin('topics', 'topics.project_id', 'projects.id')
    .select(['topics.id', 'topics.name', 'topics.description'])
    .where('projects.id', '=', scope.projectId)
    .orderBy('topics.name')
    .orderBy('topics.id')
    .limit(count + 1)
    .execute();
  return {
    state: 'available',
    project_id: scope.projectId,
    topics: topics.slice(0, count),
    topics_truncated: topics.length > count,
    items,
    pagination: pagination(
      items,
      rows.length > count && last ? encodeCursor(last.cursor_at, last.id) : null,
    ),
  };
}

export async function readEvidence(
  db: Database,
  scope: ReadScope,
  name: string,
  args: ReadArguments,
): Promise<Evidence> {
  if (['read_ai_traffic_pages', 'read_ai_traffic_url', 'read_ai_traffic_insights'].includes(name)) {
    const options = {
      range: text(args, 'range'),
      start_date: text(args, 'start_date'),
      end_date: text(args, 'end_date'),
      folder: text(args, 'folder'),
      resource_class: text(args, 'resource_class'),
      verification: text(args, 'verification'),
      sort: text(args, 'sort'),
      cursor: text(args, 'cursor'),
      limit: Number(args.limit ?? crawlLogs.default_page_size),
    };
    if (name === 'read_ai_traffic_pages')
      return {
        state: 'available',
        ...(await pagesRead(db, scope, options)),
        artifact_refs: [],
        omissions: [],
      };
    if (name === 'read_ai_traffic_insights') {
      const result = await insightsRead(db, scope, options);
      return {
        state: result.snapshot_id ? 'available' : 'unavailable',
        ...result,
        artifact_refs: result.snapshot_id
          ? [reference('ai_traffic_insights', result.snapshot_id, false)]
          : [],
        omissions: [],
      };
    }
    const project = await workspace(scope)
      .selectFrom(db, 'projects')
      .select('website_url')
      .where('id', '=', scope.projectId)
      .executeTakeFirstOrThrow();
    const canonical = canonicalPage(text(args, 'url')!, project.website_url);
    if (!canonical || new URL(canonical).origin !== new URL(project.website_url).origin)
      throw new McpInputError('URL must be on the project origin');
    const url = canonicalPage(canonical.split('?')[0]!, project.website_url)!;
    const result = await urlRead(db, scope, hash(url), options);
    return {
      state: result.page ? 'available' : 'unavailable',
      ...result,
      artifact_refs: result.crawls.flatMap((r) =>
        r.source_rollup_ids.map((id) => reference('bot_activity_daily', id, false)),
      ),
      omissions: result.provenance.bounded ? [{ reason: 'timeline_bounded', count: 1 }] : [],
    };
  }
  if (name === 'read_crawl_logs' || name === 'list_bot_requests') {
    const options: CrawlReadOptions = {
      range: text(args, 'range'),
      start_date: text(args, 'start_date'),
      end_date: text(args, 'end_date'),
      verification: text(args, 'verification'),
      cursor: text(args, 'cursor'),
      limit: limit(args),
      bot_id: text(args, 'bot_id'),
      status: typeof args.status === 'number' ? args.status : null,
      folder: text(args, 'folder'),
      resource_class: text(args, 'resource_class'),
    };
    if (name === 'list_bot_requests') {
      const result = await activityPage(db, scope, options);
      return {
        state: 'available',
        ...result,
        artifact_refs: result.items.map((row) => ({
          ...reference('bot_request', row.id, false),
          catalog_version: row.catalog_version,
        })),
        omissions: [],
      };
    }
    if (args.view === 'coverage') {
      const result = await coveragePage(db, scope, options);
      return {
        state: 'available',
        ...result,
        artifact_refs: result.sources.map((source) =>
          reference('crawl_log_source', source.id, false),
        ),
        omissions: [],
      };
    }
    const reader = args.view === 'crawlers' ? crawlerPage : crawlSummary;
    const result = await reader(db, scope, options);
    const artifacts = await crawlReadArtifacts(db, scope, options);
    return {
      state: 'available',
      ...result,
      artifact_refs: artifacts.slice(0, mcpPolicy.max_list_limit).map((row) => ({
        ...reference('bot_activity_daily', row.id, false),
        formula_version: row.formula_version,
        source_batch_ids: row.source_batch_ids,
      })),
      omissions:
        artifacts.length > mcpPolicy.max_list_limit
          ? [
              {
                reason: 'artifact_refs_bounded',
                count: artifacts.length - mcpPolicy.max_list_limit,
              },
            ]
          : [],
    };
  }
  if (name === 'read_integration_status') return readIntegrationStatus(db, scope);
  if (name === 'read_site_health') return siteSnapshot(db, scope);
  if (name === 'read_ai_crawlability') return crawlability(db, scope);
  if (name === 'read_demand') return demandSnapshot(db, scope);
  if (name === 'read_opportunities') return ranked(db, scope, args);
  if (name === 'read_visibility_audit') return audit(db, scope, args);
  if (name === 'read_prompt_portfolio') return promptPortfolio(db, scope, args);
  if (name === 'read_performance' || name === 'read_performance_table') {
    const options = {
      ...scope,
      range: text(args, 'range'),
      from: text(args, 'start_date'),
      to: text(args, 'end_date'),
      compare: text(args, 'compare'),
      compare_from: text(args, 'compare_start_date'),
      compare_to: text(args, 'compare_end_date'),
      granularity: text(args, 'granularity'),
    };
    const dashboard =
      name === 'read_performance' || !args.snapshot_id ? await getPerformance(db, options) : null;
    const snapshotId = text(args, 'snapshot_id') ?? dashboard?.selected.snapshot_id;
    if (!snapshotId) return unavailable('performance_range_not_projected');
    if (name === 'read_performance_table') {
      const page = await getPerformanceTable(db, {
        ...scope,
        snapshot_id: snapshotId,
        dimension: text(args, 'dimension'),
        sort: text(args, 'sort'),
        cursor: text(args, 'cursor'),
        page_size: typeof args.page_size === 'number' ? args.page_size : null,
        compare_snapshot_id: text(args, 'compare_snapshot_id'),
      });
      return {
        state: 'available',
        ...page,
        artifact_refs: [reference('traffic_snapshot', snapshotId)],
        omissions:
          page.total_count > page.items.length
            ? [{ reason: 'page_size_limit', count: page.total_count - page.items.length }]
            : [],
      };
    }
    return {
      state: 'available',
      range: dashboard!.range,
      granularity: dashboard!.granularity,
      compare: dashboard!.compare,
      selected: dashboard!.selected,
      comparison: dashboard!.comparison,
      coverage: dashboard!.coverage,
      dimension_counts: dashboard!.dimension_counts,
      unavailable_dimensions: dashboard!.unavailable_dimensions,
      versions: {
        formula: dashboard!.formula_version,
        normalization: dashboard!.normalization_version,
      },
      artifact_refs: [
        reference('traffic_snapshot', snapshotId),
        ...(dashboard!.comparison?.snapshot_id
          ? [reference('traffic_snapshot', dashboard!.comparison.snapshot_id)]
          : []),
      ],
      omissions: [],
    };
  }
  if (name === 'read_ai_referrals') {
    const projection = await readAiReferrals(db, {
      ...scope,
      fromDate: text(args, 'start_date'),
      toDate: text(args, 'end_date'),
      rangeToken: text(args, 'range'),
      granularity: policy.analytics.default_granularity,
    });
    const result = projection.response;
    return projection.snapshotId
      ? {
          state: 'available',
          window: { start: result.window_start, end: result.window_end },
          granularity: result.granularity,
          referral_volume: result.referral_volume,
          referral_share: result.referral_share,
          sources: result.sources,
          scope: result.scope,
          reporting_timezone: result.reporting_timezone,
          currency_code: result.currency_code,
          source_measures: result.source_measures,
          landing_pages: result.landing_pages,
          analytics_quality: result.analytics_quality,
          channel_comparison: result.channel_comparison,
          unattributed_landing: result.unattributed_landing,
          versions: { analyzer: result.analyzer_version, formula: result.formula_version },
          artifact_refs: [reference('ai_referrals_snapshot', projection.snapshotId, false)],
          omissions: [],
        }
      : unavailable('no_ai_referrals_snapshot');
  }
  if (name === 'read_query_evidence') {
    const start = text(args, 'window_start')!,
      end = text(args, 'window_end')!;
    if (end < start) throw new McpInputError('window_end must not precede window_start');
    try {
      const page = await queryEvidencePage(
        db,
        { ...scope, windowStart: start, windowEnd: end },
        {
          limit: limit(args),
          cursor: text(args, 'cursor'),
          query: text(args, 'query'),
          site_url_id: text(args, 'site_url_id'),
          resolution_outcome: text(args, 'resolution_outcome'),
        },
      );
      const items = page.items.map(({ normalized_query, ...r }) => ({
        ...r,
        query: normalized_query,
        record_uri: `citeladder://query_row/${r.id}`,
      }));
      return {
        state: page.snapshot.state,
        project_id: scope.projectId,
        snapshot: {
          ...page.snapshot,
          record_uri: `citeladder://query_snapshot/${page.snapshot.id}`,
        },
        scope: {
          country: null,
          device: null,
          search_type: null,
          unsupported_dimensions: ['country', 'device', 'search_type'],
        },
        items,
        pagination: pagination(items, page.next_cursor),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Query evidence snapshot not found')
        return {
          state: 'unavailable',
          reason: 'exact_query_evidence_window_not_projected',
          project_id: scope.projectId,
          window: { start, end },
          items: [],
          pagination: pagination([], null),
        };
      throw error;
    }
  }
  if (name === 'read_visibility_results' || name === 'read_visibility_sources') {
    const selection = {
      ...scope,
      auditId: text(args, 'audit_id'),
      auditIds: null,
      logicalEngine: text(args, 'engine'),
      cohort: text(args, 'cohort') ?? 'core',
      fromAt: null,
      toAt: null,
    };
    if (name === 'read_visibility_results') {
      const page = await getVisibilityEvidence(db, selection, {
        promptId: text(args, 'prompt_id'),
        outcome: null,
        competitor: null,
        domain: null,
        url: null,
        cursor: text(args, 'cursor'),
        asOf: null,
        limit: limit(args),
      });
      const items = await Promise.all(
        page.items.map(async (item) => {
          const citations = await workspace(scope)
            .selectFrom(db, 'citations')
            .select(['id', 'ordinal'])
            .where('analysis_id', '=', item.analysis_id)
            .orderBy('ordinal')
            .execute();
          const ids = new Map(citations.map((r) => [r.ordinal, r.id]));
          return {
            ...item,
            id: item.task_id,
            record_uri: `citeladder://visibility_result/${item.task_id}`,
            citations: item.citations.map((c) => ({
              ...c,
              ...(ids.get(c.ordinal)
                ? {
                    id: ids.get(c.ordinal),
                    record_uri: `citeladder://citation/${ids.get(c.ordinal)}`,
                  }
                : {}),
            })),
          };
        }),
      );
      return {
        state: 'available',
        project_id: scope.projectId,
        audit_id: selection.auditId,
        observed_at: page.as_of,
        scope: { engine: selection.logicalEngine, cohort: selection.cohort },
        items,
        pagination: pagination(items, page.next_cursor ?? null, page.total),
      };
    }
    const dimension = text(args, 'level') === 'url' ? 'url' : 'domain';
    const page = await getVisibilitySources(db, selection, {
      domain: null,
      sourceClass: null,
      dimension,
      asOf: null,
      cursor: text(args, 'cursor'),
      limit: limit(args),
      baselineAuditIds: null,
    });
    const items = await Promise.all(
      page.items.map(async (item) => {
        const source =
          dimension === 'url' && 'url_hash' in item && item.url_hash
            ? await workspace(scope)
                .selectFrom(db, 'source_pages')
                .select(['latest_snapshot_id', 'inspection_reason'])
                .where('project_id', '=', scope.projectId)
                .where('url_hash', '=', String(item.url_hash))
                .executeTakeFirst()
            : null;
        return {
          ...item,
          observation:
            dimension === 'url'
              ? 'citation_occurrence_and_answer_cooccurrence'
              : 'citation_occurrence',
          inspected_page_presence_is_separate: true,
          inspection_evidence: source?.latest_snapshot_id
            ? reference('earned_source_snapshot', source.latest_snapshot_id)
            : {
                record_uri: null,
                retrievable: false,
                reason: source?.inspection_reason || 'source_page_not_inspected',
              },
        };
      }),
    );
    return {
      state: 'available',
      project_id: scope.projectId,
      audit_id: selection.auditId,
      level: dimension,
      scope: { engine: selection.logicalEngine, cohort: selection.cohort },
      coverage: {
        responses: page.responses,
        prompts: page.prompts,
        citations: page.total_citations,
      },
      items,
      pagination: pagination(items, page.next_cursor, page.total),
      as_of: page.as_of,
    };
  }
  if (name === 'read_search_intelligence') {
    const result = await readiness(db, { workspace: workspace(scope), projectId: scope.projectId });
    const datasets = result.datasets.map((r) => ({
      ...r,
      record_uri: `citeladder://search_dataset/${r.id}`,
      grain_limitation: ['backlink_summary', 'referring_domains', 'destination_pages'].includes(
        r.dataset_kind,
      )
        ? 'aggregate_not_individual_backlink_edges'
        : null,
    }));
    return {
      state: 'available',
      project_id: scope.projectId,
      connected: result.connected,
      owned_targets: result.owned_targets,
      competitors: result.competitors,
      latest_run: result.latest_run
        ? { ...result.latest_run, record_uri: `citeladder://search_run/${result.latest_run.id}` }
        : null,
      datasets,
      pagination: pagination(datasets, null, datasets.length),
      read_only: true,
    };
  }
  if (name === 'read_search_dataset') {
    const page = await datasetPage(
      db,
      { workspace: workspace(scope), projectId: scope.projectId },
      text(args, 'dataset_id')!,
      {
        cursor: text(args, 'cursor'),
        limit: limit(args),
        sort: text(args, 'sort') ?? 'id',
        direction: args.direction === 'desc' ? 'desc' : 'asc',
        search: '',
        minVolume: null,
        intent: '',
      },
    );
    const items = page.rows.map((r) => ({ ...r, record_uri: `citeladder://search_row/${r.id}` }));
    return {
      state: 'available',
      project_id: scope.projectId,
      dataset: { ...page.dataset, record_uri: `citeladder://search_dataset/${page.dataset.id}` },
      items,
      pagination: pagination(items, page.next_cursor, page.dataset.filtered_saved_count ?? null),
      grain: page.dataset.dataset_kind,
      limitations: ['backlink_summary', 'referring_domains', 'destination_pages'].includes(
        page.dataset.dataset_kind,
      )
        ? ['aggregate_not_individual_backlink_edges']
        : [],
    };
  }
  throw new Error(`Unknown evidence reader: ${name}`);
}

const sectionTools: Record<string, string> = {
  site_health: 'read_site_health',
  crawlability: 'read_ai_crawlability',
  demand: 'read_demand',
  opportunities: 'read_opportunities',
  visibility: 'read_visibility_audit',
  performance: 'read_performance',
  referrals: 'read_ai_referrals',
  crawl_logs: 'read_crawl_logs',
  integrations: 'read_integration_status',
  search_intelligence: 'read_search_intelligence',
};
export async function projectBusinessContext(
  db: Database,
  principal: EvidencePrincipal,
  projectId: string,
  sections?: string[],
): Promise<Evidence> {
  const project = await authorizeProject(db, principal, projectId),
    scope = { workspaceId: project.workspace_id, projectId: project.id },
    selected = new Set(sections ?? ['profile', 'prompts', ...Object.keys(sectionTools)]);
  const evidence: Evidence = {};
  const keys: Record<string, string> = {
    read_site_health: 'site.read_snapshot',
    read_ai_crawlability: 'crawlability',
    read_demand: 'demand.read_snapshot',
    read_opportunities: 'opportunities.read_ranked',
    read_visibility_audit: 'audits.read_latest',
    read_performance: 'performance.read_snapshot',
    read_ai_referrals: 'referrals.read_snapshot',
    read_crawl_logs: 'crawl_logs',
    read_integration_status: 'integrations.read_status',
  };
  for (const [section, name] of Object.entries(sectionTools))
    if (selected.has(section) && section !== 'search_intelligence')
      evidence[keys[name]!] = await readEvidence(db, scope, name, {});
  const profile = selected.has('profile')
    ? await workspace(scope)
        .selectFrom(db, 'brand_profiles')
        .select([
          'description',
          'positioning',
          'products_services',
          'target_audience',
          'business_context',
          'sources',
          'source_artifact_ids',
          'updated_at',
        ])
        .where('project_id', '=', project.id)
        .executeTakeFirst()
    : null;
  const portfolio = selected.has('prompts')
    ? await promptPortfolio(db, scope, { limit: mcpPolicy.default_list_limit, active_only: true })
    : null;
  const search = selected.has('search_intelligence')
    ? await readEvidence(db, scope, 'read_search_intelligence', {})
    : null;
  const inventory = [
    ['site_health', 'read_site_pages', 'site.read_snapshot'],
    ['query_page_evidence', 'read_query_evidence', 'demand.read_snapshot'],
    ['visibility', 'read_visibility_results', 'audits.read_latest'],
  ].map(([kind, readTool, key]) => ({
    kind,
    read_tool: readTool,
    state: record(evidence[key!]).state ?? 'not_requested',
  }));
  inventory.push({
    kind: 'search_intelligence',
    read_tool: 'read_search_intelligence',
    state: search
      ? Array.isArray(search.datasets) && search.datasets.length
        ? 'available'
        : 'unavailable'
      : 'not_requested',
  });
  const owned = selected.has('profile')
    ? await workspace(scope)
        .selectFrom(db, 'projects')
        .innerJoin('owned_domains', 'owned_domains.project_id', 'projects.id')
        .select('owned_domains.domain')
        .where('projects.id', '=', project.id)
        .orderBy('owned_domains.domain')
        .execute()
    : [];
  const competitors = selected.has('profile')
    ? await workspace(scope)
        .selectFrom(db, 'projects')
        .innerJoin('competitors', 'competitors.project_id', 'projects.id')
        .select([
          'competitors.id',
          'competitors.name',
          'competitors.aliases',
          'competitors.domains',
        ])
        .where('projects.id', '=', project.id)
        .orderBy('competitors.name')
        .orderBy('competitors.id')
        .execute()
    : [];
  return {
    scope: 'project',
    project: {
      id: project.id,
      workspace_id: project.workspace_id,
      name: project.name,
      brand_name: project.brand_name,
      website_url: project.website_url,
      industry: project.industry,
      subindustry: project.subindustry,
      primary_market: project.primary_market,
      country_code: project.country_code,
      language_code: project.language_code,
    },
    brand_profile: selected.has('profile')
      ? profile
        ? {
            ...profile,
            review_state_by_field: Object.fromEntries(
              Object.entries(record(profile.sources)).map(([field, value]) => [
                field,
                record(value).review_state ?? 'unavailable',
              ]),
            ),
          }
        : unavailable('no_brand_profile')
      : { state: 'not_requested' },
    ...(selected.has('profile')
      ? { owned_domains: owned.map((r) => r.domain), accepted_competitors: competitors }
      : {}),
    active_prompts: portfolio ? portfolio.items : [],
    prompt_omissions:
      portfolio && record(portfolio.pagination).has_more
        ? [
            {
              reason: 'active_prompt_limit',
              limit: mcpPolicy.default_list_limit,
              continuation_tool: 'read_prompt_portfolio',
            },
          ]
        : [],
    available_datasets: inventory,
    evidence,
    applicability: {
      identity: 'applicable',
      coverage: 'applicable',
      pagination: 'applicable',
      follow_through: 'applicable',
    },
  };
}
