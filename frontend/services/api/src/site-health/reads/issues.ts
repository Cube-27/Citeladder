/**
 * The grouped issue catalog and one group's occurrences.
 *
 * A crawl's issues are each page's current issues from its latest audit as
 * the crawl shows it, plus the crawl's site-level findings (`viewIssuesSql`,
 * SH-B9): a page rerun landing after the crawl moves its page. Groups
 * are `(rule, finding class)` within the crawl, identified by a stable UUID;
 * the summary counts groups rather than occurrences, so its tiles match the
 * list.
 *
 * The list holds defects and advisories together unless a finding class
 * narrows it. The unfiltered list and summary of each finding class, and of
 * both together, are persisted per crawl once its issues are final, and again when a page rerun lands in it
 * (`site-health/issue-catalog.ts`), and read from there. A filtered read
 * (search, severity, category, dimension, rule, page, page kind) and a crawl
 * whose catalog is not written yet compute them
 * here. A persisted summary keeps the monitored affected count of its
 * publication, so it lags a tracked-set change until the next one.
 */
import {
  siteIssueDetailSchema,
  siteIssuesPageSchema,
  type IssueSection,
  type IssueSort,
} from '@citeladder/contracts/site-health';
import { sql, type RawBuilder } from 'kysely';
import { z } from 'zod';

import { policy } from '../../config.ts';
import type { Database } from '../../db/database.ts';
import { notFound } from '../../errors.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../../http/keyset-cursor.ts';
import { containsPattern } from '../../db/like.ts';
import { parseUuid } from '../../http/uuid.ts';
import { firstOf } from '../../lists.ts';
import { loadCrawl, viewIssuesSql, type Crawl } from './crawl.ts';
import { decodeGroupCursor, groupCursorAfter, groupOrder, resumeIndex } from './issue-order.ts';
import {
  issueGroupId,
  issueOccurrence,
  issueSection,
  remediationRoute,
  rulesTitled,
  ruleTitle,
  siteLevelRule,
  siteLevelScope,
  type IssueRow,
} from './rules.ts';

const reads = policy.site_health.reads;
export type Paging = { limit: number; cursor: string | null };

export type IssueFilters = {
  query: string | null;
  severity: string | null;
  category: string | null;
  dimension: string | null;
  rule: string | null;
  siteUrlId: string | null;
  pageKind: string | null;
  /** Null lists defects and advisories together. */
  findingClass: string | null;
};

/**
 * Issues that belong to one page kind, for the page-kind filter (currency
 * itself is the persisted `is_current` flag).
 *
 * Every finalized analysis names the crawl's site checks among its sources, so
 * matching on those sources alone would file a site-level finding under every
 * kind. A per-page finding belongs to the kind of its own page's current,
 * finalized analysis; a finding persisted once for the site (a sitewide link,
 * an architecture rule) belongs to the kinds its evidence counts pages of, and
 * `siteLevelScope` counts only those pages.
 */
function ofPageKind(crawl: Crawl, pageKind: string) {
  return sql`(case when ${siteLevelRule}
    then coalesce(i.evidence -> 'page_kind_counts' ? ${pageKind}, false)
    else ${onPageOfKind(crawl, pageKind, sql`and i.evaluation_id = any(a.source_evaluation_ids)`)}
    end)`;
}

/**
 * The issue's own page has a current, finalized analysis of the kind (and
 * `also` holds) in the audit the issue came from.
 */
function onPageOfKind(crawl: Crawl, pageKind: string, also = sql``) {
  return sql`exists (
    select 1 from site_page_analyses a
    where a.workspace_id = ${crawl.workspace_id} and a.crawl_id = i.crawl_id
      and a.site_url_id = i.site_url_id and a.is_current and a.finalized_at is not null
      and a.page_kind = ${pageKind} ${also})`;
}

/**
 * The issues the crawl shows: each page's current issues from its latest
 * audit and the crawl's site-level findings (`viewIssuesSql`, SH-B9). The
 * writers keep `is_current` (`issue-currency.ts`).
 */
const currentIssues = (crawl: Crawl) => viewIssuesSql(crawl);

