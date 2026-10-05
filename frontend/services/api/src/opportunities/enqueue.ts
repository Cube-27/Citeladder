/**
 * Transactional enqueues of the two Opportunity consumers. A trigger's key is
 * versioned, so re-enqueueing the same evidence never adds a second row; the
 * keys preserve idempotent replay of existing Opportunity triggers.
 */
import type { Transaction } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { DB } from '../generated/db-schema.ts';
import { enqueueTask } from '../referrals/enqueue.ts';

const versions = policy.opportunity.opportunities;
type Trigger = {
  workspaceId: string;
  projectId: string;
  triggerKind: string;
  triggerId: string;
  maxAttempts: number;
};

/** One automatic Opportunity projection refresh for an evidence trigger. */
export function enqueueOpportunityRefresh(db: Database | Transaction<DB>, trigger: Trigger) {
  const { ANALYZER_VERSION, RULE_VERSION, FORMULA_VERSION } = versions;
  return enqueueTask(db, {
    workspaceId: trigger.workspaceId,
    projectId: trigger.projectId,
    kind: 'opportunity_refresh',
    payload: { trigger_kind: trigger.triggerKind, trigger_id: trigger.triggerId },
    keyParts: [],
    idempotencyKey: [
      'opportunity',
      trigger.triggerKind,
      trigger.triggerId,
      ANALYZER_VERSION,
      RULE_VERSION,
      FORMULA_VERSION,
    ].join(':'),
    maxAttempts: trigger.maxAttempts,
  });
}

/**
 * Re-check declared implementations against new evidence. `revision` separates
 * repeated settlements of one trigger; a terminal trigger settles once.
 */
export function enqueueImplementationVerification(
  db: Database | Transaction<DB>,
  trigger: Trigger & { revision?: string; payload?: Record<string, unknown> },
) {
  return enqueueTask(db, {
    workspaceId: trigger.workspaceId,
    projectId: trigger.projectId,
    kind: 'opportunity_verification',
    // Extra payload never overrides the trigger the key names.
    payload: {
      ...trigger.payload,
      trigger_kind: trigger.triggerKind,
      trigger_id: trigger.triggerId,
    },
    keyParts: [],
    idempotencyKey: [
      'implementation-verification',
      trigger.triggerKind,
      trigger.triggerId,
      versions.IMPLEMENTATION_VERIFIER_VERSION,
      trigger.revision ?? 'terminal',
    ].join(':'),
    maxAttempts: trigger.maxAttempts,
  });
}
