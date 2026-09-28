/**
 * The Sources table: cited domains, or cited pages, over a selection.
 *
 * Moved from `source_projection.py`, `source_page_links.py`,
 * `source_mentions.py` and `source_comparison.py` in `app/domain/analysis`
 * (Python keeps the projection for MCP). Every rate's denominator is the
 * selection bounded by `as_of`, so paging never picks up a run that finished
 * mid-read. Totals follow the same filters as the rows. Page rows carry what
 * this project knows about the page and the brands named in the answers that
 * cited it, which is co-occurrence, never presence on the page.
 */
import type { visibilitySourcesSchema } from '@citeladder/contracts/visibility-evidence';
import { sql } from 'kysely';
import type { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { pydanticUtcOf, pydanticUtcOrNull, utcText } from '../db/timestamps.ts';
import { fromEpochMicros, type ParsedDatetime } from '../http/datetimes.ts';
import { compareText } from '../text-order.ts';
import { brandIdentities, identityKey } from './brand-identities.ts';
import { ratio } from './metrics.ts';
import { runSetComparisonStatus } from './run-sets.ts';
import {
  authorizedSelection,
  authorizeRunSet,
  evidenceScope,
  observedAt,
  TrendQueryError,
  type RunSelection,
} from './selection.ts';

export type SourcesResponse = z.input<typeof visibilitySourcesSchema>;
type SourceRow = SourcesResponse['items'][number];

// Chips a cell holds before the rest become the "+N" overflow.
const SOURCE_ROW_MAX_BRANDS = 3;
const PAGE_TARGET_PREFIX = policy.opportunity.earned_actions.EARNED_PAGE_TARGET_PREFIX;

export type SourceQuery = {
  domain: string | null;
  sourceClass: string | null;
  dimension: 'domain' | 'url';
  asOf: ParsedDatetime | null;
  offset: number;
  limit: number;
  baselineAuditIds: string[] | null;
};

type Scope = ReturnType<typeof scopeOf>;

/** Every answer in the selection up to `as_of`, with the prompt it answered. */
function scopeOf(db: Database, selection: RunSelection, asOf: string) {
  return evidenceScope(db, selection)
    .where('ra.created_at', '<=', sql<Date>`${asOf}::timestamptz`)
    .select([
      'ra.id as analysis_id',
      // Coalesced to the frozen text: a deleted prompt's snapshot has no id.
      sql<string>`coalesce(snapshot.prompt_id::text, snapshot.text)`.as('prompt_key'),
      observedAt.as('observed_at'),
    ])
    .as('scope');
}

/**
 * The citations the rows count. A domain row is filtered by its publisher
 * class, a page row by its own page format, exactly as the type ring is.
 */
function filteredCitations(
  db: Database,
  scope: Scope,
  selection: RunSelection,
  query: SourceQuery,
  pages: boolean,
) {
  let citations = db
    .selectFrom('citations as citation')
    .innerJoin(scope, 'scope.analysis_id', 'citation.analysis_id')
    .where('citation.workspace_id', '=', selection.workspaceId);
  if (query.domain) citations = citations.where('citation.domain', '=', query.domain);
  if (!query.sourceClass) return citations;
  if (!pages) return citations.where('citation.source_class', '=', query.sourceClass);
  return citations
    .innerJoin('source_pages as page', (join) =>
      join
        .onRef('page.url_hash', '=', 'citation.url_hash')
        .on('page.workspace_id', '=', selection.workspaceId)
        .on('page.project_id', '=', selection.projectId),
    )
    .where('page.page_format', '=', query.sourceClass);
}

export async function getVisibilitySources(
  db: Database,
  requested: RunSelection,
  query: SourceQuery,
): Promise<SourcesResponse> {
  const selection = await authorizedSelection(db, requested);
  if (query.asOf !== null && query.asOf.offsetSeconds === null) {
    throw new TrendQueryError("'as_of' must be timezone-aware");
  }
  const asOf = pydanticUtcOf(query.asOf ?? fromEpochMicros(BigInt(Date.now()) * 1000n));
  const scope = scopeOf(db, selection, asOf);
  const denominator = await db
    .selectFrom(scope)
    .select([
      sql<string>`count(scope.analysis_id)`.as('responses'),
      sql<string>`count(distinct scope.prompt_key)`.as('prompts'),
    ])
    .executeTakeFirstOrThrow();
  const responses = Number(denominator.responses);
  const prompts = Number(denominator.prompts);
  // Selecting a domain is the drill-down into its pages; the URL dimension
  // is pages across every domain.
  const pages = Boolean(query.domain) || query.dimension === 'url';
  const key = pages ? 'citation.url' : 'citation.domain';
  const groups = filteredCitations(db, scope, selection, query, pages)
    .select([
      sql<string>`${sql.ref(key)}`.as('key'),
      // Page identity, grouped here rather than looked up by URL, which
      // `citations` has no index for.
      sql<string | null>`min(citation.url_hash)`.as('url_hash'),
      sql<number>`count(distinct citation.analysis_id)`.as('responses'),
      sql<number>`count(distinct scope.prompt_key)`.as('prompts'),
      // From the evidence itself: the inspection schedule holds no record of
      // the project's own pages.
      utcText(sql`max(scope.observed_at)`).as('last_cited_at'),
      sql<number>`count(citation.id)`.as('annotations'),
      sql<number>`count(distinct citation.url)`.as('urls'),
      sql<(string | null)[]>`array_agg(distinct citation.classification)`.as('ownership'),
      sql<(string | null)[]>`array_agg(distinct citation.source_class)`.as('categories'),
      sql<(string | null)[]>`array_agg(distinct citation.source_taxonomy_version)`.as('versions'),
    ])
    .groupBy(key)
    .as('groups');
  const totals = await db
    .selectFrom(groups)
    .select([
      sql<string>`count(*)`.as('total'),
      sql<string>`coalesce(sum(groups.annotations), 0)`.as('citations'),
    ])
    .executeTakeFirstOrThrow();
  const total = Number(totals.total);
  const totalCitations = Number(totals.citations);
  const rows = await db
    .selectFrom(groups)
    .selectAll()
    .orderBy('groups.responses', 'desc')
    .orderBy('groups.key', 'asc')
    .offset(query.offset)
    .limit(query.limit)
    .execute();
  const items: SourceRow[] = rows.map((row) => {
    const rowResponses = Number(row.responses);
    const annotations = Number(row.annotations);
    const urls = Number(row.urls);
    const present = (values: (string | null)[]) =>
      values.filter((value): value is string => Boolean(value)).sort(compareText);
    return {
      key: row.key,
      url_hash: pages ? row.url_hash : null,
      // "Last seen" is asked of a page, never of a publisher.
      last_cited_at: pages ? pydanticUtcOrNull(row.last_cited_at) : null,
      responses: rowResponses,
      prompts: Number(row.prompts),
      annotations,
      urls,
      response_rate: ratio(rowResponses, responses),
      prompt_coverage: ratio(Number(row.prompts), prompts),
      // How much of a publisher the engines reached; a page is one URL.
      retrieval_rate: pages ? null : ratio(urls, responses),
      citation_share: ratio(annotations, totalCitations),
      // Per answer the source was retrieved in, never per answer selected.
      citation_rate: ratio(annotations, rowResponses),
      ownership: present(row.ownership),
      categories: present(row.categories),
      taxonomy_versions: present(row.versions),
      category_unavailable: row.categories.includes(null),
      response_delta: null,
      inspection_state: null,
      opportunity_id: null,
      title: null,
      page_format: null,
      page_format_method: null,
      mentions: 0,
      brands: [],
    };
  });
  await attachPageLinks(db, selection, items);
  if (pages) await attachRowMentions(db, selection, scope, items);
  const response: SourcesResponse = {
    total,
    responses,
    prompts,
    total_citations: totalCitations,
    category_totals: await categoryTotals(db, scope, selection, query, pages),
    as_of: asOf,
    next_offset: query.offset + query.limit < total ? query.offset + query.limit : null,
    comparison_status: 'no_baseline',
    items,
  };
  if (query.baselineAuditIds?.length) {
    response.comparison_status = await applySourceComparison(db, selection, response, {
      baselineIds: query.baselineAuditIds,
      domain: query.domain,
      pages,
      asOf,
    });
  }
  return response;
}

/**
 * Citations per type across the whole filtered selection, never the loaded
 * page. Page rows count page formats through page identity, so a citation
 * whose identity never resolved is absent rather than an unknown kind.
 */
async function categoryTotals(
  db: Database,
  scope: Scope,
  selection: RunSelection,
  query: SourceQuery,
  pages: boolean,
): Promise<Record<string, number>> {
  const rows = pages
    ? await filteredCitations(db, scope, selection, { ...query, sourceClass: null }, pages)
        .innerJoin('source_pages as page', (join) =>
          join
            .onRef('page.url_hash', '=', 'citation.url_hash')
            .on('page.workspace_id', '=', selection.workspaceId)
            .on('page.project_id', '=', selection.projectId),
        )
        .$if(Boolean(query.sourceClass), (q) =>
          q.where('page.page_format', '=', query.sourceClass!),
        )
        .select(['page.page_format as category', sql<string>`count(citation.id)`.as('citations')])
        .groupBy('page.page_format')
        .execute()
    : await filteredCitations(db, scope, selection, query, pages)
        .where('citation.source_class', 'is not', null)
        .select([
          'citation.source_class as category',
          sql<string>`count(citation.id)`.as('citations'),
        ])
        .groupBy('citation.source_class')
        .execute();
  return Object.fromEntries(
    rows.flatMap((row) => (row.category ? [[row.category, Number(row.citations)]] : [])),
  );
}

/**
 * Each page row's inspection state, live action and page facts. A page this
 * project has no record of keeps every field unset: nobody looked, which is
 * not the same as nothing wrong. Two cited URLs can resolve to one page.
 */
async function attachPageLinks(
  db: Database,
  selection: RunSelection,
  items: SourceRow[],
): Promise<void> {
  const byHash = new Map<string, SourceRow[]>();
  for (const row of items) {
    if (row.url_hash) byHash.set(row.url_hash, [...(byHash.get(row.url_hash) ?? []), row]);
  }
  if (byHash.size === 0) return;
  const hashes = [...byHash.keys()];
  const pages = await db
    .selectFrom('source_pages as page')
    .leftJoin('opportunities as opportunity', (join) =>
      join
        .on('opportunity.target_key', '=', sql<string>`${PAGE_TARGET_PREFIX} || page.url_hash`)
        .on('opportunity.workspace_id', '=', selection.workspaceId)
        .onRef('opportunity.project_id', '=', 'page.project_id')
        .on('opportunity.superseded_at', 'is', null),
    )
    .leftJoin('source_page_snapshots as snapshot', 'snapshot.id', 'page.latest_snapshot_id')
    .select([
      'page.url_hash',
      'page.inspection_state',
      'page.page_format',
      'page.page_format_method',
      'snapshot.page_facts',
      'opportunity.id as opportunity_id',
    ])
    .where('page.workspace_id', '=', selection.workspaceId)
    .where('page.project_id', '=', selection.projectId)
    .where('page.url_hash', 'in', hashes)
    // The highest-priority live action first, should a page ever have two.
    .orderBy('page.url_hash')
    .orderBy(sql`opportunity.priority_score desc nulls last`)
    .execute();
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.url_hash)) continue;
    seen.add(page.url_hash);
    const title = record(page.page_facts).title;
    for (const row of byHash.get(page.url_hash) ?? []) {
      row.inspection_state = page.inspection_state;
      row.opportunity_id = page.opportunity_id;
      row.title = typeof title === 'string' && title ? title : null;
      row.page_format = page.page_format;
      row.page_format_method = page.page_format_method;
    }
  }
}