function issueWhere(crawl: Crawl, filters: IssueFilters): RawBuilder<unknown> {
  const clauses = [currentIssues(crawl)];
  // The catalog shows three tiers; `high` includes `critical`.
  if (filters.severity === 'high') clauses.push(sql`i.severity in ('high', 'critical')`);
  else if (filters.severity) clauses.push(sql`i.severity = ${filters.severity}`);
  if (filters.category) clauses.push(sql`i.category = ${filters.category}`);
  if (filters.dimension) clauses.push(sql`i.dimension = ${filters.dimension}`);
  if (filters.rule) clauses.push(sql`i.rule_id = ${filters.rule}`);
  if (filters.siteUrlId) clauses.push(sql`i.site_url_id = ${filters.siteUrlId}`);
  if (filters.pageKind) clauses.push(ofPageKind(crawl, filters.pageKind));
  if (filters.findingClass) clauses.push(sql`i.finding_class = ${filters.findingClass}`);
  if (filters.query) {
    // The reader searches the titles they see ("broken internal links"), not rule ids.
    const query = filters.query.trim();
    clauses.push(
      sql`(i.rule_id ilike ${containsPattern(query)} or i.rule_id = any(${rulesTitled(query)}::text[]))`,
    );
  }
  return sql.join(clauses, sql` and `);
}

type Group = IssueRow & { affected_url_count: number; group_id: string };
type IssueItem = z.infer<typeof siteIssuesPageSchema>['items'][number];
/** The summary a catalog persists: the tab counts ride each read. */
export type IssueSummary = Omit<z.input<typeof siteIssuesPageSchema>['summary'], 'section_counts'>;

/** The finding classes the catalog lists, each with its own groups and summary. */
export const ISSUE_FINDING_CLASSES = ['defect', 'advisory'] as const;

/** A persisted catalog's `finding_class`: the class, or `all` for both classes together. */
export const catalogClassKey = (findingClass: string | null) => findingClass ?? 'all';

/** No filter beyond the finding class: the catalog its writers persist per crawl. */
export const unfilteredIssues = (findingClass: string | null): IssueFilters => ({
  query: null,
  severity: null,
  category: null,
  dimension: null,
  rule: null,
  siteUrlId: null,
  pageKind: null,
  findingClass,
});

const isUnfiltered = (filters: IssueFilters) =>
  !filters.query?.trim() &&
  !filters.severity &&
  !filters.category &&
  !filters.dimension &&
  !filters.rule &&
  !filters.siteUrlId &&
  !filters.pageKind;

/** Matching rule groups, each with its earliest current occurrence as the representative. */
async function issueGroups(db: Database, crawl: Crawl, filters: IssueFilters): Promise<Group[]> {
  const { rows } = await sql<IssueRow & { affected_url_count: number }>`
    with matching as (
      select i.rule_id, i.finding_class, count(distinct i.site_url_id)::int as affected_url_count
      from site_issues i where ${issueWhere(crawl, filters)} group by i.rule_id, i.finding_class
    )
    select distinct on (i.rule_id, i.finding_class) i.*, '' as reason_code, m.affected_url_count
    from site_issues i
    join matching m on m.rule_id = i.rule_id and m.finding_class = i.finding_class
    where ${currentIssues(crawl)}
    order by i.rule_id, i.finding_class, i.created_at, i.id`.execute(db);
  return rows
    .map((row) => ({
      ...row,
      affected_url_count:
        siteLevelScope(row.rule_id, row.evidence, filters.pageKind)?.affected ??
        row.affected_url_count,
      group_id: issueGroupId(crawl.id, row.rule_id, row.finding_class),
    }))
    .sort(compareGroups);
}

const compareGroups = groupOrder('severity');

/** How the catalog page is cut and ordered: one tab, one ordering. Neither narrows the summary. */
export type IssueView = { section: IssueSection | null; sort: IssueSort };
const ALL_SECTIONS_BY_SEVERITY: IssueView = { section: null, sort: 'severity' };

/** Issue groups per tab. */
function sectionCounts(groups: readonly Pick<IssueItem, 'dimension' | 'category'>[]) {
  const counts: Record<IssueSection, number> = { technical: 0, content: 0, aeo: 0 };
  for (const group of groups) counts[issueSection(group)] += 1;
  return counts;
}

