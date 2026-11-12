/**
 * Mark fixed and Re-run all (SH-B12): acting on one issue across the pages a
 * crawl found it on, and how far its fix has come ("N of M pages fixed").
 *
 * An issue is a crawl's issue group (one rule and finding class). Its pages are
 * those the crawl's current issues of that group name; each page's state for
 * the rule is its `site_issue_states` row (`issue-states.ts`), so marks and
 * every later audit, a single-page or Re-run-all re-audit included, move the
 * progress without rewriting the crawl's issues. Fixed counts pages marked fixed
 * or resolved; only an audit resolves one.
 */
import type { IssueFixes, IssueFixProgress } from '@citeladder/contracts/site-health';
import { sql } from 'kysely';

import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { markIssueFixed } from './issue-states.ts';
import { crawlError } from './planner-policy.ts';
import { loadCrawl, type Crawl } from './reads/crawl.ts';
import { issueGroupId } from './reads/rules.ts';
import { rerunTrackedPages } from './selection.ts';

const FIXED_STATES = ['marked_fixed', 'resolved'];

/**
 * The crawl's current issues, each with its page's state for the rule, whether
 * the page is tracked, and whether a site-level (architecture) evaluation found
 * it: a page re-audit never judges those, only a full crawl does.
 */
const issuePagesFrom = (crawl: Crawl) => sql`
  from site_issues i
  join site_rule_evaluations e on e.id = i.evaluation_id and e.workspace_id = i.workspace_id
  left join site_issue_states s on s.workspace_id = i.workspace_id
    and s.project_id = i.project_id and s.site_url_id = i.site_url_id and s.rule_id = i.rule_id
  left join monitored_site_urls m on m.workspace_id = i.workspace_id
    and m.project_id = i.project_id and m.site_url_id = i.site_url_id and m.active
  where i.workspace_id = ${crawl.workspace_id} and i.crawl_id = ${crawl.id} and i.is_current`;

/** A page Re-run all re-audits: tracked, not yet resolved, judged by a page audit. */
const rerunnable = sql`m.id is not null and s.state is distinct from 'resolved'
  and e.source_architecture_id is null`;

/** Every issue group's fix progress in the crawl. */
export async function issueFixes(
  db: Database,
  workspaceId: string,
  crawlId: string,
): Promise<IssueFixes> {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const rows = await sql<{
    rule_id: string;
    finding_class: string;
    affected: number;
    fixed: number;
    verified: number;
    rerun: number;
  }>`
    select i.rule_id, i.finding_class,
      count(distinct i.site_url_id)::int as affected,
      count(distinct i.site_url_id) filter (where s.state = any(${FIXED_STATES}::text[]))::int as fixed,
      count(distinct i.site_url_id) filter (where s.state = 'resolved')::int as verified,
      count(distinct i.site_url_id) filter (where ${rerunnable})::int as rerun
    ${issuePagesFrom(crawl)}
    group by i.rule_id, i.finding_class
    order by i.rule_id, i.finding_class`.execute(db);
  return {
    crawl_id: crawl.id,
    items: rows.rows.map((row) => ({
      group_id: issueGroupId(crawl.id, row.rule_id, row.finding_class),
      affected_url_count: row.affected,
      fixed_url_count: row.fixed,
      verified_url_count: row.verified,
      rerun_url_count: row.rerun,
    })),
  };
}

type IssuePage = { site_url_id: string; state: string | null; rerunnable: boolean };

/** The group a crawl's group id names, with each of its pages; 404 when the crawl has none. */
async function issueGroup(db: Database, crawl: Crawl, groupId: string) {
  const groups = await sql<{ rule_id: string; finding_class: string }>`
    select distinct i.rule_id, i.finding_class ${issuePagesFrom(crawl)}`.execute(db);
  const group = groups.rows.find(
    (row) => issueGroupId(crawl.id, row.rule_id, row.finding_class) === groupId,
  );
  if (group === undefined) throw notFound('Issue');
  const pages = await sql<IssuePage>`
    select i.site_url_id, s.state, bool_and(${rerunnable}) as rerunnable
    ${issuePagesFrom(crawl)}
      and i.rule_id = ${group.rule_id} and i.finding_class = ${group.finding_class}
    group by i.site_url_id, s.state
    order by i.site_url_id`.execute(db);
  return { ruleId: group.rule_id, pages: pages.rows };
}

/**
 * Mark the issue fixed on every page it is open or regressed on. Returns the
 * issue's progress after the mark. The caller owns the transaction.
 */
export async function markIssueGroupFixed(
  db: Database,
  workspaceId: string,
  crawlId: string,
  groupId: string,
): Promise<IssueFixProgress> {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const group = await issueGroup(db, crawl, groupId);
  await markIssueFixed(db, {
    workspaceId,
    projectId: crawl.project_id,
    ruleId: group.ruleId,
    siteUrlIds: group.pages.map((page) => page.site_url_id),
  });
  const progress = (await issueFixes(db, workspaceId, crawlId)).items.find(
    (item) => item.group_id === groupId,
  );
  if (progress === undefined) throw notFound('Issue');
  return progress;
}

/**
 * Re-run all: re-audit every tracked page the issue is still unresolved on as
 * one crawl, holding one page fetch per page. A running crawl refuses it
 * (SH-B4), as does an issue with no such page. The caller owns the transaction.
 */
export async function rerunIssueGroup(
  db: Database,
  workspaceId: string,
  crawlId: string,
  groupId: string,
) {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  const group = await issueGroup(db, crawl, groupId);
  const rerun = await rerunTrackedPages(db, workspaceId, crawl.project_id, (tracked) => {
    const members = new Set(tracked);
    // `tracked` is read under the control locks, so the set cannot change under the crawl.
    const pages = group.pages
      .filter((page) => page.rerunnable && members.has(page.site_url_id))
      .map((page) => page.site_url_id);
    if (!pages.length)
      crawlError(
        'No tracked page this issue is still open on can be re-audited; a full crawl checks it',
        'rerun_not_allowed',
        409,
      );
    return pages;
  });
  return { crawl_id: rerun.id, page_count: rerun.admitted_url_count };
}
