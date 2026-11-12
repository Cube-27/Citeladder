/**
 * Issue state: each issue's lifecycle across audits, kept per project, page and
 * rule in `site_issue_states`, and the project's open count per day in
 * `site_issue_trend` (SH-B2, SH-B8, SH-B9).
 *
 * An audit lands when a crawl publishes its pages' final analyses (a full
 * crawl, a cancelled one, or a single-page rerun). In that transaction every
 * page the crawl audited moves its issues' states:
 *
 * - a page analyzed at its own URL opens or keeps what it found, resolves what
 *   a determinate evaluation now passes, and reopens a resolved issue as
 *   regressed; a rule the audit did not evaluate keeps its state;
 * - a page that answered 404/410, or redirected, gets that issue instead, and
 *   its other unresolved issues read `page_unavailable`, never resolved;
 * - a page whose fetch failed otherwise was not audited, and keeps every state.
 *
 * A page's newest audit decides: an audit older than one the page already
 * landed changes nothing. Mark fixed (`markIssueFixed`) moves an open issue to
 * `marked_fixed`; only a later audit resolves or reopens it. The day's trend point is the project's open count
 * after the landing. States are a derived projection with the exact issue,
 * evaluation, analysis or fetch attempt that decided them; issues, evaluations
 * and attempts stay as written.
 */
import { randomUUID } from 'node:crypto';
import { sql, type Insertable, type Selectable } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { SiteIssueStates } from '../generated/db-schema.ts';
import { failedAs } from './task-outcome.ts';
import type { Crawl } from './site-task.ts';
import { canonicalIdentity } from './url-identity.ts';

const config = policy.site_health.reads.issue_states;
const UNAVAILABLE_RULES = config.unavailable_rules;
const AVAILABILITY_RULES = new Set<string>(Object.values(UNAVAILABLE_RULES));
const RESOLVING = new Set<string>(config.resolving_outcomes);
const GONE_STATUSES = policy.site_health.reads.task_outcomes.gone_status_codes;
const RULE_VERSIONS = new Map(
  policy.site_health.rule_catalog.map((rule) => [rule.rule_id, rule.rule_version]),
);

type IssueState =
  | 'open'
  | 'marked_fixed'
  | 'resolved'
  | 'regressed'
  | 'page_unavailable'
  | 'no_longer_tracked';

type StateRow = Selectable<SiteIssueStates>;
/** What decided a state: exactly one audit's evidence, by id. */
type Source = {
  analysisId: string | null;
  attemptId: string | null;
  evaluationId: string | null;
  issueId: string | null;
};
type Finding = { issueId: string; evaluationId: string; ruleVersion: string };

/** One page's outcome in one audit. */
type PageAudit =
  | {
      kind: 'analyzed';
      siteUrlId: string;
      analysisId: string;
      /** Rules with a current issue on the page. */
      found: ReadonlyMap<string, Finding>;
      /** Rules a determinate evaluation passed: the evaluation that verified each. */
      passed: ReadonlyMap<string, { evaluationId: string; ruleVersion: string }>;
    }
  | {
      kind: 'unavailable';
      siteUrlId: string;
      reason: keyof typeof UNAVAILABLE_RULES;
      analysisId: string | null;
      attemptId: string | null;
      evidence: Record<string, unknown>;
    };

type Landing = {
  crawlId: string;
  auditAt: Date;
  analyzerVersion: string;
  now: Date;
};
type Scope = { workspaceId: string; projectId: string };

const isResolved = (state: string) => state === 'resolved';

const NO_SOURCE: Source = {
  analysisId: null,
  attemptId: null,
  evaluationId: null,
  issueId: null,
};

