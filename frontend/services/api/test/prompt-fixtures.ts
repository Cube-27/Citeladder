/** Prompt-library, billing and candidate rows for the prompts suites. */
import { randomUUID } from 'node:crypto';

import type { Database } from '../src/db/database.ts';
import { promptTextHash } from '../src/prompts/normalization.ts';

const now = () => new Date();

export async function billingAccount(db: Database, workspaceId: string): Promise<string> {
  const existing = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (existing) return existing.id;
  const id = randomUUID();
  await db
    .insertInto('billing_accounts')
    .values({
      id,
      workspace_id: workspaceId,
      registration_origin: 'operator',
      status: 'active',
      billing_country: 'IN',
      country_verification: 'self_declared',
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

export type GrantInput = {
  key?: string;
  value: number;
  sourceKind?: string;
  role?: 'primary' | 'supplement';
  bundle?: string;
  priority?: number;
  validFrom?: Date;
  validUntil?: Date | null;
};

export async function grant(db: Database, accountId: string, input: GrantInput): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('account_grants')
    .values({
      id,
      billing_account_id: accountId,
      source_kind: input.sourceKind ?? 'plan',
      source_ref: 'test',
      bundle_role: input.role ?? 'supplement',
      bundle_id: input.bundle ?? '',
      profile_priority: input.priority ?? 0,
      key: input.key ?? 'prompt_slots',
      value: input.value,
      valid_from: input.validFrom ?? new Date(Date.now() - 60_000),
      valid_until: input.validUntil ?? null,
      catalog_revision: 'test',
      idempotency_key: id,
      created_at: now(),
    })
    .execute();
  return id;
}

export async function promptSet(db: Database, projectId: string): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('prompt_sets')
    .values({
      id,
      project_id: projectId,
      name: 'Set',
      description: '',
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

export async function topic(db: Database, projectId: string, name: string, description = '') {
  const id = randomUUID();
  await db
    .insertInto('topics')
    .values({
      id,
      project_id: projectId,
      parent_id: null,
      name,
      description,
      origin: 'manual',
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

export async function prompt(
  db: Database,
  setId: string,
  text: string,
  options: { status?: string; topicId?: string | null; createdAt?: Date } = {},
): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('prompts')
    .values({
      id,
      prompt_set_id: setId,
      topic_id: options.topicId ?? null,
      text,
      normalized_text_hash: promptTextHash(text),
      theme: '',
      intent: '',
      cohort: 'core',
      branded: false,
      enabled: true,
      status: options.status ?? 'active',
      origin: 'manual',
      created_at: options.createdAt ?? now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

/** A persisted generation run. */
export async function generationRun(
  db: Database,
  scope: { workspaceId: string; projectId: string; setId: string },
  provenance: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('prompt_generation_runs')
    .values({
      id,
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      prompt_set_id: scope.setId,
      generator_version: 'test',
      request: JSON.stringify({}),
      provenance: JSON.stringify(provenance),
      created_at: now(),
    })
    .execute();
  return id;
}

export async function candidate(
  db: Database,
  scope: { workspaceId: string; setId: string; runId: string },
  text: string,
  options: {
    decision?: Record<string, unknown> | null;
    createdAt?: Date;
    expiresAt?: Date;
    topicId?: string | null;
    cohort?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('prompt_candidates')
    .values({
      id,
      workspace_id: scope.workspaceId,
      run_id: scope.runId,
      prompt_set_id: scope.setId,
      topic_id: options.topicId ?? null,
      text,
      normalized_text_hash: promptTextHash(text),
      intent: 'discovery',
      buyer_stage: 'consideration',
      prompt_intent: 'compare',
      cohort: options.cohort ?? 'core',
      slot_id: `slot-${id}`,
      evidence_refs: JSON.stringify([{ kind: 'page' }]),
      validation: JSON.stringify({ admission: 'passed' }),
      jev_decision: options.decision == null ? null : JSON.stringify(options.decision),
      disposition: 'pending',
      prompt_id: null,
      created_at: options.createdAt ?? now(),
      expires_at: options.expiresAt ?? new Date(Date.now() + 86_400_000),
      reviewed_at: null,
    })
    .execute();
  return id;
}
