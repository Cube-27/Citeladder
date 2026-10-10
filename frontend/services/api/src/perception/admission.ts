/** Perception versions frozen at audit admission, and the enqueue that follows an analysis. */
import type { Transaction } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { DB } from '../generated/db-schema.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import { namesAnyEntity } from './passages.ts';

export type PerceptionVersions = {
  extractor_version: string;
  template_version: string;
  metrics_version: string;
};

/** The versions in force now, frozen into a new audit's configuration. */
export function currentPerceptionVersions(): PerceptionVersions {
  const { extractor_version, template_version, metrics_version } = policy.perception;
  return { extractor_version, template_version, metrics_version };
}

/** The audit's frozen versions; an audit frozen without them reads as the current ones. */
export function frozenPerceptionVersions(configuration: unknown): PerceptionVersions {
  const frozen = record(record(configuration).perception);
  const current = currentPerceptionVersions();
  const text = (value: unknown, fallback: string) =>
    typeof value === 'string' && value ? value : fallback;
  return {
    extractor_version: text(frozen.extractor_version, current.extractor_version),
    template_version: text(frozen.template_version, current.template_version),
    metrics_version: text(frozen.metrics_version, current.metrics_version),
  };
}

/**
 * Queue one classification for a brand-audit answer that names the brand or a
 * competitor. Runs inside the analysis transaction; no network I/O here. The
 * key holds the extractor version, so a re-derived finalize never adds a row.
 */
export async function enqueuePerception(
  db: Database | Transaction<DB>,
  input: {
    workspaceId: string;
    projectId: string;
    auditScope: string;
    configuration: unknown;
    analysisId: string;
    assessments: readonly { state: string }[];
  },
): Promise<string | null> {
  if (input.auditScope !== policy.visibility.brand_audit_scope) return null;
  if (!namesAnyEntity(input.assessments)) return null;
  const { extractor_version } = frozenPerceptionVersions(input.configuration);
  return enqueueTask(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: policy.perception.task_kind,
    payload: { analysis_id: input.analysisId },
    keyParts: [input.analysisId, extractor_version],
    maxAttempts: policy.perception.task_max_attempts,
  });
}