/** One page's state rows as an audit decides them, given the page's existing states. */
function pageStates(
  scope: Scope,
  siteUrlId: string,
  existing: readonly StateRow[],
  landing: Landing,
) {
  const byRule = new Map(existing.map((row) => [row.rule_id, row]));
  const rows: Insertable<SiteIssueStates>[] = [];
  const write = (
    ruleId: string,
    state: IssueState,
    source: Source,
    extra: {
      ruleVersion?: string;
      evidence?: Record<string, unknown> | null;
      seen?: boolean;
    },
  ) => {
    const prior = byRule.get(ruleId);
    const at = landing.auditAt;
    rows.push({
      id: prior?.id ?? randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      site_url_id: siteUrlId,
      rule_id: ruleId,
      state,
      first_seen_at: prior?.first_seen_at ?? at,
      last_seen_at: extra.seen ? at : (prior?.last_seen_at ?? at),
      resolved_at: state === 'resolved' ? at : null,
      marked_fixed_at: prior?.marked_fixed_at ?? null,
      last_audit_at: at,
      source_crawl_id: landing.crawlId,
      source_analysis_id: source.analysisId,
      source_attempt_id: source.attemptId,
      source_evaluation_id: source.evaluationId,
      // The issue that last found it stays named until another one does.
      source_issue_id: source.issueId ?? prior?.source_issue_id ?? null,
      evidence:
        extra.evidence === undefined
          ? (prior?.evidence ?? null)
          : extra.evidence && JSON.stringify(extra.evidence),
      rule_version: extra.ruleVersion ?? prior?.rule_version ?? RULE_VERSIONS.get(ruleId) ?? '',
      analyzer_version: landing.analyzerVersion,
      policy_version: config.policy_version,
      created_at: prior?.created_at ?? landing.now,
      updated_at: landing.now,
    });
  };
  /**
   * The state a rule takes when this audit finds it: a resolved issue found
   * again regressed. A page fetched before the person marked it fixed cannot
   * judge that fix, so the mark stands until a later audit decides.
   */
  const found = (ruleId: string): IssueState => {
    const prior = byRule.get(ruleId);
    if (
      prior?.state === 'marked_fixed' &&
      prior.marked_fixed_at &&
      prior.marked_fixed_at > landing.auditAt
    )
      return 'marked_fixed';
    return prior?.state === 'resolved' || prior?.state === 'regressed' ? 'regressed' : 'open';
  };
  const resolve = (ruleId: string, source: Source, ruleVersion?: string) => {
    const prior = byRule.get(ruleId);
    if (prior && !isResolved(prior.state)) write(ruleId, 'resolved', source, { ruleVersion });
  };
  return { rows, write, found, resolve };
}

/**
 * The rows one page's audit writes, given the page's existing states. Pure: the
 * caller has already decided this audit is the page's newest.
 */
function nextIssueStates(
  scope: Scope,
  audit: PageAudit,
  existing: readonly StateRow[],
  landing: Landing,
): Insertable<SiteIssueStates>[] {
  const states = pageStates(scope, audit.siteUrlId, existing, landing);
  if (audit.kind === 'analyzed') analyzedStates(states, audit, existing);
  else unavailableStates(states, audit, existing);
  return states.rows;
}

type PageStates = ReturnType<typeof pageStates>;
type Analyzed = Extract<PageAudit, { kind: 'analyzed' }>;
type Unavailable = Extract<PageAudit, { kind: 'unavailable' }>;

/** A page analyzed at its own URL: what it found opens, what it passed resolves. */
function analyzedStates(
  { write, found, resolve }: PageStates,
  audit: Analyzed,
  existing: readonly StateRow[],
) {
  const page = { ...NO_SOURCE, analysisId: audit.analysisId };
  for (const [ruleId, finding] of audit.found)
    write(
      ruleId,
      found(ruleId),
      { ...page, evaluationId: finding.evaluationId, issueId: finding.issueId },
      { ruleVersion: finding.ruleVersion, seen: true },
    );
  for (const [ruleId, passed] of audit.passed)
    if (!audit.found.has(ruleId))
      resolve(ruleId, { ...page, evaluationId: passed.evaluationId }, passed.ruleVersion);
  // Answering at its own URL is the verification for the availability issues.
  for (const ruleId of AVAILABILITY_RULES) resolve(ruleId, page);
  // The page answers again: an issue this audit did not judge is open, not verified.
  const judged = (ruleId: string) => audit.found.has(ruleId) || audit.passed.has(ruleId);
  for (const prior of existing)
    if (prior.state === 'page_unavailable' && !judged(prior.rule_id))
      write(prior.rule_id, 'open', page, {});
}

/** A page that answered 404/410 or redirected: that issue opens, the rest read unavailable. */
function unavailableStates(
  { write, found, resolve }: PageStates,
  audit: Unavailable,
  existing: readonly StateRow[],
) {
  const source = { ...NO_SOURCE, analysisId: audit.analysisId, attemptId: audit.attemptId };
  const ruleId = UNAVAILABLE_RULES[audit.reason];
  write(ruleId, found(ruleId), source, { evidence: audit.evidence, seen: true });
  for (const other of AVAILABILITY_RULES) if (other !== ruleId) resolve(other, source);
  for (const prior of existing)
    if (
      !AVAILABILITY_RULES.has(prior.rule_id) &&
      !isResolved(prior.state) &&
      prior.state !== 'page_unavailable'
    )
      write(prior.rule_id, 'page_unavailable', source, {});
}

