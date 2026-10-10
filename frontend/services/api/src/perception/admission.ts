/**
 * Perception versions frozen at audit admission, and the enqueue that follows
 * an analysis. The frozen versions decide whether an audit is perceived at
 * all: only brand audits freeze them, and an audit without them is never
 * classified and never reads as pending.
 */
import type { Transaction } from 'kysely';
import { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { DB } from '../generated/db-schema.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import { namesAnyEntity } from './passages.ts';

const versionsSchema = z.object({
  extractor_version: z.string().min(1),
  template_version: z.string().min(1),
  metrics_version: z.string().min(1),
});
export type PerceptionVersions = z.infer<typeof versionsSchema>;

/** What a new audit freezes: the versions in force now, for a brand audit only. */
export function admittedPerceptionVersions(auditScope: string): PerceptionVersions | null {
  if (auditScope !== policy.visibility.brand_audit_scope) return null;
  const { extractor_version, template_version, metrics_version } = policy.perception;
  return { extractor_version, template_version, metrics_version };
}

/** The audit's frozen versions, or null for an audit that is not perceived. */
export function frozenPerceptionVersions(configuration: unknown): PerceptionVersions | null {
  const parsed = versionsSchema.safeParse(record(configuration).perception);
  return parsed.success ? parsed.data : null;
}

/**
 * Queue one classification for a perceived answer that names the brand or a
 * competitor. Runs inside the analysis transaction; no network I/O here. The
 * key holds the extractor version, so a re-derived finalize never adds a row.
 */
export async function enqueuePerception(
  db: Database | Transaction<DB>,
  input: {
    workspaceId: string;
    projectId: string;
    configuration: unknown;
    analysisId: string;
    assessments: readonly { state: string }[];
  },
): Promise<string | null> {
  const versions = frozenPerceptionVersions(input.configuration);
  if (!versions || !namesAnyEntity(input.assessments)) return null;
  return enqueueTask(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    kind: policy.perception.task_kind,
    payload: { analysis_id: input.analysisId },
    keyParts: [input.analysisId, versions.extractor_version],
    maxAttempts: policy.perception.task_max_attempts,
  });
}
