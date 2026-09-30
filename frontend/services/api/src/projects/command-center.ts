/** Compose the overview from existing persisted owners; this read acquires nothing. */
import { commandCenterSchema } from '@citeladder/contracts/opportunities';
import { sql, type Selectable } from 'kysely';
import type { z } from 'zod';

import { frozenComparisonKey } from '../analysis/comparison.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import type { Audits } from '../generated/db-schema.ts';
import { listOpportunities } from '../opportunities/reads.ts';
import { getVisibility, type VisibilityResponse } from '../visibility/dashboard.ts';
import { compareText } from '../text-order.ts';
import type { ProjectScope } from './brand-profile.ts';
import { readProject } from './service.ts';

type View = z.input<typeof commandCenterSchema>;
type Audit = Selectable<Audits>;
const instant = (audit: Audit) => (audit.completed_at ?? audit.created_at).toISOString();
const percent = (value: number | null | undefined) =>
  value == null ? null : Math.round(value * 10000) / 100;
const delta = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : Math.round((a - b) * 100) / 100;
function state(
  at: Date | string | null,
  coverage: string[],
  limitations: string[],
  partial = false,
  freshness: 'current' | 'unknown' = 'unknown',
): View['loop']['connected'] {
  const observed = at instanceof Date ? at.toISOString() : at;
  const observedState = partial ? 'partial' : 'observed';
  return {
    state: observed ? observedState : 'not_run',
    observed_at: observed,
    freshness: observed ? freshness : 'unknown',
    coverage: observed ? coverage : [],
    limitations,
  };
}
async function comparableAudits(db: Database, scope: ProjectScope, auditId: string | null) {
  const audits = await db
    .selectFrom('audits')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('status', '=', 'completed')
    .where('audit_scope', '=', policy.visibility.brand_audit_scope)
    .orderBy('completed_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  const selected = auditId ? audits.find((audit) => audit.id === auditId) : audits[0];
  if (!selected) {
    if (auditId) throw notFound('Completed command-center measurement');
    return null;
  }
  const ids = audits.map((audit) => audit.id);
  const engines = await db
    .selectFrom('audit_engine_snapshots')
    .select(['audit_id', 'logical_engine'])
    .where('audit_id', 'in', ids)
    .execute();
  const prompts = await db
    .selectFrom('audit_prompt_snapshots')
    .select(['audit_id', 'prompt_id', 'text'])
    .where('audit_id', 'in', ids)
    .where('cohort', '=', 'core')
    .execute();
  const engineNames = (id: string) =>
    [
      ...new Set(engines.filter((row) => row.audit_id === id).map((row) => row.logical_engine)),
    ].sort(compareText);
  const identity = (audit: Audit) =>
    JSON.stringify([
      frozenComparisonKey(audit.configuration) || audit.id,
      audit.analyzer_version,
      audit.benchmark_mode,
      engineNames(audit.id),
      [
        ...new Set(
          prompts
            .filter((row) => row.audit_id === audit.id)
            .map((row) => row.prompt_id ?? `text:${row.text}`),
        ),
      ].sort(compareText),
    ]);
  const key = identity(selected);
  const previous =
    audits.find(
      (audit) =>
        audit.id !== selected.id && instant(audit) < instant(selected) && identity(audit) === key,
    ) ?? null;
  return {
    selected,
    previous,
    engines: engineNames(selected.id),
    historical: selected.id !== audits[0]?.id,
  };
}
async function visibility(
  db: Database,
  scope: ProjectScope,
  audit: Audit | null,
): Promise<VisibilityResponse | null> {
  if (!audit) return null;
  return getVisibility(db, scope, {
    auditId: audit.id,
    logicalEngine: null,
    baselineId: null,
    selectionMode: 'run',
    fromAt: null,
    toAt: null,
    configurationKey: null,
    cohort: policy.visibility.core_cohort,
  });
}
function metrics(
  current: VisibilityResponse | null,
  previous: VisibilityResponse | null,
): View['state'] {
  const brand = current?.rankings.find((row) => row.is_brand);
  const prior = previous?.rankings.find((row) => row.is_brand);
  const rank = brand && current ? current.rankings.indexOf(brand) + 1 : null;
  const priorRank = prior && previous ? previous.rankings.indexOf(prior) + 1 : null;
  return {
    visibility: {
      value: current?.visibility_score ?? null,
      delta: delta(current?.visibility_score, previous?.visibility_score),
    },
    share_of_voice: {
      value: percent(brand?.share_of_voice),
      delta: delta(percent(brand?.share_of_voice), percent(prior?.share_of_voice)),
    },
    brand_rank: { value: rank, delta: delta(rank, priorRank) },
  };
}
function movements(
  current: VisibilityResponse | null,
  previous: VisibilityResponse | null,
): View['movements'] {
  if (!previous || !current) return [];
  return current.per_engine
    .flatMap((row) => {
      const prior = previous.per_engine.find((item) => item.logical_engine === row.logical_engine);
      const a = percent(row.brand_mention_rate);
      const b = percent(prior?.brand_mention_rate);
      const change = delta(a, b);
      return change == null || change === 0
        ? []
        : [
            {
              label: row.logical_engine,
              direction: change > 0 ? 'positive' : 'negative',
              current: a,
              previous: b,
              delta: change,
            },
          ];
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);
}
function nextAction(
  actions: View['actions'],
  connected: boolean,
  crawled: boolean,
  tracked: boolean,
  count: number,
): View['next_action'] {
  const action = actions[0];
  if (action)
    return {
      kind: 'opportunity',
      title: action.title,
      href: action.action_id ? `/agent/actions/${action.action_id}` : '/agent/actions',
      opportunity_id: action.id,
    };
  const steps: [boolean, View['next_action']['kind'], string, string][] = [
    [!connected, 'connect', 'Connect GSC or GA4', '/settings?tab=integrations'],
    [!crawled, 'crawl', 'Run the first site crawl', '/site'],
    [count === 0, 'configure_prompts', 'Configure tracking prompts', '/prompts'],
    [!tracked, 'audit', 'Run the first visibility audit', '/runs'],
    [true, 'monitor', 'Monitor — no required action', '/visibility?tab=trends'],
  ];
  const [, kind, title, href] = steps.find(([needed]) => needed)!;
  return { kind, title, href, opportunity_id: null };
}
async function loopEvidence(db: Database, scope: ProjectScope) {
  const mapping = await db
    .selectFrom('integration_property_mappings')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('status', '=', 'active')
    .orderBy('updated_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  const crawl = await db
    .selectFrom('site_crawls')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('status', 'in', ['completed', 'partially_completed'])
    .orderBy('completed_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  const demand = await db
    .selectFrom('demand_snapshots')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  const snapshot = await db
    .selectFrom('opportunity_snapshots')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  const implementation = snapshot
    ? await db
        .selectFrom('opportunity_implementation_events')
        .select('declared_implemented_at')
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('opportunity_snapshot_id', '=', snapshot.id)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst()
    : null;
  return { mapping, crawl, demand, implementation };
}
async function resolvedActions(
  db: Database,
  scope: ProjectScope,
  audits: Awaited<ReturnType<typeof comparableAudits>>,
): Promise<View['resolved_actions']> {
  let query = db
    .selectFrom('actions')
    .innerJoin('opportunity_implementation_events as impl', 'impl.action_id', 'actions.id')
    .innerJoin(
      'opportunity_verification_events as verified',
      'verified.implementation_event_id',
      'impl.id',
    )
    .select([
      'actions.id',
      'actions.target_label',
      sql<Date>`min(verified.created_at)`.as('resolved_at'),
      sql<string>`(array_agg(impl.id order by verified.created_at, verified.id))[1]`.as(
        'implementation_id',
      ),
      sql<string>`(array_agg(verified.id order by verified.created_at, verified.id))[1]`.as(
        'verification_id',
      ),
    ])
    .where('actions.workspace_id', '=', scope.workspaceId)
    .where('actions.project_id', '=', scope.projectId)
    .where('impl.workspace_id', '=', scope.workspaceId)
    .where('impl.project_id', '=', scope.projectId)
    .where('verified.workspace_id', '=', scope.workspaceId)
    .where('verified.project_id', '=', scope.projectId)
    .where('verified.observation_kind', '=', 'verified')
    .groupBy(['actions.id', 'actions.target_label'])
    .orderBy('resolved_at', 'desc');
  if (audits?.previous)
    query = query.having(
      sql<Date>`min(verified.created_at)`,
      '>',
      audits.previous.completed_at ?? audits.previous.created_at,
    );
  if (audits)
    query = query.having(
      sql<Date>`min(verified.created_at)`,
      '<=',
      audits.selected.completed_at ?? audits.selected.created_at,
    );
  const rows = await query.execute();
  return {
    since_audit_id: audits?.previous?.id ?? null,
    count: rows.length,
    titles: rows.slice(0, 5).map((row) => row.target_label),
    evidence: rows.slice(0, 5).map((row) => ({
      action_id: row.id,
      implementation_event_ids: [row.implementation_id],
      verification_event_ids: [row.verification_id],
    })),
  };
}
function trackLimitations(
  audits: Awaited<ReturnType<typeof comparableAudits>>,
  previous: VisibilityResponse | null,
) {
  if (!audits) return ['No visibility audit has run yet.'];
  return previous ? [] : ['No comparable prior audit is available.'];
}
async function measurement(
  db: Database,
  scope: ProjectScope,
  audits: Awaited<ReturnType<typeof comparableAudits>>,
): Promise<View['measurement']> {
  if (!audits) return null;
  const snapshot = await db
    .selectFrom('metric_snapshots')
    .select(['id', 'analyzer_version', 'scoring_rule_version'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('audit_id', '=', audits.selected.id)
    .executeTakeFirstOrThrow();
  return {
    audit_id: audits.selected.id,
    completed_at: instant(audits.selected),
    benchmark_mode: audits.selected.benchmark_mode,
    logical_engines: audits.engines,
    comparable_audit_id: audits.previous?.id ?? null,
    metric_snapshot_id: snapshot.id,
    analyzer_version: snapshot.analyzer_version,
    scoring_rule_version: snapshot.scoring_rule_version,
  };
}
export async function commandCenter(
  db: Database,
  scope: ProjectScope,
  auditId: string | null,
): Promise<View> {
  const project = await readProject(db, scope);
  const audits = await comparableAudits(db, scope, auditId);
  const current = await visibility(db, scope, audits?.selected ?? null);
  const previous = await visibility(db, scope, audits?.previous ?? null);
  const opportunities = await listOpportunities(
    db,
    scope,
    { type: null, severity: null, status: null, rule_id: null, min_priority: null },
    { limit: 8, cursor: null },
  );
  const order = await db
    .selectFrom('opportunity_orders')
    .select('version')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  const profile = await db
    .selectFrom('brand_profiles')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .executeTakeFirst();
  const { mapping, crawl, demand, implementation } = await loopEvidence(db, scope);
  const counted = await db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
    .select(sql<string>`count(*)`.as('count'))
    .where('projects.workspace_id', '=', scope.workspaceId)
    .where('projects.id', '=', scope.projectId)
    .where('prompts.status', '=', 'active')
    .where('prompts.enabled', '=', true)
    .executeTakeFirstOrThrow();
  const count = Number(counted.count);
  const times = [crawl?.completed_at, demand?.created_at].filter((at): at is Date => at != null);
  const analyzedAt = times.length ? new Date(Math.max(...times.map((at) => at.getTime()))) : null;
  const currentBrand = current?.rankings.find((row) => row.is_brand);
  const priorBrand = previous?.rankings.find((row) => row.is_brand);
  return {
    project: {
      id: project.id,
      name: project.name,
      brand_name: project.brand_name,
      website_url: project.website_url,
    },
    facts: {
      industry: project.industry,
      description: profile?.description ?? '',
      positioning: profile?.positioning ?? '',
      target_audience: profile?.target_audience ?? '',
      products_services: projectSchemaStrings(profile?.products_services ?? []),
      competitors: project.competitors.map((row) => ({
        id: row.id,
        name: row.name,
        domains: row.domains,
      })),
    },
    loop: {
      connected: state(
        mapping?.updated_at ?? null,
        mapping ? [mapping.provider] : [],
        mapping ? [] : ['No GSC or GA4 property is connected.'],
        false,
        'current',
      ),
      analyzed: state(
        analyzedAt,
        [...(crawl ? ['site_health'] : []), ...(demand ? ['search_demand'] : [])],
        crawl && !demand ? ['Search Demand is not connected or has not refreshed yet.'] : [],
        Boolean(crawl) !== Boolean(demand),
      ),
      acted: state(
        implementation?.declared_implemented_at ?? null,
        implementation ? ['current_opportunity_cycle'] : [],
        implementation
          ? []
          : ['No implementation is declared for the current opportunity snapshot.'],
      ),
      tracked: state(
        audits ? instant(audits.selected) : null,
        audits?.engines ?? [],
        audits ? [] : ['No visibility audit has run yet.'],
        false,
        audits?.historical ? 'unknown' : 'current',
      ),
    },
    active_prompt_count: count,
    next_action: nextAction(
      opportunities.items,
      Boolean(mapping),
      Boolean(crawl),
      Boolean(audits),
      count,
    ),
    track: {
      citation_share: {
        value: percent(currentBrand?.citation_rate),
        delta: delta(percent(currentBrand?.citation_rate), percent(priorBrand?.citation_rate)),
      },
      engine_coverage: audits?.engines.length ?? 0,
      observed_at: audits ? instant(audits.selected) : null,
      limitations: trackLimitations(audits, previous),
    },
    measurement: await measurement(db, scope, audits),
    state: metrics(current, previous),
    movements: movements(current, previous),
    actions: opportunities.items,
    action_order_version: order?.version ?? 0,
    resolved_actions: await resolvedActions(db, scope, audits),
    report_available: Boolean(audits),
    stale: audits?.historical ?? false,
  };
}
function projectSchemaStrings(value: unknown) {
  return commandCenterSchema.shape.facts.shape.products_services.parse(value);
}