/** When a crawl audited its pages: the crawl's audit time, as its analyses record. */
const auditTime = (crawl: Crawl) => new Date(crawl.started_at ?? crawl.created_at);

/** Whether the artifact's final URL is another page than the one tracked. */
function redirected(finalUrl: string, trackedHash: string) {
  try {
    return canonicalIdentity(finalUrl).hash !== trackedHash;
  } catch {
    // An unparseable final URL is no evidence of a redirect.
    return false;
  }
}

/** Every page the crawl audited, with what the audit found. */
async function pageAudits(db: Database, crawl: Crawl): Promise<PageAudit[]> {
  const analyses = await db
    .selectFrom('site_page_analyses as a')
    .innerJoin('site_fetch_artifacts as f', (join) =>
      join.onRef('f.id', '=', 'a.artifact_id').onRef('f.workspace_id', '=', 'a.workspace_id'),
    )
    .innerJoin('site_urls as u', (join) =>
      join.onRef('u.id', '=', 'a.site_url_id').onRef('u.workspace_id', '=', 'a.workspace_id'),
    )
    .select(['a.id', 'a.site_url_id', 'a.source_evaluation_ids', 'f.final_url', 'u.url_hash'])
    .where('a.workspace_id', '=', crawl.workspace_id)
    .where('a.crawl_id', '=', crawl.id)
    .where('a.is_current', '=', true)
    .where('a.finalized_at', 'is not', null)
    .where('a.status', '=', 'completed')
    .execute();
  const audits: PageAudit[] = [];
  const analyzed = analyses.filter((row) => {
    if (!redirected(row.final_url, row.url_hash)) return true;
    audits.push({
      kind: 'unavailable',
      siteUrlId: row.site_url_id,
      reason: 'redirect',
      analysisId: row.id,
      attemptId: null,
      evidence: { final_url: row.final_url },
    });
    return false;
  });
  audits.push(...(await analyzedAudits(db, crawl, analyzed)), ...(await goneAudits(db, crawl)));
  return audits;
}

type AnalysisRow = {
  id: string;
  site_url_id: string;
  source_evaluation_ids: string[] | null;
};

async function analyzedAudits(
  db: Database,
  crawl: Crawl,
  analyses: readonly AnalysisRow[],
): Promise<PageAudit[]> {
  if (!analyses.length) return [];
  const current = new Map(analyses.map((row) => [row.site_url_id, row]));
  const pageIds = [...current.keys()];
  // The page's own evaluations: those its current analysis names, plus the
  // site-level findings later written against it. Site checks every analysis
  // names belong to the root page and are judged there.
  const evaluations = await db
    .selectFrom('site_rule_evaluations as e')
    .innerJoin('site_page_analyses as p', (join) =>
      join.onRef('p.id', '=', 'e.analysis_id').onRef('p.workspace_id', '=', 'e.workspace_id'),
    )
    .select([
      'e.id',
      'e.analysis_id',
      'e.rule_id',
      'e.outcome',
      'e.rule_version',
      'e.source_architecture_id',
      'p.site_url_id',
    ])
    .where('e.workspace_id', '=', crawl.workspace_id)
    .where('p.crawl_id', '=', crawl.id)
    .where('p.site_url_id', '=', sql<string>`any(${pageIds}::uuid[])`)
    .orderBy('e.id')
    .execute();
  const issues = await db
    .selectFrom('site_issues')
    .select(['id', 'site_url_id', 'rule_id', 'evaluation_id', 'rule_version'])
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('is_current', '=', true)
    .where('site_url_id', '=', sql<string>`any(${pageIds}::uuid[])`)
    .orderBy('id')
    .execute();
  const audits = new Map(
    analyses.map((row) => [
      row.site_url_id,
      {
        kind: 'analyzed' as const,
        siteUrlId: row.site_url_id,
        analysisId: row.id,
        found: new Map<string, Finding>(),
        passed: new Map<string, { evaluationId: string; ruleVersion: string }>(),
      },
    ]),
  );
  for (const issue of issues) {
    const audit = audits.get(issue.site_url_id);
    if (audit && !audit.found.has(issue.rule_id))
      audit.found.set(issue.rule_id, {
        issueId: issue.id,
        evaluationId: issue.evaluation_id,
        ruleVersion: issue.rule_version,
      });
  }
  const namedIds = new Set(analyses.flatMap((row) => row.source_evaluation_ids ?? []));
  for (const row of evaluations) {
    const analysis = current.get(row.site_url_id);
    const audit = audits.get(row.site_url_id);
    // Evaluations are already the page's own, so a named id is its current analysis's.
    const named =
      namedIds.has(row.id) ||
      (row.source_architecture_id !== null && row.analysis_id === analysis?.id);
    if (audit && named && RESOLVING.has(row.outcome))
      audit.passed.set(row.rule_id, {
        evaluationId: row.id,
        ruleVersion: row.rule_version,
      });
  }
  return [...audits.values()];
}