/** The summary's issue scope: severity and dimension chips never narrow it. */
function summaryScope(crawl: Crawl, filters: IssueFilters) {
  const unchipped = { ...filters, severity: null, dimension: null };
  return {
    scoped: issueWhere(crawl, unchipped),
    anyClass: issueWhere(crawl, { ...unchipped, findingClass: null }),
    // Under a page-kind filter the homepage row that carries a site-level
    // finding is a page of that kind only when the homepage itself is one; the
    // finding's own pages of the kind come from its evidence (`siteLevelScope`).
    countedPage: filters.pageKind
      ? sql`not ${siteLevelRule} or ${onPageOfKind(crawl, filters.pageKind)}`
      : sql`true`,
  };
}

/** Group counts for the tiles and chips: severity and dimension chips never narrow them. */
export async function issueSummary(
  db: Database,
  crawl: Crawl,
  filters: IssueFilters,
): Promise<IssueSummary> {
  const { scoped, anyClass, countedPage } = summaryScope(crawl, filters);
  const [classes, severities, dimensions, totals, siteLevel, monitored] = await Promise.all([
    sql<{ finding_class: string; count: number }>`
      select i.finding_class, count(distinct i.rule_id)::int as count
      from site_issues i where ${anyClass} group by i.finding_class`.execute(db),
    sql<{ severity: string; count: number }>`
      select i.severity, count(distinct i.rule_id)::int as count
      from site_issues i where ${anyClass} and i.finding_class = 'defect'
      group by i.severity`.execute(db),
    sql<{ dimension: string; count: number }>`
      select i.dimension, count(distinct i.rule_id)::int as count
      from site_issues i where ${scoped} group by i.dimension`.execute(db),
    sql<{ affected: number; occurrences: number }>`
      select count(distinct i.site_url_id) filter (where ${countedPage})::int as affected,
        count(*)::int as occurrences
      from site_issues i where ${scoped}`.execute(db),
    sql<{ rule_id: string; evidence: unknown }>`
      select i.rule_id, i.evidence from site_issues i
      where ${scoped} and ${siteLevelRule}`.execute(db),
    // Affected pages the project tracks when the summary is computed; a
    // persisted catalog keeps the count of its publication (owner, 2026-11-20).
    sql<{ monitored: number }>`
      select count(distinct i.site_url_id) filter (where (${countedPage}) and i.site_url_id in (
        select m.site_url_id from monitored_site_urls m
        where m.workspace_id = ${crawl.workspace_id} and m.project_id = ${crawl.project_id}
          and m.active))::int as monitored
      from site_issues i where ${scoped}`.execute(db),
  ]);
  const byClass = Object.fromEntries(classes.rows.map((row) => [row.finding_class, row.count]));
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  // `critical` folds into `high`, matching the High filter's rows.
  for (const row of severities.rows) {
    const key = row.severity === 'critical' ? 'high' : row.severity;
    severityCounts[key] = (severityCounts[key] ?? 0) + row.count;
  }
  const dimensionCounts: Record<string, number> = Object.fromEntries(
    reads.rule_dimensions.map((name) => [name, 0]),
  );
  for (const row of dimensions.rows) dimensionCounts[row.dimension] = row.count;
  const total = firstOf(totals.rows, 'the issue totals');
  // A site-level finding is one row on the homepage that names a count and a
  // sample of its pages, so the distinct pages it touches cannot be unioned
  // exactly: the total is at least its largest group, never the homepage alone.
  const siteLevelAffected = Math.max(
    0,
    ...siteLevel.rows.map(
      (row) => siteLevelScope(row.rule_id, row.evidence, filters.pageKind)?.affected ?? 0,
    ),
  );
  return {
    issue_count: byClass.defect ?? 0,
    defect_issue_type_count: byClass.defect ?? 0,
    advisory_issue_type_count: byClass.advisory ?? 0,
    occurrence_count: total.occurrences,
    severity_counts: severityCounts,
    dimension_counts: dimensionCounts,
    affected_url_count: Math.max(total.affected, siteLevelAffected),
    monitored_affected_url_count: firstOf(monitored.rows, 'the monitored affected count').monitored,
  };
}

