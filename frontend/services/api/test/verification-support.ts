import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../src/db/database.ts';
import { policy } from '../src/config.ts';
import { seedOpportunityScenario, actionRow, snapshotRow } from './opportunity-fixtures.ts';
import { sourcePage } from './action-support.ts';

export type VerificationSeed = {
  workspaceId: string;
  projectId: string;
  userId: string;
  auditId: string;
  metricId: string;
  crawlId: string;
  trafficId: string;
  snapshotId: string;
  analysisId: string;
  artifactId: string;
  ruleId: string;
  declarations: Record<string, string>;
};

// Keep PostgreSQL microseconds: Date would truncate the verifier's evidence key.
const moment = sql<Date>`'2026-09-27T10:00:00.123456Z'::timestamptz`;
const declared = sql<Date>`${moment} - interval '1 day'`;

export async function seedVerification(db: Database): Promise<VerificationSeed> {
  const scn = await seedOpportunityScenario(db, false, {
    facts: { secure: true },
    fetchedAt: moment,
  });
  return db.transaction().execute(async (trx) => {
    const scope = { workspace_id: scn.workspace_id, project_id: scn.project_id };
    const snapshot = snapshotRow(scope, {
      audit_id: scn.audit_id,
      source_mix: JSON.stringify({ gap_keys: ['a', 'b'] }),
    });
    await trx
      .insertInto('opportunity_snapshots')
      .values({ ...snapshot, created_at: sql<Date>`${moment} - interval '3 days'` })
      .execute();
    const issue = await trx
      .selectFrom('site_issues')
      .selectAll()
      .where('id', '=', scn.issue_structured_id)
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('site_rule_evaluations')
      .set({ outcome: 'partial' })
      .where('id', '=', issue.evaluation_id)
      .execute();
    await trx
      .updateTable('site_crawls')
      .set({ completed_at: moment })
      .where('id', '=', scn.crawl_id)
      .execute();
    await trx
      .updateTable('audits')
      .set({ completed_at: moment })
      .where('id', '=', scn.audit_id)
      .execute();
    await trx
      .updateTable('metric_snapshots')
      .set({ created_at: moment, visibility_score: 80 })
      .where('id', '=', scn.metric_snapshot_id)
      .execute();
    const trafficId = randomUUID();
    await trx
      .insertInto('traffic_snapshots')
      .values({
        ...scope,
        id: trafficId,
        window_start: new Date('2026-09-01'),
        window_end: new Date('2026-09-25'),
        granularity: 'day',
        metrics: JSON.stringify({ totals: { clicks: 5 } }),
        normalization_version: policy.traffic.TRAFFIC_NORMALIZATION_VERSION,
        formula_version: policy.traffic.TRAFFIC_FORMULA_VERSION,
        created_at: moment,
      })
      .execute();
    const page = await sourcePage(trx, scope, 'https://publisher.test/list');
    const checks = {
      site: [
        { kind: 'site_rule', rule_id: issue.rule_id, expected_outcome: 'partial' },
        { kind: 'page_fact', fact_key: 'secure', expected_value: true },
      ],
      traffic: [
        { kind: 'traffic_metric', metric: 'clicks', expected_value: 4, direction: 'increase' },
      ],
      visibility: [
        {
          kind: 'visibility_metric',
          metric: 'visibility_score',
          baseline_value: 40,
          min_delta: 1,
          direction: 'increase',
        },
      ],
      missing_prompt: [
        {
          kind: 'visibility_metric',
          target_prompt_id: randomUUID(),
          baseline_value: 40,
          min_delta: 1,
          direction: 'increase',
        },
      ],
      placement: [{ kind: 'placement' }],
    };
    const declarations: Record<string, string> = {};
    for (const [name, expected] of Object.entries(checks)) {
      const action = actionRow(scope, {
        group_key: `verification:${name}`,
        target_kind: 'page',
        target_label: name,
        status: 'implemented',
      });
      await trx.insertInto('actions').values(action).execute();
      const id = randomUUID();
      await trx
        .insertInto('opportunity_implementation_events')
        .values({
          ...scope,
          id,
          action_id: action.id,
          opportunity_snapshot_id: snapshot.id,
          actor_user_id: scn.user_id,
          declared_implemented_at: declared,
          target_site_url_ids: JSON.stringify(name === 'site' ? [issue.site_url_id] : []),
          target_external_url: name === 'placement' ? 'https://publisher.test/list' : null,
          expected_checks: JSON.stringify(expected),
          member_opportunity_ids: '[]',
          idempotency_key: name,
          request_fingerprint: name,
          created_at: declared,
        })
        .execute();
      declarations[name] = id;
      if (name === 'placement') {
        const checkId = randomUUID();
        await trx
          .insertInto('placement_checks')
          .values({
            ...scope,
            id: checkId,
            source_page_id: page.id,
            implementation_event_id: id,
            opportunity_stable_key: 'earned:key',
            rule_id: 'earned_page_acquire_listing',
            url_hash: page.hash,
            expected_change: 'brand_listed',
            declared_at: declared,
            state: 'satisfied',
            attempts: 1,
            baseline_roster_version: '',
            checker_version: policy.opportunity.placement.PLACEMENT_CHECKER_VERSION,
            observed_at: moment,
            updated_at: moment,
            created_at: new Date(),
          })
          .execute();
        declarations.placement_check = checkId;
      }
    }
    return {
      workspaceId: scn.workspace_id,
      projectId: scn.project_id,
      userId: scn.user_id,
      auditId: scn.audit_id,
      metricId: scn.metric_snapshot_id,
      crawlId: scn.crawl_id,
      trafficId,
      snapshotId: snapshot.id,
      analysisId: issue.analysis_id,
      artifactId: issue.source_artifact_id,
      ruleId: issue.evaluation_id,
      declarations,
    };
  });
}