/** Pages whose newest analyze generation in the crawl failed with 404/410. */
async function goneAudits(db: Database, crawl: Crawl): Promise<PageAudit[]> {
  const rows = await db
    .selectFrom((query) =>
      query
        .selectFrom('site_crawl_tasks')
        .select(['id', 'workspace_id', 'site_url_id', 'status', 'error_code'])
        .distinctOn('site_url_id')
        .where('workspace_id', '=', crawl.workspace_id)
        .where('crawl_id', '=', crawl.id)
        .where('task_kind', '=', 'analyze')
        .where('site_url_id', 'is not', null)
        .orderBy('site_url_id')
        .orderBy('generation', 'desc')
        .orderBy('id', 'desc')
        .as('t'),
    )
    .select([
      't.site_url_id',
      sql<string | null>`(select a.id from site_fetch_attempts a
        where a.task_id = t.id and a.workspace_id = t.workspace_id
          and a.status_code = any(${GONE_STATUSES}::int[])
        order by a.attempt_number desc, a.request_ordinal desc limit 1)`.as('attempt_id'),
      sql<number | null>`(select a.status_code from site_fetch_attempts a
        where a.task_id = t.id and a.workspace_id = t.workspace_id
          and a.status_code = any(${GONE_STATUSES}::int[])
        order by a.attempt_number desc, a.request_ordinal desc limit 1)`.as('status_code'),
    ])
    .where('t.status', '=', 'failed')
    .where(failedAs('t', ['gone']))
    .where(
      sql<boolean>`not exists (
      select 1 from site_page_analyses p
      where p.workspace_id = t.workspace_id and p.crawl_id = ${crawl.id}
        and p.site_url_id = t.site_url_id and p.is_current and p.finalized_at is not null)`,
    )
    .execute();
  return rows.flatMap((row) =>
    row.site_url_id
      ? [
          {
            kind: 'unavailable' as const,
            siteUrlId: row.site_url_id,
            reason: 'gone' as const,
            analysisId: null,
            attemptId: row.attempt_id,
            evidence: { status_code: row.status_code },
          },
        ]
      : [],
  );
}

/** Pages a newer audit of another crawl already decided. */
async function newerAudited(db: Database, crawl: Crawl, pageIds: string[], auditAt: Date) {
  const rows = await db
    .selectFrom('site_page_analyses as a')
    .innerJoin('site_crawls as c', (join) =>
      join.onRef('c.id', '=', 'a.crawl_id').onRef('c.workspace_id', '=', 'a.workspace_id'),
    )
    .select('a.site_url_id')
    .distinct()
    .where('a.workspace_id', '=', crawl.workspace_id)
    .where('a.project_id', '=', crawl.project_id)
    .where('a.site_url_id', '=', sql<string>`any(${pageIds}::uuid[])`)
    .where('a.crawl_id', '!=', crawl.id)
    .where('a.is_current', '=', true)
    .where('a.finalized_at', 'is not', null)
    .where(sql<boolean>`coalesce(c.started_at, c.created_at) > ${auditAt}`)
    .execute();
  return new Set(rows.map((row) => row.site_url_id));
}

/**
 * Land the crawl's audit: move the audited pages' issue states and write the
 * day's open count. The caller owns the transaction; a project lock orders
 * landings of the same project. Replaying a landing writes the same states.
 */
