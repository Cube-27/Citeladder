/** Bounded MCP views of persisted crawl page and link projections. */
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { parseUuid } from '../http/uuid.ts';
import { rootFailure } from '../site-health/reads/crawl.ts';
import { measurementFields, pageRows } from '../site-health/reads/page-rows.ts';
import { mcpPolicy } from './config.ts';
import { decodeCursor, encodeCursor, pagination } from './data.ts';
import type { ReadArguments } from './evidence.ts';
import { McpInputError, type Evidence, type ReadScope } from './types.ts';

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
    if (name === 'read_site_links') throw new McpInputError('Crawl was not found in this project');
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
      if (!parseUuid(id)) throw new McpInputError('cursor is invalid');
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
  const filterKey = JSON.stringify([crawl.id, args.page_kind ?? null, args.status ?? null]);
  let after: { value: string; id: string } | null = null;
  if (args.cursor) {
    const [fingerprint, url, id] = decodeCursor(String(args.cursor), 3);
    if (fingerprint !== filterKey || !url || !parseUuid(id))
      throw new McpInputError('cursor is invalid');
    after = { value: url, id: id! };
  }
  const [rows, root] = await Promise.all([
    pageRows(db, crawl, {
      filters: {
        pageKind: args.page_kind ? String(args.page_kind) : null,
        status: args.status ? String(args.status) : null,
      },
      sort: 'url',
      limit: count,
      after,
    }),
    rootFailure(db, crawl),
  ]);
  const emitted = rows.slice(0, count).map((row) => ({
    site_url_id: row.site_url_id,
    crawl_id: row.crawl_id,
    normalized_url: row.normalized_url,
    display_url: row.display_url,
    title: row.title,
    monitored: row.monitored,
    analysis_status: row.analysis_status,
    error_code: row.error_code,
    inbound_count: row.inbound_count,
    main_content_inbound_count: row.main_content_inbound_count,
    depth_from_home: row.depth_from_home,
    ...measurementFields(row),
    id: row.analysis_id ?? row.site_url_id,
    record_uri: row.analysis_id ? `citeladder://site_page/${row.analysis_id}` : null,
    retrievable: row.analysis_id !== null,
    ...(row.analysis_id === null ? { retrieval_reason: 'page_analysis_not_available' } : {}),
  }));
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
      root_errors: root.errors,
    },
    items: emitted,
    pagination: pagination(
      emitted,
      rows.length > count && last
        ? encodeCursor(filterKey, last.normalized_url, last.site_url_id)
        : null,
    ),
    limitations: ['bounded_normalized_facts', 'raw_html_not_retained'],
  };
}