/** The distinct classified page kinds each rule's affected pages carry. */
export async function pageKindsByRule(
  db: Database,
  crawl: Crawl,
  ruleIds: string[] | null,
  findingClass: string | null,
) {
  if (ruleIds?.length === 0) return new Map<string, string[]>();
  const { rows } = await sql<{ rule_id: string; kinds: string[] }>`
    select i.rule_id, array_agg(distinct a.page_kind order by a.page_kind)
      filter (where a.page_kind is not null and a.page_kind <> '') as kinds
    from site_issues i
    join site_page_analyses a on a.workspace_id = i.workspace_id and a.crawl_id = i.crawl_id
      and a.site_url_id = i.site_url_id and a.is_current
    where ${currentIssues(crawl)}
      ${ruleIds ? sql`and i.rule_id = any(${ruleIds}::text[])` : sql``}
      ${findingClass ? sql`and i.finding_class = ${findingClass}` : sql``}
    group by i.rule_id`.execute(db);
  return new Map(rows.map((row) => [row.rule_id, row.kinds ?? []]));
}

export async function issues(
  db: Database,
  workspaceId: string,
  crawlId: string,
  filters: IssueFilters,
  paging: Paging,
  view: IssueView = ALL_SECTIONS_BY_SEVERITY,
) {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const fingerprint = {
    crawl_id: crawl.id,
    query: filters.query?.trim() || null,
    severity: filters.severity,
    category: filters.category,
    dimension: filters.dimension,
    rule: filters.rule,
    site_url_id: filters.siteUrlId,
    page_kind: filters.pageKind,
    finding_class: filters.findingClass,
    section: view.section,
    sort: view.sort,
  };
  const after = decodeGroupCursor(paging.cursor, fingerprint);
  // The unfiltered catalog is persisted once its crawl's issues are final;
  // any other filter, and a crawl not yet published, is computed here. The
  // tab and the ordering cut the listed groups, so the persisted catalog
  // serves every tab.
  const catalog = isUnfiltered(filters)
    ? await persistedCatalog(db, crawl, filters.findingClass)
    : null;
  const [listed, summary] = await Promise.all([
    catalog?.items ?? catalogItems(db, crawl, filters),
    catalog?.summary ?? issueSummary(db, crawl, filters),
  ]);
  const ranked = listed
    .filter((group) => view.section === null || issueSection(group) === view.section)
    .sort(groupOrder(view.sort));
  const start = resumeIndex(ranked, view.sort, after);
  const window = start < 0 ? [] : ranked.slice(start, start + paging.limit + 1);
  const items = window.slice(0, paging.limit);
  const last = items.at(-1);
  return siteIssuesPageSchema.parse({
    items,
    next_cursor: window.length > paging.limit && last ? groupCursorAfter(fingerprint, last) : null,
    summary: { ...summary, section_counts: sectionCounts(listed) },
  });
}

/**
 * Every group `filters` matches as the list shows it, worst first. The
 * catalog writer persists this for the unfiltered read
 * (`site-health/issue-catalog.ts`).
 */
export async function catalogItems(
  db: Database,
  crawl: Crawl,
  filters: IssueFilters,
): Promise<IssueItem[]> {
  const groups = await issueGroups(db, crawl, filters);
  const kinds = await pageKindsByRule(
    db,
    crawl,
    groups.map((group) => group.rule_id),
    filters.findingClass,
  );
  const items = groups.map((group) => ({
    group_id: group.group_id,
    crawl_id: crawl.id,
    rule_id: group.rule_id,
    page_kinds:
      siteLevelScope(group.rule_id, group.evidence)?.pageKinds ?? kinds.get(group.rule_id) ?? [],
    dimension: group.dimension,
    category: group.category,
    severity: group.severity,
    finding_class: group.finding_class,
    title: ruleTitle(group.rule_id),
    description: group.description,
    remediation: group.remediation,
    remediation_route: remediationRoute(group.rule_id),
    affected_url_count: group.affected_url_count,
    analyzer_version: group.analyzer_version,
    rule_version: group.rule_version,
    created_at: group.created_at.toISOString(),
  }));
  return siteIssuesPageSchema.shape.items.parse(items);
}

const catalogSchema = z.object({
  items: siteIssuesPageSchema.shape.items,
  summary: siteIssuesPageSchema.shape.summary.omit({ section_counts: true }),
});

/** The crawl's persisted unfiltered catalog for the class, or null before its issues are final. */
async function persistedCatalog(db: Database, crawl: Crawl, findingClass: string | null) {
  const row = await db
    .selectFrom('site_issue_catalogs')
    .select(['items', 'summary'])
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('finding_class', '=', catalogClassKey(findingClass))
    .executeTakeFirst();
  // A catalog the current contract no longer parses is recomputed, never served or thrown.
  const parsed = row ? catalogSchema.safeParse(row) : null;
  return parsed?.success ? parsed.data : null;
}