export async function landIssueStates(db: Database, crawl: Crawl): Promise<void> {
  const audits = await pageAudits(db, crawl);
  if (!audits.length) return;
  await lockIssueStates(db, { workspaceId: crawl.workspace_id, projectId: crawl.project_id });
  const scope = {
    workspaceId: crawl.workspace_id,
    projectId: crawl.project_id,
  };
  const auditAt = auditTime(crawl);
  const now = new Date();
  const landing = {
    crawlId: crawl.id,
    auditAt,
    analyzerVersion: crawl.analyzer_version || policy.site_health.versions.analyzer,
    now,
  };
  const pageIds = audits.map((audit) => audit.siteUrlId);
  const existing = await db
    .selectFrom('site_issue_states')
    .selectAll()
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('site_url_id', '=', sql<string>`any(${pageIds}::uuid[])`)
    .execute();
  const byPage = new Map<string, StateRow[]>();
  for (const row of existing)
    byPage.set(row.site_url_id, [...(byPage.get(row.site_url_id) ?? []), row]);
  const newer = await newerAudited(db, crawl, pageIds, auditAt);
  const rows = audits.flatMap((audit) => {
    const states = byPage.get(audit.siteUrlId) ?? [];
    if (newer.has(audit.siteUrlId) || states.some((row) => row.last_audit_at > auditAt)) return [];
    return nextIssueStates(scope, audit, states, landing);
  });
  // Chunked only to stay under PostgreSQL's 65535 bind-parameter limit.
  const chunk = Math.floor(65_535 / Object.keys(rows[0] ?? { id: '' }).length);
  for (let offset = 0; offset < rows.length; offset += chunk)
    await db // NOSONAR: in order in the caller's one landing transaction.
      .insertInto('site_issue_states')
      .values(rows.slice(offset, offset + chunk))
      .onConflict((conflict) =>
        conflict
          .columns(['workspace_id', 'project_id', 'site_url_id', 'rule_id'])
          .doUpdateSet((eb) => ({
            state: eb.ref('excluded.state'),
            last_seen_at: eb.ref('excluded.last_seen_at'),
            resolved_at: eb.ref('excluded.resolved_at'),
            last_audit_at: eb.ref('excluded.last_audit_at'),
            source_crawl_id: eb.ref('excluded.source_crawl_id'),
            source_analysis_id: eb.ref('excluded.source_analysis_id'),
            source_attempt_id: eb.ref('excluded.source_attempt_id'),
            source_evaluation_id: eb.ref('excluded.source_evaluation_id'),
            source_issue_id: eb.ref('excluded.source_issue_id'),
            evidence: eb.ref('excluded.evidence'),
            rule_version: eb.ref('excluded.rule_version'),
            analyzer_version: eb.ref('excluded.analyzer_version'),
            policy_version: eb.ref('excluded.policy_version'),
            updated_at: eb.ref('excluded.updated_at'),
          }))
          .where((eb) =>
            eb('site_issue_states.last_audit_at', '<=', eb.ref('excluded.last_audit_at')),
          ),
      )
      .execute();
  await writeTrendPoint(db, crawl, now);
}

/** Orders a project's landings and marks: each reads the states the one before it wrote. */
const lockIssueStates = (db: Database, scope: Scope) =>
  subjectXactLock(db, `site-issue-states:${scope.workspaceId}:${scope.projectId}`);

/**
 * Mark fixed (SH-B12): the person says they fixed `ruleId` on these pages. An
 * open or regressed issue reads `marked_fixed` until an audit fetched after the
 * mark decides it; nothing else moves, and only an audit resolves it. A page
 * already marked keeps its first mark. Returns the pages it marked. The caller
 * owns the transaction. The open count is unchanged (`marked_fixed` is open), so
 * no trend point moves.
 */
export async function markIssueFixed(
  db: Database,
  scope: Scope & { ruleId: string; siteUrlIds: readonly string[] },
): Promise<string[]> {
  if (!scope.siteUrlIds.length) return [];
  await lockIssueStates(db, scope);
  const now = new Date();
  const rows = await db
    .updateTable('site_issue_states')
    .set({ state: 'marked_fixed', marked_fixed_at: now, updated_at: now })
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('rule_id', '=', scope.ruleId)
    .where('site_url_id', '=', sql<string>`any(${scope.siteUrlIds}::uuid[])`)
    .where('state', 'in', ['open', 'regressed'])
    .returning('site_url_id')
    .execute();
  return rows.map((row) => row.site_url_id);
}

/** The project's open issue count after this landing, as today's trend point. */
async function writeTrendPoint(db: Database, crawl: Crawl, now: Date) {
  await sql`
    insert into site_issue_trend
      (id, workspace_id, project_id, day, open_count, source_crawl_id, policy_version,
       created_at, updated_at)
    select ${randomUUID()}, ${crawl.workspace_id}, ${crawl.project_id},
      (${now}::timestamptz at time zone 'UTC')::date, count(*)::int, ${crawl.id},
      ${config.policy_version}, ${now}, ${now}
    from site_issue_states s
    where s.workspace_id = ${crawl.workspace_id} and s.project_id = ${crawl.project_id}
      and s.state = any(${config.open_states}::text[])
    on conflict (workspace_id, project_id, day) do update set
      open_count = excluded.open_count,
      source_crawl_id = excluded.source_crawl_id,
      policy_version = excluded.policy_version,
      updated_at = excluded.updated_at`.execute(db);
}
