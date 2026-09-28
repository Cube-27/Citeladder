/** The declaration and bounded observation history, with persisted measurement legs. */
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { OpportunityImplementationEvents } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { pydanticUtc, utcTextOf } from '../db/timestamps.ts';
import { record, strings } from '../db/json.ts';
import { measurementLegs } from './measurement-legs.ts';
import { measurementLegSchema } from '@citeladder/contracts/actions';
import { expectedCheckSchema } from '@citeladder/contracts/opportunities';
import { z } from 'zod';

const observationKind = z.enum(['observed', 'verified', 'contradicted']);

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
    member_opportunity_ids: strings(row.member_opportunity_ids),
    opportunity_snapshot_id: row.opportunity_snapshot_id,
    target_site_url_ids: strings(row.target_site_url_ids),
    target_external_url: row.target_external_url,
    declared_implemented_at: pydanticUtc(timestamp.at),
    expected_checks: z.array(expectedCheckSchema).parse(row.expected_checks ?? []),
    state: latest ? observationKind.parse(latest.observation_kind) : ('declared' as const),
    limitations: strings(latest?.limitations),
    verification_events: observations.map((item) => ({
      id: item.id,
      observation_kind: observationKind.parse(item.observation_kind),
      observed_at: item.observed_at.toISOString(),
      crawl_id: item.crawl_id,
      audit_id: item.audit_id,
      source_analysis_ids: strings(item.source_analysis_ids),
      source_rule_evaluation_ids: strings(item.source_rule_evaluation_ids),
      source_metric_ids: strings(item.source_metric_ids),
      result: record(item.result),
      verifier_version: item.verifier_version,
      limitations: strings(item.limitations),
      created_at: item.created_at.toISOString(),
    })),
    legs: (await measurementLegs(db, row, observations)).map((leg) =>
      measurementLegSchema.parse({
        ...leg,
        due_at: leg.due_at?.toISOString() ?? null,
        last_evidence_at: leg.last_evidence_at?.toISOString() ?? null,
      }),
    ),
    created_at: row.created_at.toISOString(),
  };
}