export async function issueDetail(
  db: Database,
  workspaceId: string,
  crawlId: string,
  groupId: string,
  paging: Paging,
  siteUrlId?: string,
  /** The catalog's page-kind filter: the rail lists the pages the list row counted. */
  pageKind: string | null = null,
) {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const candidates = await sql<{ rule_id: string; finding_class: string }>`
    select distinct i.rule_id, i.finding_class from site_issues i
    where ${currentIssues(crawl)}`.execute(db);
  const group = candidates.rows.find(
    (row) => issueGroupId(crawl.id, row.rule_id, row.finding_class) === groupId,
  );
  if (group === undefined) throw notFound('Issue');
  const kindFilter = pageKind ? sql`and ${ofPageKind(crawl, pageKind)}` : sql``;
  const inGroup = sql`${currentIssues(crawl)} and i.rule_id = ${group.rule_id}
    and i.finding_class = ${group.finding_class} ${kindFilter}`;
  const fingerprint = {
    crawl_id: crawl.id,
    group_id: groupId,
    site_url_id: siteUrlId ?? null,
    page_kind: pageKind,
  };
  let after = sql``;
  if (paging.cursor) {
    const [url, raw, ...rest] = decodeKeysetCursor(paging.cursor, 'issue_detail', fingerprint);
    const id = parseUuid(raw);
    if (url === undefined || id === null || rest.length > 0)
      throw new InvalidCursorError('invalid cursor');
    after = sql`and (u.normalized_url, i.id) > (${url}, ${id}::uuid)`;
  }
  const [canonical, totals, occurrences] = await Promise.all([
    sql<IssueRow>`select i.*, '' as reason_code from site_issues i where ${inGroup}
      order by i.created_at, i.id limit 1`.execute(db),
    sql<{ affected: number; occurrences: number }>`
      select count(distinct i.site_url_id)::int as affected, count(*)::int as occurrences
      from site_issues i where ${inGroup}`.execute(db),
    sql<
      IssueRow & {
        site_url_id: string;
        normalized_url: string;
        display_url: string;
        title: string | null;
        page_kind: string | null;
      }
    >`
      select i.*, u.normalized_url, u.display_url, u.latest_title as title,
        a.page_kind, e.reason_code
      from site_issues i
      join site_urls u on u.id = i.site_url_id
      join site_page_analyses a on a.workspace_id = i.workspace_id and a.crawl_id = i.crawl_id
        and a.site_url_id = i.site_url_id and a.is_current
      join site_rule_evaluations e on e.analysis_id = i.analysis_id and e.id = i.evaluation_id
      where ${inGroup} ${after} ${siteUrlId ? sql`and i.site_url_id = ${siteUrlId}::uuid` : sql``}
      order by u.normalized_url, i.id limit ${paging.limit + 1}`.execute(db),
  ]);
  const representative = canonical.rows[0];
  if (representative === undefined) throw notFound('Issue');
  const page = occurrences.rows.slice(0, paging.limit);
  const last = page.at(-1);
  const total = firstOf(totals.rows, 'the issue group totals');
  return siteIssueDetailSchema.parse({
    group_id: groupId,
    crawl_id: crawl.id,
    rule_id: representative.rule_id,
    dimension: representative.dimension,
    category: representative.category,
    severity: representative.severity,
    finding_class: representative.finding_class,
    title: ruleTitle(representative.rule_id),
    description: representative.description,
    remediation: representative.remediation,
    remediation_route: remediationRoute(representative.rule_id),
    occurrences: page.map((row) => issueOccurrence(row, row)),
    occurrence_count: total.occurrences,
    affected_url_count:
      siteLevelScope(representative.rule_id, representative.evidence, pageKind)?.affected ??
      total.affected,
    analyzer_version: representative.analyzer_version,
    rule_version: representative.rule_version,
    created_at: representative.created_at.toISOString(),
    next_cursor:
      occurrences.rows.length > paging.limit && last
        ? encodeKeysetCursor('issue_detail', fingerprint, [last.normalized_url, last.id])
        : null,
  });
}
