import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

import type { Database } from '../src/db/database.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { promptTextHash } from '../src/prompts/normalization.ts';
import { asOwner } from './support.ts';

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
  fixtureDefault?: boolean;
};

const FIXTURE_DEFAULT = 'fixture-default';

export async function grant(db: Database, accountId: string, input: GrantInput): Promise<string> {
  const id = randomUUID();
  const key = input.key ?? 'prompt_slots';
  if (!input.fixtureDefault)
    await asOwner((owner) =>
      owner
        .deleteFrom('account_grants')
        .where('billing_account_id', '=', accountId)
        .where('key', '=', key)
        .where('source_ref', '=', FIXTURE_DEFAULT)
        .execute(),
    );
  await db
    .insertInto('account_grants')
    .values({
      id,
      billing_account_id: accountId,
      source_kind: input.sourceKind ?? 'plan',
      source_ref: input.fixtureDefault ? FIXTURE_DEFAULT : 'test',
      bundle_role: input.role ?? 'supplement',
      bundle_id: input.bundle ?? '',
      profile_priority: input.priority ?? 0,
      key,
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
      workspace_id: (eb) =>
        eb.selectFrom('projects').select('workspace_id').where('projects.id', '=', projectId),
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
      workspace_id: (eb) =>
        eb.selectFrom('projects').select('workspace_id').where('projects.id', '=', projectId),
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
      workspace_id: (eb) =>
        eb.selectFrom('prompt_sets').select('workspace_id').where('prompt_sets.id', '=', setId),
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
    evidenceRefs?: Record<string, unknown>[];
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
      evidence_refs: JSON.stringify(options.evidenceRefs ?? [{ kind: 'page' }]),
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

export type DraftRequest = {
  system: string;
  slots: (Record<string, unknown> & { slot_id: string })[];
  reference: Record<string, unknown>;
};

export function echoDependencies({
  fail = [],
  onCall,
  onRequest,
  topics = [],
  maps = [],
}: {
  fail?: number[];
  onCall?: (call: number) => void;
  onRequest?: (request: DraftRequest) => void;
  topics?: { name: string; offerings: string[] }[];
  maps?: { offering: string; attributes: string[]; situations: string[]; audiences: string[] }[];
} = {}) {
  let calls = 0;
  const answer = (init?: RequestInit): Response => {
    const call = ++calls;
    onCall?.(call);
    if (fail.includes(call)) return new Response('bad request', { status: 400 });
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const user = JSON.parse(body.messages[1]!.content.split('\n\nReturn only JSON')[0]!) as {
      slots?: DraftRequest['slots'];
      reference_evidence: DraftRequest['reference'];
      knowledge_base?: unknown;
    };
    if (user.knowledge_base)
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ offerings: maps }) } }],
      });
    if (!user.slots)
      return Response.json({ choices: [{ message: { content: JSON.stringify({ topics }) } }] });
    onRequest?.({
      system: body.messages[0]!.content,
      slots: user.slots,
      reference: user.reference_evidence,
    });
    const brand = user.reference_evidence.brand_name;
    const named = typeof brand === 'string' && brand ? brand + ' ' : '';
    const prompts = user.slots.map((slot) => ({
      slot_id: slot.slot_id,
      text: `Which ${named}running shoes suit ${slot.slot_id}style runners on ${slot.slot_id}grade trails?`,
      buyer_stage: 'consideration',
      prompt_intent: 'recommend',
    }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ prompts }) } }] });
  };
  const fetch = vi.fn<typeof globalThis.fetch>((_url, init) =>
    Promise.resolve().then(() => answer(init)),
  );
  const gateway = createModelGateway(
    {
      ...gatewaySettings({}),
      apiKey: 'test-only',
      model: 'claude-haiku-5-5',
      baseUrl: 'https://model.test',
    },
    { fetch, sleep: async () => {} },
  );
  return { gateway: () => gateway, judge: () => null, io: { fetch } };
}
