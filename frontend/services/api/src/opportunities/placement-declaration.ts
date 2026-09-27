/** Declaration-time placement intent; Python inspection owns later observations. */
import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { OpportunityImplementationEvents } from '../generated/db-schema.ts';
import { normalizeDomain } from '../analysis/domains.ts';
import { parseUuid } from '../http/uuid.ts';
import type { MemberCheck } from './declaration-checks.ts';
import { stableKey } from './projection.ts';

const p = policy.opportunity.placement;

export async function openPlacementCheck(
  db: Database,
  declaration: Selectable<OpportunityImplementationEvents>,
  { check, member }: MemberCheck,
) {
  const hash = String(check.url_hash ?? '');
  if (!hash) return;
  const page = await db
    .selectFrom('source_pages')
    .select('id')
    .where('workspace_id', '=', declaration.workspace_id)
    .where('project_id', '=', declaration.project_id)
    .where('url_hash', '=', hash)
    .executeTakeFirst();
  if (!page) return;
  const requestedBaseline =
    typeof check.baseline_snapshot_id === 'string' ? parseUuid(check.baseline_snapshot_id) : null;
  const baseline = requestedBaseline
    ? await db
        .selectFrom('source_page_snapshots')
        .select('id')
        .where('workspace_id', '=', declaration.workspace_id)
        .where('project_id', '=', declaration.project_id)
        .where('source_page_id', '=', page.id)
        .where('id', '=', requestedBaseline)
        .executeTakeFirst()
    : null;
  const presence = baseline
    ? await db
        .selectFrom('source_page_entity_presences')
        .select('roster_version')
        .where('workspace_id', '=', declaration.workspace_id)
        .where('project_id', '=', declaration.project_id)
        .where('snapshot_id', '=', baseline.id)
        .orderBy('id')
        .limit(1)
        .executeTakeFirst()
    : null;
  const project = await db
    .selectFrom('projects')
    .select('website_url')
    .where('workspace_id', '=', declaration.workspace_id)
    .where('id', '=', declaration.project_id)
    .executeTakeFirstOrThrow();
  const domains = await db
    .selectFrom('owned_domains as domain')
    .innerJoin('projects as project', 'project.id', 'domain.project_id')
    .select('domain.domain')
    .where('project.workspace_id', '=', declaration.workspace_id)
    .where('domain.project_id', '=', declaration.project_id)
    .execute();
  const owned = [
    ...new Set(
      [project.website_url, ...domains.map((row) => row.domain)]
        .map(normalizeDomain)
        .filter(Boolean),
    ),
  ].sort();
  const now = new Date();
  const declaredAt = db
    .selectFrom('opportunity_implementation_events')
    .select('declared_implemented_at')
    .where('workspace_id', '=', declaration.workspace_id)
    .where('project_id', '=', declaration.project_id)
    .where('id', '=', declaration.id);
  await db
    .insertInto('placement_checks')
    .values({
      id: randomUUID(),
      workspace_id: declaration.workspace_id,
      project_id: declaration.project_id,
      implementation_event_id: declaration.id,
      opportunity_stable_key: stableKey(member),
      rule_id: member.rule_id,
      source_page_id: page.id,
      url_hash: hash,
      expected_change: String(check.expected_change ?? ''),
      expected_detail: JSON.stringify({
        brand_name: check.brand_name ?? '',
        owned_domains: owned,
        discrepancies: check.discrepancies ?? [],
        deterioration: check.deterioration ?? [],
      }),
      baseline_snapshot_id: baseline?.id ?? null,
      baseline_roster_version: presence?.roster_version ?? '',
      state: p.PLACEMENT_STATE_PENDING,
      state_reason: null,
      // Read the timestamp in SQL to preserve its microseconds.
      due_at: sql<Date>`(${declaredAt}) + ${p.PLACEMENT_RECHECK_AFTER_HOURS} * interval '1 hour'`,
      declared_at: declaredAt,
      checker_version: p.PLACEMENT_CHECKER_VERSION,
      attempts: 0,
      observed_at: null,
      observation_snapshot_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}
