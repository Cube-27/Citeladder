/**
 * Issue counts and ranked groups over the snapshot's evaluations, reached
 * through its analyses (each names its own evaluations) and the crawl's
 * site-level architecture evaluations. Those run after the snapshot, so its
 * rollups are recomputed once more when they land (`addArchitectureIssues`).
 * Every count is a SQL aggregate: a crawl of tens of thousands of pages holds
 * hundreds of thousands of issues, so no issue row is loaded (CO-7).
 */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { firstOf } from '../lists.ts';
import { issueImpact, siteLevelScope } from './reads/rules.ts';
import type { Crawl } from './site-task.ts';
import { compareText } from '../text-order.ts';

/** The snapshot's issues joined to their evaluations (`i`, `e`). */
function snapshotIssueRows(crawl: Crawl, analysisIds: string[]) {
  return sql`site_issues i
    join site_rule_evaluations e on e.id = i.evaluation_id and e.workspace_id = i.workspace_id
      and e.analysis_id = i.analysis_id and e.rule_id = i.rule_id
    where i.workspace_id = ${crawl.workspace_id} and i.project_id = ${crawl.project_id}
      and i.evaluation_id in (
        select unnest(a.source_evaluation_ids) from site_page_analyses a
        where a.workspace_id = ${crawl.workspace_id} and a.id = any(${analysisIds}::uuid[])
        union all
        select e2.id from site_rule_evaluations e2
        join site_observed_architectures o
          on o.id = e2.source_architecture_id and o.workspace_id = e2.workspace_id
        where o.workspace_id = ${crawl.workspace_id} and o.project_id = ${crawl.project_id}
          and o.crawl_id = ${crawl.id})`;
}

const technicalRow = sql`i.finding_class = 'defect' and 'web_fundamentals' = any(e.score_roles)`;
const readinessRow = sql`'aeo_readiness' = any(e.score_roles)`;

export async function snapshotIssues(db: Database, crawl: Crawl, analysisIds: string[]) {
  const from = snapshotIssueRows(crawl, analysisIds);
  // In order: the caller's transaction is one connection.
  const totals = await sql<{
    issues: number;
    technical: number;
    technical_pages: number;
    readiness: number;
    readiness_pages: number;
  }>`
      select count(*)::int as issues,
        count(*) filter (where ${technicalRow})::int as technical,
        count(distinct i.site_url_id) filter (where ${technicalRow})::int as technical_pages,
        count(*) filter (where ${readinessRow})::int as readiness,
        count(distinct i.site_url_id) filter (where ${readinessRow} and e.scope = 'page')::int
          as readiness_pages
      from ${from}`.execute(db);
  const severities = await sql<{ key: string; count: number }>`
      select i.severity as key, count(*)::int as count from ${from} group by 1`.execute(db);
  const categories = await sql<{ key: string; count: number }>`
      select i.category as key, count(*)::int as count from ${from} group by 1`.execute(db);
  // One representative row per rule group (its first issue by id), its roles and pages.
  const groups = await sql<{
    rule_id: string;
    finding_class: string;
    severity: string;
    category: string;
    description: string;
    remediation: string;
    evidence: unknown;
    roles: string[] | null;
    urls: number;
  }>`
      with matched as (select i.id, i.rule_id, i.finding_class, i.site_url_id, e.score_roles from ${from}),
      grouped as (
        select m.rule_id, m.finding_class, min(m.id::text)::uuid as first_id,
          count(distinct m.site_url_id)::int as urls,
          array_agg(distinct r.role) filter (where r.role is not null) as roles
        from matched m left join lateral unnest(m.score_roles) r(role) on true
        group by m.rule_id, m.finding_class
      )
      select g.rule_id, g.finding_class, i.severity, i.category, i.description, i.remediation,
        i.evidence, g.roles, g.urls
      from grouped g join site_issues i
        on i.workspace_id = ${crawl.workspace_id} and i.id = g.first_id`.execute(db);
  const total = firstOf(totals.rows, 'the snapshot issue totals');
  const counted = (rows: { key: string; count: number }[]) =>
    Object.fromEntries(rows.map((row) => [row.key, row.count]));
  const top = groups.rows
    .map((row) => {
      const impact = issueImpact(row.rule_id, row.finding_class, row.severity);
      return {
        rule_id: row.rule_id,
        finding_class: row.finding_class,
        severity: row.severity,
        category: row.category,
        description: row.description,
        remediation: row.remediation,
        score_roles: (row.roles ?? []).toSorted(compareText),
        // A site-level finding is one row against the homepage; its pages are its evidence.
        affected_pages: siteLevelScope(row.rule_id, row.evidence)?.affected ?? row.urls,
        eligibility_blocker: row.rule_id === 'technical.indexable',
        impact_band: impact.band,
        impact_label: impact.label,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligibility_blocker) - Number(a.eligibility_blocker) ||
        b.impact_band - a.impact_band ||
        Number(b.finding_class === 'defect') - Number(a.finding_class === 'defect') ||
        b.affected_pages - a.affected_pages ||
        compareText(a.rule_id, b.rule_id),
    );
  return {
    issue_count: total.issues,
    severity_counts: counted(severities.rows),
    category_counts: counted(categories.rows),
    top_issues: top.slice(0, policy.site_health.reads.snapshot_top_issues),
    technical_defect_count: total.technical,
    technical_defect_affected_page_count: total.technical_pages,
    aeo_readiness_gap_count: total.readiness,
    aeo_readiness_gap_affected_page_count: total.readiness_pages,
  };
}
