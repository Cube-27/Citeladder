/** Dataset-aware successor admission, inside the sync completion transaction. */
import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { enqueueTask } from '../referrals/enqueue.ts';

type CompletedSync = {
  id: string;
  workspace_id: string;
  project_id: string;
  window_start: string;
  window_end: string;
  resync_seq: number;
};

export async function enqueuePostSyncProjections(
  trx: Database,
  run: CompletedSync,
  failed = false,
): Promise<void> {
  const artifacts = await trx
    .selectFrom('integration_import_artifacts')
    .select(['id', 'dataset'])
    .where('sync_run_id', '=', run.id)
    .where('workspace_id', '=', run.workspace_id)
    .execute();
  const maxAttempts = resolveSettingSpec(
    policy.analytics.worker_settings.task_max_attempts,
  ) as number;
  const referralDatasets = new Set(policy.traffic.TRAFFIC_GA4_REFERRAL_DATASETS);
  const trafficDatasets = new Set(policy.traffic.TRAFFIC_REFRESH_TRIGGER_DATASETS);
  for (const artifact of artifacts) {
    if (!referralDatasets.has(artifact.dataset)) continue;
    await enqueueTask(trx, {
      workspaceId: run.workspace_id,
      projectId: run.project_id,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: artifact.id },
      keyParts: [run.project_id, artifact.id],
      maxAttempts,
    });
  }
  if (failed || artifacts.some((artifact) => trafficDatasets.has(artifact.dataset))) {
    const start = run.window_start.slice(0, 10);
    const end = run.window_end.slice(0, 10);
    const sourceRevision = run.id;
    await enqueueTask(trx, {
      workspaceId: run.workspace_id,
      projectId: run.project_id,
      kind: 'traffic_snapshot_refresh',
      payload: { window_start: start, window_end: end, source_revision: sourceRevision },
      keyParts: [run.project_id, start, end, run.resync_seq, sourceRevision],
      maxAttempts,
    });
  }
  if (
    failed ||
    artifacts.some((a) =>
      ['ga4_landing_daily', 'ga4_channel_daily', 'ga4_ecommerce_source_medium_daily'].includes(
        a.dataset,
      ),
    )
  )
    await enqueueTask(trx, {
      workspaceId: run.workspace_id,
      projectId: run.project_id,
      kind: 'ai_referrals_snapshot_refresh',
      payload: {
        window_start: run.window_start.slice(0, 10),
        window_end: run.window_end.slice(0, 10),
      },
      keyParts: [run.project_id, run.id, failed ? 'failed' : 'ga4-extras'],
      maxAttempts,
    });
}
