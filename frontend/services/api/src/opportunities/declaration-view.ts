/** The declaration and bounded observation history, with persisted measurement legs. */
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { OpportunityImplementationEvents } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { utcTextOf } from '../db/timestamps.ts';
import { measurementLegs } from './measurement-legs.ts';

export async function declarationView(
  db: Database,
  row: Selectable<OpportunityImplementationEvents>,
) {
  const observations = await db
    .selectFrom('opportunity_verification_events')
    .selectAll()
    .where('workspace_id', '=', row.workspace_id)
    .where('project_id', '=', row.project_id)
    .where('implementation_event_id', '=', row.id)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(policy.opportunity.opportunities.IMPLEMENTATION_VERIFICATION_HISTORY_MAX)
    .execute();
  observations.reverse();
  const latest = observations.at(-1);
  const timestamp = await db
    .selectFrom('opportunity_implementation_events')
    .select(utcTextOf(sql.ref('declared_implemented_at')).as('at'))
    .where('workspace_id', '=', row.workspace_id)
    .where('id', '=', row.id)
    .executeTakeFirstOrThrow();
  return {
    id: row.id,
    action_id: row.action_id,
    output_revision_id: row.output_revision_id,
    member_opportunity_ids: row.member_opportunity_ids,
    opportunity_snapshot_id: row.opportunity_snapshot_id,
    target_site_url_ids: row.target_site_url_ids,
    target_external_url: row.target_external_url,
    declared_implemented_at: `${timestamp.at}Z`,
    expected_checks: row.expected_checks,
    state: latest?.observation_kind ?? 'declared',
    limitations: latest?.limitations ?? [],
    verification_events: observations.map((item) => ({
      id: item.id,
      observation_kind: item.observation_kind,
      observed_at: item.observed_at,
      crawl_id: item.crawl_id,
      audit_id: item.audit_id,
      source_analysis_ids: item.source_analysis_ids,
      source_rule_evaluation_ids: item.source_rule_evaluation_ids,
      source_metric_ids: item.source_metric_ids,
      result: item.result,
      verifier_version: item.verifier_version,
      limitations: item.limitations,
      created_at: item.created_at,
    })),
    legs: await measurementLegs(db, row, observations),
    created_at: row.created_at,
  };
}
