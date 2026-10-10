/**
 * The `fact_verification` analytics executor: one bounded, platform-funded
 * model call that checks an answer's brand claims against the confirmed fact
 * revisions its audit froze. Queued by the perception executor only when a
 * confident claim has a frozen fact on its topic.
 *
 * Mirrors perception: reads commit before the call and no transaction spans
 * it; caps, a missing gateway, an unusable output and a provider failure each
 * end as a persisted outcome, idempotent on
 * `(perception_id, verify_template_version)`.
 */
import { randomUUID } from 'node:crypto';

import { factTopicSchema } from '@citeladder/contracts/fact-checking';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { FactCheckPolicy } from '../config/perception.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { parseUuid } from '../http/uuid.ts';
import type { ModelGateway } from '../models/gateway.ts';
import { ModelError } from '../models/http.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { scalarText } from '../text-order.ts';
import { payloadString, taskProject, type Executor } from '../workers/executor.ts';
import { frozenFactCheck, type FrozenFactCheck } from './admission.ts';
import { configuredGateway } from './executor.ts';
import {
  validateVerdicts,
  verifyHash,
  verifyOutputSchema,
  verifyPackage,
  verifyPrompt,
  type VerifiedVerdict,
  type VerifyClaim,
  type VerifyPackage,
} from './verify.ts';

/** Outcomes that spent a model call; caps count only these. */
const CALLED = ['verified', 'invalid_output', 'model_error'];

type Outcome =
  | { outcome: 'verified'; verdicts: VerifiedVerdict[]; drops: Record<string, number> }
  | { outcome: 'unavailable'; reason: 'platform_cap' | 'model_not_configured' | 'task_failed' }
  | { outcome: 'invalid_output' }
  | { outcome: 'model_error'; reason: string };

type Call = {
  provider: string;
  model: string;
  inputHash: string;
  usage: Record<string, unknown> | null;
  latencyMs: number | null;
};

type Subject = Awaited<ReturnType<typeof loadSubject>>;

function loadSubject(db: Database, task: QueueTask, projectId: string) {
  const perceptionId = parseUuid(payloadString(task, 'perception_id'));
  if (perceptionId === null) throw new Error('fact_verification payload missing perception_id');
  return db
    .selectFrom('answer_perceptions as perception')
    .innerJoin('audits as audit', 'audit.id', 'perception.audit_id')
    .select([
      'perception.id as perception_id',
      'perception.task_id',
      'audit.id as audit_id',
      'audit.configuration',
    ])
    .where('perception.id', '=', perceptionId)
    .where('perception.workspace_id', '=', task.workspace_id)
    .where('audit.workspace_id', '=', task.workspace_id)
    .where('audit.project_id', '=', projectId)
    .executeTakeFirstOrThrow();
}

/** The confident claims with a frozen fact on their topic: the ones a model call checks. */
async function eligibleClaims(
  db: Database,
  workspaceId: string,
  subject: Subject,
  factCheck: FrozenFactCheck,
): Promise<VerifyClaim[]> {
  const topics = new Set<string>(factCheck.facts.map((fact) => fact.topic));
  const rows = await db
    .selectFrom('answer_claims')
    .select(['id', 'topic', 'claim', 'quote', 'low_confidence'])
    .where('workspace_id', '=', workspaceId)
    .where('perception_id', '=', subject.perception_id)
    .orderBy('ordinal')
    .execute();
  return rows.flatMap((row) => {
    const topic = factTopicSchema.safeParse(row.topic);
    if (row.low_confidence || !topic.success || !topics.has(topic.data)) return [];
    return [{ claimId: row.id, topic: topic.data, claim: row.claim, quote: row.quote }];
  });
}

async function frozenFacts(db: Database, workspaceId: string, factCheck: FrozenFactCheck) {
  const ids = factCheck.facts.map((fact) => fact.revision_id);
  const rows = await db
    .selectFrom('brand_fact_revisions')
    .select(['id', 'statement'])
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', ids)
    .execute();
  const statements = new Map(rows.map((row) => [row.id, row.statement]));
  // A frozen revision is append-only; one that is gone (project deleted) is skipped.
  return factCheck.facts.flatMap((fact) => {
    const statement = statements.get(fact.revision_id);
    return statement === undefined
      ? []
      : [{ revisionId: fact.revision_id, topic: fact.topic, statement }];
  });
}

async function alreadyVerified(db: Database, subject: Subject, version: string) {
  const row = await db
    .selectFrom('fact_verifications')
    .select('id')
    .where('perception_id', '=', subject.perception_id)
    .where('verify_template_version', '=', version)
    .executeTakeFirst();
  return row !== undefined;
}

async function overCap(
  db: Database,
  task: QueueTask,
  subject: Subject,
  settings: FactCheckPolicy,
): Promise<boolean> {
  const counted = db
    .selectFrom('fact_verifications')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('workspace_id', '=', task.workspace_id)
    .where('outcome', 'in', CALLED);
  const [audit, day] = await Promise.all([
    counted.where('audit_id', '=', subject.audit_id).executeTakeFirstOrThrow(),
    counted
      .where(
        'created_at',
        '>=',
        sql<Date>`date_trunc('day', now() at time zone 'utc') at time zone 'utc'`,
      )
      .executeTakeFirstOrThrow(),
  ]);
  return (
    Number(audit.count) >= settings.max_verifications_per_audit ||
    Number(day.count) >= settings.max_verifications_per_workspace_per_day
  );
}

