/** Bounded MCP views of persisted crawl page and link projections. */
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { record, strings } from '../db/json.ts';
import { parseUuid } from '../http/uuid.ts';
import { mcpPolicy } from './config.ts';
import { decodeCursor, encodeCursor, pagination } from './data.ts';
import type { ReadArguments } from './evidence.ts';
import type { Evidence, ReadScope } from './types.ts';

export async function readSiteEvidence(
  db: Database,
  scope: ReadScope,
  name: string,
  args: ReadArguments,
): Promise<Evidence> {
  const workspace = new WorkspaceScope(scope.workspaceId),
    count = Number(args.limit ?? mcpPolicy.default_list_limit);
  let query = workspace
    .selectFrom(db, 'site_crawls')
    .selectAll()
    .where('project_id', '=', scope.projectId);
  if (args.crawl_id) query = query.where('id', '=', String(args.crawl_id));
  const crawl = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').executeTakeFirst();
  if (!crawl) {
    if (name === 'read_site_links') throw new Error('Crawl was not found in this project');
    return {
      state: 'unavailable',
      reason: 'no_site_crawl',
      items: [],
      pagination: pagination([], null),
    };
  }
  if (name === 'read_site_links') {
    let links = workspace
      .selectFrom(db, 'site_page_link_metrics')
      .selectAll()
      .where('project_id', '=', scope.projectId)
      .where('crawl_id', '=', crawl.id);
    if (args.site_url_id) links = links.where('site_url_id', '=', String(args.site_url_id));
    if (args.cursor) {
      const [id] = decodeCursor(String(args.cursor), 1);
      if (!parseUuid(id)) throw new Error('cursor is invalid');
      links = links.where('id', '>', id!);
    }
    const rows = await links
        .orderBy('id')
        .limit(count + 1)
        .execute(),
      selected = rows.slice(0, count);
    const items = selected.map((r) => ({
      id: r.id,
      record_uri: `citeladder://site_link/${r.id}`,
      site_url_id: r.site_url_id,
      grain: 'page_link_metrics_with_bounded_neighbors',
      inbound_count: r.inbound_count,
      outbound_count: r.outbound_count,
      main_content_inbound_count: r.main_content_inbound_count,
      main_content_outbound_count: r.main_content_outbound_count,
      nofollow_inbound_count: r.nofollow_inbound_count,
      depth_from_home: r.depth_from_home,
      source_page_count: r.source_page_count,
      top_inbound: r.top_inbound ?? [],
      top_outbound: r.top_outbound ?? [],
      anchor_diagnostics: r.anchor_diagnostics ?? [],
      extractor_version: r.extractor_version,
      formula_version: r.formula_version,
      created_at: r.created_at,
    }));
    return {
      state: 'available',
      project_id: scope.projectId,
      crawl_id: crawl.id,
      items,
      pagination: pagination(items, rows.length > count ? encodeCursor(selected.at(-1)!.id) : null),
      limitations: [
        'aggregate_metrics_are_not_individual_edges',
        'placement_is_reported_only_when_captured_in_bounded_neighbors',
      ],
    };
  }
  const inherited = crawl.sample_mode
    ? []
    : strings(record(crawl.configuration)[mcpPolicy.inventory_source_crawl_ids_key]).filter(
        (id) => parseUuid(id) && id !== crawl.id,
      );
  const visibleCrawls = [crawl.id, ...new Set(inherited)];
  const fingerprint = JSON.stringify([crawl.id, args.page_kind ?? null, args.status ?? null]);
  let after = sql``;
  if (args.cursor) {
    const [fingerprint, url, id] = decodeCursor(String(args.cursor), 3);
    if (
      fingerprint !== JSON.stringify([crawl.id, args.page_kind ?? null, args.status ?? null]) ||
      !url ||
      !parseUuid(id)
    )
      throw new Error('cursor is invalid');
    after = sql`and (u.normalized_url,u.id) > (${url},${id}::uuid)`;
  }
  const terminal = ['completed', 'partially_completed', 'failed', 'cancelled'].includes(
    crawl.status,
  );
  const kindFilter = args.page_kind ? sql`and a.page_kind=${args.page_kind}` : sql``;
  const statusFilter =
    args.status === 'error_or_blocked'
      ? sql`and analysis_status in ('error','blocked')`
      : args.status
        ? sql`and analysis_status=${args.status}`
        : sql``;
  // A single filtered keyset query avoids scanning the whole inventory in the
  // application when a rare page kind or status matches no rows.
  const rows = (
    await sql<Evidence>`with projected as (
    select u.id as site_url_id,u.normalized_url,u.display_url,u.latest_title as title,
      a.id as analysis_id,to_jsonb(a) as analysis,
      exists(select 1 from monitored_site_urls m where m.site_url_id=u.id and m.workspace_id=u.workspace_id and m.project_id=u.project_id and m.active) as monitored,
      case when a.status in ('completed','partially_completed') then a.status
        when t.id is null then case when exists(select 1 from monitored_site_urls m where m.site_url_id=u.id and m.workspace_id=u.workspace_id and m.project_id=u.project_id and m.active) then ${terminal ? 'not_measured' : 'pending'} else 'not_selected' end
        when t.status='cancelled' then 'cancelled'
        when t.status='failed' then case when t.error_code=any(${mcpPolicy.policy_blocking_error_codes}::text[]) then 'blocked' else 'error' end
        when t.status in ('running','leased') then 'running' else 'pending' end as analysis_status,
      case when a.status in ('completed','partially_completed') or t.status not in ('failed','cancelled') then '' else coalesce(t.error_code,'') end as error_code,
      (select count(*)::int from site_issues i where i.analysis_id=a.id and i.workspace_id=u.workspace_id and i.project_id=u.project_id) as issue_count,
      l.inbound_count,l.main_content_inbound_count,l.depth_from_home,
      (select o.crawl_id from site_url_observations o join site_crawls c on c.id=o.crawl_id and c.workspace_id=o.workspace_id and c.project_id=u.project_id where o.site_url_id=u.id and o.workspace_id=u.workspace_id and o.crawl_id=any(${visibleCrawls}::uuid[]) order by array_position(${visibleCrawls}::uuid[],o.crawl_id) limit 1) as crawl_id
    from site_urls u
    left join lateral (select * from site_page_analyses a where a.site_url_id=u.id and a.workspace_id=u.workspace_id and a.project_id=u.project_id and a.crawl_id=${crawl.id}::uuid and a.is_current order by a.created_at desc,a.id desc limit 1) a on true
    left join lateral (select id,status,error_code from site_crawl_tasks t where t.site_url_id=u.id and t.workspace_id=u.workspace_id and t.crawl_id=${crawl.id}::uuid and t.task_kind='analyze' order by t.generation desc,t.id desc limit 1) t on true
    left join site_page_link_metrics l on l.site_url_id=u.id and l.workspace_id=u.workspace_id and l.project_id=u.project_id and l.crawl_id=${crawl.id}::uuid
    where u.workspace_id=${scope.workspaceId}::uuid and u.project_id=${scope.projectId}::uuid
      and exists(select 1 from site_url_observations o join site_crawls c on c.id=o.crawl_id and c.workspace_id=o.workspace_id and c.project_id=u.project_id where o.site_url_id=u.id and o.workspace_id=u.workspace_id and o.crawl_id=any(${visibleCrawls}::uuid[])) ${after} ${kindFilter}
  ) select * from projected where true ${statusFilter} order by normalized_url,site_url_id limit ${count + 1}`.execute(
      db,
    )
  ).rows;
  const emitted = rows
    .slice(0, count)
    .map(({ analysis: stored, analysis_id: analysisId, ...row }) => {
      const a = record(stored);
      return {
        ...row,
        id: analysisId ?? row.site_url_id,
        record_uri: analysisId ? `citeladder://site_page/${String(analysisId)}` : null,
        retrievable: !!analysisId,
        ...(!analysisId ? { retrieval_reason: 'page_analysis_not_available' } : {}),
        issue_count: analysisId ? row.issue_count : null,
        page_kind: a.page_kind ?? null,
        web_fundamentals_score: a.web_fundamentals_score ?? null,
        web_fundamentals_coverage: a.web_fundamentals_coverage ?? null,
        web_fundamentals_state: a.web_fundamentals_state ?? 'not_measured',
        aeo_readiness_score: a.aeo_readiness_score ?? null,
        aeo_measurement_coverage: a.aeo_measurement_coverage ?? null,
        aeo_measurement_state: a.aeo_measurement_state ?? 'not_measured',
        aeo_measurement_reason: a.aeo_measurement_reason ?? '',
        main_content_indexable: a.main_content_indexable ?? null,
        last_audited: a.finalized_at ?? null,
      };
    });
  const root =
    crawl.status === 'failed'
      ? await workspace
          .selectFrom(db, 'site_crawl_tasks')
          .select(['id', 'requested_url', 'status'])
          .where('crawl_id', '=', crawl.id)
          .where('task_kind', '=', 'discover')
          .where('depth', '=', 0)
          .orderBy('generation', 'desc')
          .limit(1)
          .executeTakeFirst()
      : null;
  const rootErrors =
    root?.status === 'failed'
      ? await workspace
          .selectFrom(db, 'site_fetch_attempts')
          .select(['method', 'outcome', 'error_code', 'status_code', 'latency_ms'])
          .where('task_id', '=', root.id)
          .where('outcome', '=', 'error')
          .orderBy('attempt_number')
          .orderBy('request_ordinal')
          .execute()
      : [];
  const last = rows.slice(0, count).at(-1);
  return {
    state: 'available',
    project_id: scope.projectId,
    crawl: {
      id: crawl.id,
      record_uri: `citeladder://site_crawl/${crawl.id}`,
      status: crawl.status,
      inventory_complete: crawl.inventory_complete,
      created_at: crawl.created_at,
      completed_at: crawl.completed_at,
    },
    coverage: {
      admitted_urls: crawl.admitted_url_count,
      analyzed_urls: crawl.analyzed_url_count,
      failed_urls: crawl.failed_url_count,
      inventory_complete: crawl.inventory_complete,
      root_errors: rootErrors.map((row) => ({
        ...row,
        target: root?.requested_url || crawl.root_url,
      })),
    },
    items: emitted,
    pagination: pagination(
      emitted,
      rows.length > count && last
        ? encodeCursor(fingerprint, last.normalized_url, last.site_url_id)
        : null,
    ),
    limitations: ['bounded_normalized_facts', 'raw_html_not_retained'],
  };
}