/** The brands named in the answers that cited each loaded page, in place. */
async function attachRowMentions(
  db: Database,
  selection: RunSelection,
  scope: Scope,
  items: SourceRow[],
): Promise<void> {
  const urls = items.map((row) => row.key).filter(Boolean);
  if (urls.length === 0) return;
  const cited = db
    .selectFrom('citations as citation')
    .innerJoin(scope, 'scope.analysis_id', 'citation.analysis_id')
    .where('citation.workspace_id', '=', selection.workspaceId)
    .where('citation.url', 'in', urls);
  const brand = await cited
    .innerJoin('brand_mentions as mention', 'mention.analysis_id', 'citation.analysis_id')
    .where('mention.brand_name', '!=', '')
    .select([
      'citation.url',
      'mention.brand_name as name',
      sql<string>`count(distinct mention.analysis_id)`.as('responses'),
    ])
    .groupBy(['citation.url', 'mention.brand_name'])
    .execute();
  const competitor = await cited
    .innerJoin('competitor_mentions as mention', 'mention.analysis_id', 'citation.analysis_id')
    .where('mention.competitor_name', '!=', '')
    .select([
      'citation.url',
      'mention.competitor_name as name',
      sql<string>`count(distinct mention.analysis_id)`.as('responses'),
    ])
    .groupBy(['citation.url', 'mention.competitor_name'])
    .execute();
  const found = new Map<
    string,
    { kind: 'brand' | 'competitor'; name: string; responses: number }[]
  >();
  for (const [kind, rows] of [
    ['brand', brand],
    ['competitor', competitor],
  ] as const) {
    for (const row of rows) {
      const list = found.get(row.url) ?? [];
      list.push({ kind, name: row.name, responses: Number(row.responses) });
      found.set(row.url, list);
    }
  }
  const identities = await brandIdentities(db, selection.projectId);
  for (const row of items) {
    const named = found.get(row.key);
    if (!named?.length) continue;
    named.sort(
      (left, right) => right.responses - left.responses || compareText(left.name, right.name),
    );
    row.mentions = named.length;
    row.brands = named.slice(0, SOURCE_ROW_MAX_BRANDS).map((entry) => {
      const identity = identities.get(identityKey(entry.name));
      return { ...entry, logo_url: identity?.logo_url ?? null, website: identity?.website ?? null };
    });
  }
}