function persist(
  task: QueueTask,
  projectId: string,
  subject: Subject,
  version: string,
  outcome: Outcome,
  call: Call | null,
) {
  return async (db: Database) => {
    const id = randomUUID();
    const inserted = await db
      .insertInto('fact_verifications')
      .values({
        id,
        workspace_id: task.workspace_id,
        project_id: projectId,
        audit_id: subject.audit_id,
        task_id: subject.task_id,
        perception_id: subject.perception_id,
        verify_template_version: version,
        model_provider: call?.provider ?? null,
        model: call?.model ?? null,
        input_hash: call?.inputHash ?? null,
        outcome: outcome.outcome,
        outcome_reason: 'reason' in outcome ? outcome.reason : null,
        drop_counts: JSON.stringify(outcome.outcome === 'verified' ? outcome.drops : {}),
        usage: call?.usage ? JSON.stringify(call.usage) : null,
        latency_ms: call?.latencyMs ?? null,
        created_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict.columns(['perception_id', 'verify_template_version']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (!inserted || outcome.outcome !== 'verified' || !outcome.verdicts.length) return;
    await db
      .insertInto('claim_verdicts')
      .values(
        outcome.verdicts.map((verdict) => ({
          id: randomUUID(),
          workspace_id: task.workspace_id,
          verification_id: id,
          claim_id: verdict.claimId,
          verdict: verdict.verdict,
          model_verdict: verdict.modelVerdict,
          fact_revision_ids: JSON.stringify(verdict.factRevisionIds),
          confidence: verdict.confidence,
          low_confidence: verdict.lowConfidence,
        })),
      )
      .execute();
  };
}

/** Up to `max_attempts` calls while the output fails to parse; a provider fault ends at once. */
async function verify(
  gateway: ModelGateway,
  built: ReturnType<typeof verifyPackage>,
  settings: FactCheckPolicy,
) {
  const pkg: VerifyPackage = built.pkg;
  const { system, user } = verifyPrompt(pkg, settings);
  const call: Call = {
    provider: gateway.adapter,
    model: gateway.model,
    inputHash: verifyHash(pkg),
    usage: null,
    latencyMs: null,
  };
  for (let attempt = 1; attempt <= settings.max_attempts; attempt++) {
    try {
      const { value, result } = await gateway.structured(system, user, verifyOutputSchema);
      call.model = result.returned_model;
      call.usage = { ...result.usage, attempts: attempt };
      call.latencyMs = result.latency_ms;
      const validated = validateVerdicts(value, built, settings);
      return { call, outcome: { outcome: 'verified', ...validated } satisfies Outcome };
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      call.usage = { attempts: attempt };
      if (error.code !== 'parse')
        return {
          call,
          outcome: {
            outcome: 'model_error',
            reason: error.status ? `http_${error.status}` : error.code,
          } satisfies Outcome,
        };
    }
  }
  return { call, outcome: { outcome: 'invalid_output' } satisfies Outcome };
}

export function factVerification(
  gatewayFactory: () => ModelGateway | null = configuredGateway,
  settings: FactCheckPolicy = policy.perception.fact_check,
): Executor {
  return async (task, { db, checkCancelled }) => {
    const projectId = await taskProject(db, task);
    const subject = await loadSubject(db, task, projectId);
    const factCheck = frozenFactCheck(subject.configuration);
    // An audit admitted outside the pilot is never verified.
    if (!factCheck) return;
    const version = factCheck.verify_template_version;
    if (await alreadyVerified(db, subject, version)) return;
    const settle = (outcome: Outcome, call: Call | null = null) => ({
      error: null,
      persist: persist(task, projectId, subject, version, outcome, call),
    });
    const claims = await eligibleClaims(db, task.workspace_id, subject, factCheck);
    if (!claims.length) return;
    if (await overCap(db, task, subject, settings))
      return settle({ outcome: 'unavailable', reason: 'platform_cap' });
    const gateway = gatewayFactory();
    if (!gateway) return settle({ outcome: 'unavailable', reason: 'model_not_configured' });
    const configuration = record(subject.configuration);
    const built = verifyPackage({
      version,
      brand: scalarText(configuration.brand_name),
      language: scalarText(configuration.language_code),
      facts: await frozenFacts(db, task.workspace_id, factCheck),
      claims,
      maxFacts: settings.max_facts_per_verification,
    });
    await checkCancelled('fact_verification_model_call');
    const { call, outcome } = await verify(gateway, built, settings);
    return settle(outcome, call);
  };
}

/** A task that exhausted its attempts still leaves a persisted, explained outcome. */
export async function compensateFactVerification(db: Database, task: QueueTask) {
  const projectId = await taskProject(db, task);
  const subject = await loadSubject(db, task, projectId);
  const factCheck = frozenFactCheck(subject.configuration);
  if (!factCheck) return;
  await persist(
    task,
    projectId,
    subject,
    factCheck.verify_template_version,
    { outcome: 'unavailable', reason: 'task_failed' },
    null,
  )(db);
}
