/**
 * Audit commands. The browser creates a queued audit and may then drive its
 * first results in the request (`run`); the public API launches in one call
 * with an estimate guard and leaves execution to the runner.
 */
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import type { z } from 'zod';

import { requireCapability, type Actor } from '../auth/actor.ts';
import { auditRuntime } from '../audits/config.ts';
import { createAudit } from '../audits/creation.ts';
import { estimateAudit } from '../audits/estimate.ts';
import { auditCreateInput, auditInput, auditLaunchInput } from '../audits/inputs.ts';
import { executeInteractiveAudit } from '../audits/interactive.ts';
import { cancelAudit as cancelOwnedAudit } from '../audits/maintenance.ts';
import { readAudit } from '../audits/reads.ts';
import { configEnvironment, policy, type ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';

const SCOPE = 'audits:run';

export async function createQueuedAudit(
  db: Database,
  config: ServiceConfig,
  actor: Actor,
  input: z.output<typeof auditCreateInput>,
) {
  requireCapability(actor, 'run', SCOPE);
  const id = await createAudit(
    db,
    actor.workspaceId,
    auditInput.parse(input),
    {},
    auditRuntime(configEnvironment(config)),
  );
  return readAudit(db, actor.workspaceId, id);
}

/** Drive a queued audit's first phases inside the request. */
export async function runAudit(db: Database, config: ServiceConfig, actor: Actor, auditId: string) {
  requireCapability(actor, 'run', SCOPE);
  await readAudit(db, actor.workspaceId, auditId);
  await executeInteractiveAudit(db, config, actor.workspaceId, auditId);
  return readAudit(db, actor.workspaceId, auditId);
}

/**
 * Estimate, then create the queued audit only when the estimate's maximum
 * attempt count (the most audit credits the run can reserve) is within the
 * caller's ceiling: 409 `estimate_exceeds_limit` otherwise.
 */
export async function launchAudit(
  db: Database,
  config: ServiceConfig,
  actor: Actor,
  projectId: string,
  input: z.output<typeof auditLaunchInput>,
) {
  requireCapability(actor, 'run', SCOPE);
  const { max_estimated_credits: ceiling, ...request } = input;
  const runtime = auditRuntime(configEnvironment(config));
  const estimate = await estimateAudit(
    db,
    actor.workspaceId,
    { ...request, project_id: projectId },
    runtime,
  );
  if (estimate.maximum_attempt_count > ceiling)
    throw new ApiError(409, 'The audit estimate exceeds max_estimated_credits', {
      code: asApiErrorCode(policy.public_api.codes.estimate_exceeds_limit),
      details: {
        estimated_credits: estimate.maximum_attempt_count,
        max_estimated_credits: ceiling,
      },
    });
  const id = await createAudit(
    db,
    actor.workspaceId,
    auditInput.parse({ ...request, project_id: projectId }),
    {},
    runtime,
  );
  return readAudit(db, actor.workspaceId, id);
}

export async function cancelAudit(db: Database, actor: Actor, auditId: string) {
  requireCapability(actor, 'write', SCOPE);
  await cancelOwnedAudit(db, actor.workspaceId, auditId);
  return readAudit(db, actor.workspaceId, auditId);
}
