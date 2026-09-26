/**
 * Frozen retrieval provenance for one execution.
 *
 * Ports `execution_frozen_provenance` from `app/domain/audits/schemas.py`:
 * the task's request snapshot wins, then its route snapshot, then the audit's
 * frozen measurement policy. Live configuration is never consulted.
 */
import { policy } from '../config.ts';
import { pyTruthy } from '../python/text.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function frozenRetrievalEnabled(...snapshots: unknown[]): boolean | null {
  for (const snapshot of snapshots) {
    if (!isObject(snapshot)) continue;
    const retrievalEnabled = snapshot.retrieval_enabled;
    if (retrievalEnabled !== null && retrievalEnabled !== undefined) {
      return pyTruthy(retrievalEnabled);
    }
  }
  return null;
}

export function executionFrozenProvenance(input: {
  requestSnapshot: unknown;
  routeSnapshot: unknown;
  auditConfiguration: unknown;
}): boolean | null {
  const retrieval = frozenRetrievalEnabled(input.requestSnapshot, input.routeSnapshot);
  if (retrieval !== null) return retrieval;
  const configuration = isObject(input.auditConfiguration) ? input.auditConfiguration : {};
  const frozen = configuration[policy.visibility.measurement_policy_key];
  return isObject(frozen) ? frozenRetrievalEnabled(frozen) : null;
}