/**
 * Each row's movement in response rate against a baseline run set, when the
 * two sets are comparable; returns the comparison status.
 */
async function applySourceComparison(
  db: Database,
  selection: RunSelection,
  response: SourcesResponse,
  input: { baselineIds: string[]; domain: string | null; pages: boolean; asOf: string },
): Promise<string> {
  await authorizeRunSet(db, selection, input.baselineIds);
  const status = await runSetComparisonStatus(db, selection, {
    currentIds: selection.auditIds?.length
      ? selection.auditIds
      : selection.auditId
        ? [selection.auditId]
        : [],
    baselineIds: input.baselineIds,
    responses: response.responses,
    engine: selection.logicalEngine,
    cohort: selection.cohort,
  });
  if (status !== 'comparable') return status;
  const baseline = evidenceScope(db, {
    ...selection,
    auditId: null,
    auditIds: null,
    fromAt: null,
    toAt: null,
  })
    .where('ra.audit_id', 'in', input.baselineIds)
    .where('ra.created_at', '<=', sql<Date>`${input.asOf}::timestamptz`)
    .select('ra.id');
  const { answers } = await db
    .selectFrom(baseline.as('baseline'))
    .select(sql<string>`count(*)`.as('answers'))
    .executeTakeFirstOrThrow();
  const denominator = Number(answers);
  if (!denominator) return 'no_observations';
  const keys = response.items.map((row) => row.key);
  if (keys.length === 0) return 'comparable';
  const key = input.pages ? 'citation.url' : 'citation.domain';
  let counted = db
    .selectFrom('citations as citation')
    .where('citation.workspace_id', '=', selection.workspaceId)
    .where('citation.analysis_id', 'in', baseline)
    .where(key, 'in', keys);
  if (input.domain) counted = counted.where('citation.domain', '=', input.domain);
  const counts = new Map(
    (
      await counted
        .select([
          sql<string>`${sql.ref(key)}`.as('key'),
          sql<string>`count(distinct citation.analysis_id)`.as('answers'),
        ])
        .groupBy(key)
        .execute()
    ).map((row) => [row.key, Number(row.answers)]),
  );
  for (const row of response.items) {
    if (row.response_rate === null) continue;
    row.response_delta = (row.response_rate - (counts.get(row.key) ?? 0) / denominator) * 100;
  }
  return 'comparable';
}
