import { policy } from '../config.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import {
  activityPage,
  coveragePage,
  crawlerPage,
  crawlSummary,
  type CrawlReadOptions,
} from '../crawl-logs/reads.ts';
import { insightsRead } from '../ai-traffic/insights.ts';
import { pageContext, pagesRead, urlRead } from '../ai-traffic/pages.ts';
import { pageDataset } from '../ai-traffic/pages-data.ts';
import { readAiReferrals } from '../analytics/ai-referrals.ts';
import { queryEvidencePage, queryEvidenceTotals } from '../demand/reads.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import { readProjectReadiness } from '../integrations/readiness.ts';
import { getPerformance, getPerformanceTable } from '../traffic/performance.ts';
import { canonicalPage, pathIdentity } from '../page-identity.ts';
import { mcpPolicy } from './config.ts';
import { pagination, reference, unavailable } from './data.ts';
import { latestDemandSnapshot } from './evidence.ts';
import { McpInputError, type Evidence, type ProjectRead } from './types.ts';

type Window = { range?: string | null; start_date?: string | null; end_date?: string | null };

export async function performanceRead(
  { db, scope }: ProjectRead,
  args: Window & {
    granularity?: string | null;
    compare?: string | null;
    compare_start_date?: string | null;
    compare_end_date?: string | null;
    dimension?: string | null;
    sort?: string | null;
    cursor?: string | null;
    limit?: number | null;
  },
): Promise<Evidence> {
  const dashboard = await getPerformance(db, {
    ...scope,
    range: args.range ?? null,
    from: args.start_date ?? null,
    to: args.end_date ?? null,
    compare: args.compare ?? null,
    compare_from: args.compare_start_date ?? null,
    compare_to: args.compare_end_date ?? null,
    granularity: args.granularity ?? null,
  });
  const snapshotId = dashboard.selected.snapshot_id;
  const versions = {
    formula: dashboard.formula_version,
    normalization: dashboard.normalization_version,
  };
  if (!snapshotId) {
    const { stage } = await readProjectReadiness(db, scope);
    return {
      ...unavailable(
        stage === 'not_connected' ? 'not_connected' : 'performance_range_not_projected',
      ),
      readiness_stage: stage,
    };
  }
  const refs = [
    reference('traffic_snapshot', snapshotId),
    ...(dashboard.comparison?.snapshot_id
      ? [reference('traffic_snapshot', dashboard.comparison.snapshot_id)]
      : []),
  ];
  if (args.dimension) {
    const page = await getPerformanceTable(db, {
      ...scope,
      snapshot_id: snapshotId,
      dimension: args.dimension,
      sort: args.sort ?? null,
      cursor: args.cursor ?? null,
      page_size: args.limit ?? null,
      compare_snapshot_id: dashboard.comparison?.snapshot_id ?? null,
    });
    return {
      state: 'available',
      range: dashboard.range,
      selected: dashboard.selected,
      versions,
      ...page,
      artifact_refs: refs,
    };
  }
  return {
    state: 'available',
    range: dashboard.range,
    granularity: dashboard.granularity,
    compare: dashboard.compare,
    selected: dashboard.selected,
    comparison: dashboard.comparison,
    coverage: dashboard.coverage,
    dimension_counts: dashboard.dimension_counts,
    unavailable_dimensions: dashboard.unavailable_dimensions,
    versions,
    artifact_refs: refs,
  };
}

async function queryEvidenceDays(...read: Parameters<typeof queryEvidencePage>) {
  const page = await queryEvidencePage(...read);
  return {
    ...page,
    items: page.items.map((row) => ({
      ...row,
      record_uri: `citeladder://query_row/${row.id}`,
    })),
  };
}

async function savedWindow(read: ProjectRead, start?: string | null, end?: string | null) {
  if (start && end) return { start, end };
  if (start || end) throw new McpInputError('Pass both window_start and window_end, or neither');
  const latest = await latestDemandSnapshot(read);
  return latest ? { start: latest.start, end: latest.end } : null;
}

export async function queryEvidence(
  read: ProjectRead,
  args: {
    window_start?: string | null;
    window_end?: string | null;
    query?: string | null;
    site_url_id?: string | null;
    resolution_outcome?: string | null;
    cursor?: string | null;
    limit?: number | null;
    granularity?: 'window' | 'day' | null;
  },
): Promise<Evidence> {
  const { db, scope } = read;
  const saved = await savedWindow(read, args.window_start, args.window_end);
  if (!saved) return unavailable('exact_query_evidence_window_not_projected');
  if (saved.end < saved.start) throw new McpInputError('window_end must not precede window_start');
  const window = { ...scope, windowStart: saved.start, windowEnd: saved.end };
  const options = {
    limit: args.limit ?? mcpPolicy.default_list_limit,
    cursor: args.cursor ?? null,
    query: args.query ?? null,
    site_url_id: args.site_url_id ?? null,
    resolution_outcome: args.resolution_outcome ?? null,
  };
  try {
    const page =
      args.granularity === 'day'
        ? await queryEvidenceDays(db, window, options)
        : await queryEvidenceTotals(db, window, options);
    const items = page.items.map(({ normalized_query, ...row }) => ({
      ...row,
      query: normalized_query,
    }));
    const { source_metric_row_ids, source_artifact_ids, ...snapshot } = page.snapshot;
    return {
      state: snapshot.state,
      snapshot: {
        ...snapshot,
        source_metric_row_count: source_metric_row_ids.length,
        source_artifact_count: source_artifact_ids.length,
      },
      unsupported_dimensions: ['country', 'device', 'search_type'],
      granularity: args.granularity ?? 'window',
      items,
      pagination: pagination(items, page.next_cursor),
      artifact_refs: [reference('query_snapshot', snapshot.id)],
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return {
        ...unavailable('exact_query_evidence_window_not_projected'),
        window: saved,
      };
    throw error;
  }
}

export async function referrals({ db, scope }: ProjectRead, args: Window): Promise<Evidence> {
  const projection = await readAiReferrals(db, {
    ...scope,
    fromDate: args.start_date ?? null,
    toDate: args.end_date ?? null,
    rangeToken: args.range ?? null,
    granularity: policy.analytics.default_granularity,
  });
  if (!projection.snapshotId) return unavailable('no_ai_referrals_snapshot');
  const result = projection.response;
  return {
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
    landing_pages: result.landing_pages
      .toSorted((a, b) => (b.sessions ?? -1) - (a.sessions ?? -1))
      .slice(0, mcpPolicy.referral_landing_pages)
      .map(({ url_hash: _hash, ...page }) => page),
    landing_page_count: result.landing_pages.length,
    analytics_quality: result.analytics_quality,
    channel_comparison: result.channel_comparison,
    unattributed_landing: result.unattributed_landing,
    snapshot_id: projection.snapshotId,
    versions: { analyzer: result.analyzer_version, formula: result.formula_version },
  };
}

type CrawlArgs = Window & {
  verification?: string | null;
  bot_id?: string | null;
  status?: number | null;
  folder?: string | null;
  resource_class?: string | null;
  sort?: string | null;
  cursor?: string | null;
  limit?: number | null;
};
const crawlOptions = (args: CrawlArgs): CrawlReadOptions & { sort: string | null } => ({
  range: args.range ?? null,
  start_date: args.start_date ?? null,
  end_date: args.end_date ?? null,
  verification: args.verification ?? null,
  bot_id: args.bot_id ?? null,
  status: args.status ?? null,
  folder: args.folder ?? null,
  resource_class: args.resource_class ?? null,
  sort: args.sort ?? null,
  cursor: args.cursor ?? null,
  limit: args.limit ?? crawlLogs.default_page_size,
});

export async function crawlLogsRead(
  { db, scope }: ProjectRead,
  args: CrawlArgs & { view: 'summary' | 'crawlers' | 'coverage' | 'requests' },
): Promise<Evidence> {
  const options = crawlOptions(args);
  if (crawlNotConnected(await crawlSummary(db, scope, options)))
    return unavailable('not_connected');
  const reader = {
    summary: crawlSummary,
    crawlers: crawlerPage,
    coverage: coveragePage,
    requests: activityPage,
  }[args.view];
  return { state: 'available', ...(await reader(db, scope, options)) };
}

function crawlNotConnected(crawl: Awaited<ReturnType<typeof crawlSummary>>) {
  return crawl.connection === 'not_connected' && crawl.requests === null;
}

async function aiTrafficNotConnected(
  db: ProjectRead['db'],
  scope: ProjectRead['scope'],
  args: Window,
) {
  const context = await pageContext(db, scope, crawlOptions(args));
  return (
    crawlNotConnected(context.crawl) &&
    !context.ga4Connected &&
    context.citations === 'no_completed_run'
  );
}

export async function aiTrafficPages(
  { db, scope }: ProjectRead,
  args: CrawlArgs,
): Promise<Evidence> {
  if (await aiTrafficNotConnected(db, scope, args)) return unavailable('not_connected');
  return { state: 'available', ...(await pagesRead(db, scope, crawlOptions(args))) };
}

export async function aiTrafficInsights(
  { db, scope }: ProjectRead,
  args: Window,
): Promise<Evidence> {
  const result = await insightsRead(db, scope, crawlOptions(args));
  const shown = result.patterns.flatMap((pattern) =>
    pattern.url_hashes.slice(0, mcpPolicy.insight_pattern_paths),
  );
  const { rows } = shown.length
    ? await pageDataset(db, scope, {
        range: null,
        start_date: result.window_start,
        end_date: result.window_end,
        url_hashes: shown,
        dataset_limit: shown.length,
      })
    : { rows: [] };
  const paths = new Map(rows.map((row) => [row.url_hash, row.display_path]));
  return {
    state: result.snapshot_id ? 'available' : 'unavailable',
    ...result,
    patterns: result.patterns.map(({ url_hashes, ...pattern }) => {
      const pages = url_hashes
        .slice(0, mcpPolicy.insight_pattern_paths)
        .flatMap((hash) => paths.get(hash) ?? []);
      return {
        ...pattern,
        pages,
        pages_omitted: (pattern.numbers.page_count ?? url_hashes.length) - pages.length,
      };
    }),
  };
}

export async function aiTrafficUrl(
  { db, scope }: ProjectRead,
  args: Window & { url: string },
): Promise<Evidence> {
  const project = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'projects')
    .select('website_url')
    .where('id', '=', scope.projectId)
    .executeTakeFirstOrThrow();
  const canonical = canonicalPage(args.url, project.website_url);
  if (!canonical || new URL(canonical).origin !== new URL(project.website_url).origin)
    throw new McpInputError('URL must be on the project origin');
  const identity = pathIdentity(args.url, project.website_url);
  if (!identity?.url_hash) return unavailable('url_not_joinable');
  if (await aiTrafficNotConnected(db, scope, args)) return unavailable('not_connected');
  const result = await urlRead(db, scope, identity.url_hash, crawlOptions(args));
  return { state: result.page ? 'available' : 'unavailable', ...result };
}
