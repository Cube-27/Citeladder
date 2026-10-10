/**
 * The `answer_perception` analytics executor: one bounded, platform-funded
 * model call per answer that names the brand or a competitor.
 *
 * Reads are committed before the call and no transaction spans it; the
 * analytics claim already committed the attempt. The outcome is written in
 * the worker's lease-fenced terminal transaction and is idempotent on
 * `(analysis_id, extractor_version)`. Caps, a missing gateway, an unusable
 * output and a provider failure all end as a persisted outcome, so the audit
 * never fails because perception could not run.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { scoringConfig } from '../analysis/scoring.ts';
import { policy } from '../config.ts';
import type { PerceptionPolicy } from '../config/perception.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { createModelGateway, gatewaySettings, type ModelGateway } from '../models/gateway.ts';
import { ModelError } from '../models/http.ts';
import { parseUuid } from '../http/uuid.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { scalarText } from '../text-order.ts';
import { payloadString, taskProject, type Executor } from '../workers/executor.ts';
import { frozenPerceptionVersions } from './admission.ts';
import { perceptionOutputSchema, perceptionPrompt } from './model.ts';
import { entityPassages, packageHash, type PerceptionPackage } from './passages.ts';
import { validateOutput, type EntitySentiment } from './validate.ts';

/** Outcomes that spent a model call; caps count only these. */
const CALLED = ['classified', 'invalid_output', 'model_error'];

type Outcome =
  | { outcome: 'classified'; entities: EntitySentiment[]; drops: Record<string, number> }
  | { outcome: 'no_mentions' }
  | {
      outcome: 'unavailable';
      reason: 'platform_cap' | 'model_not_configured' | 'task_failed';
    }
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
  const analysisId = parseUuid(payloadString(task, 'analysis_id'));
  if (analysisId === null) throw new Error('answer_perception payload missing analysis_id');
  return db
    .selectFrom('response_analyses as ra')
    .innerJoin('audits as audit', 'audit.id', 'ra.audit_id')
    .innerJoin('raw_response_artifacts as artifact', 'artifact.id', 'ra.artifact_id')
    .innerJoin('audit_tasks as execution', 'execution.id', 'ra.task_id')
    .innerJoin('audit_prompt_snapshots as snapshot', 'snapshot.id', 'execution.prompt_snapshot_id')
    .select([
      'ra.id as analysis_id',
      'ra.task_id',
      'ra.artifact_id',
      'audit.id as audit_id',
      'audit.configuration',
      'artifact.answer_text',
      'snapshot.text as prompt',
    ])
    .where('ra.id', '=', analysisId)
    .where('ra.workspace_id', '=', task.workspace_id)
    .where('audit.workspace_id', '=', task.workspace_id)
    .where('audit.project_id', '=', projectId)
    .executeTakeFirstOrThrow();
}

async function alreadyPerceived(db: Database, subject: Subject, extractorVersion: string) {
  const row = await db
    .selectFrom('answer_perceptions')
    .select('id')
    .where('analysis_id', '=', subject.analysis_id)
    .where('extractor_version', '=', extractorVersion)
    .executeTakeFirst();
  return row !== undefined;
}

async function overCap(
  db: Database,
  task: QueueTask,
  subject: Subject,
  settings: PerceptionPolicy,
): Promise<boolean> {
  const counted = db
    .selectFrom('answer_perceptions')
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
    Number(audit.count) >= settings.max_classifications_per_audit ||
    Number(day.count) >= settings.max_classifications_per_workspace_per_day
  );
}

function persist(
  task: QueueTask,
  projectId: string,
  subject: Subject,
  versions: { extractor_version: string; template_version: string },
  outcome: Outcome,
  call: Call | null,
) {
  return async (db: Database) => {
    const id = randomUUID();
    const inserted = await db
      .insertInto('answer_perceptions')
      .values({
        id,
        workspace_id: task.workspace_id,
        project_id: projectId,
        audit_id: subject.audit_id,
        task_id: subject.task_id,
        analysis_id: subject.analysis_id,
        artifact_id: subject.artifact_id,
        extractor_version: versions.extractor_version,
        template_version: versions.template_version,
        model_provider: call?.provider ?? null,
        model: call?.model ?? null,
        input_hash: call?.inputHash ?? null,
        outcome: outcome.outcome,
        outcome_reason: 'reason' in outcome ? outcome.reason : null,
        drop_counts: JSON.stringify(outcome.outcome === 'classified' ? outcome.drops : {}),
        usage: call?.usage ? JSON.stringify(call.usage) : null,
        latency_ms: call?.latencyMs ?? null,
        created_at: new Date(),
      })
      .onConflict((conflict) => conflict.columns(['analysis_id', 'extractor_version']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted || outcome.outcome !== 'classified' || !outcome.entities.length) return;
    await db
      .insertInto('entity_sentiments')
      .values(
        outcome.entities.map((entity) => ({
          id: randomUUID(),
          workspace_id: task.workspace_id,
          perception_id: id,
          entity_id: entity.entity_id,
          entity_name: entity.entity_name,
          entity_kind: entity.entity_kind,
          label: entity.label,
          confidence: entity.confidence,
          low_confidence: entity.low_confidence,
          passage_spans: JSON.stringify(entity.passage_spans),
          aspects: JSON.stringify(entity.aspects),
        })),
      )
      .execute();
  };
}

/** Up to `max_attempts` calls while the output fails to parse; a provider fault ends at once. */
async function classify(gateway: ModelGateway, pkg: PerceptionPackage, settings: PerceptionPolicy) {
  const { system, user } = perceptionPrompt(pkg, settings);
  const call: Call = {
    provider: gateway.adapter,
    model: gateway.model,
    inputHash: packageHash(pkg),
    usage: null,
    latencyMs: null,
  };
  for (let attempt = 1; attempt <= settings.max_attempts; attempt++) {
    try {
      const { value, result } = await gateway.structured(system, user, perceptionOutputSchema);
      call.model = result.returned_model;
      call.usage = { ...result.usage, attempts: attempt };
      call.latencyMs = result.latency_ms;
      const validated = validateOutput(pkg, value, settings);
      return { call, outcome: { outcome: 'classified', ...validated } satisfies Outcome };
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

function configuredGateway(): ModelGateway | null {
  try {
    return createModelGateway(gatewaySettings());
  } catch (error) {
    if (error instanceof ModelError && error.code === 'not_configured') return null;
    throw error;
  }
}

export function answerPerception(
  gatewayFactory: () => ModelGateway | null = configuredGateway,
  settings: PerceptionPolicy = policy.perception,
): Executor {
  return async (task, { db, checkCancelled }) => {
    const projectId = await taskProject(db, task);
    const subject = await loadSubject(db, task, projectId);
    const versions = frozenPerceptionVersions(subject.configuration);
    // An audit admitted without perception is never classified.
    if (!versions || (await alreadyPerceived(db, subject, versions.extractor_version))) return;
    const settle = (outcome: Outcome, call: Call | null = null) => ({
      error: null,
      persist: persist(task, projectId, subject, versions, outcome, call),
    });
    if (await overCap(db, task, subject, settings))
      return settle({ outcome: 'unavailable', reason: 'platform_cap' });
    const gateway = gatewayFactory();
    if (!gateway) return settle({ outcome: 'unavailable', reason: 'model_not_configured' });
    const config = scoringConfig(subject.configuration);
    const languageCode = scalarText(record(subject.configuration).language_code);
    const pkg: PerceptionPackage = {
      extractor_version: versions.extractor_version,
      template_version: versions.template_version,
      language: languageCode,
      prompt: subject.prompt,
      entities: entityPassages({
        answer: subject.answer_text,
        languageCode,
        config,
        policy: settings,
      }),
    };
    if (!pkg.entities.length) return settle({ outcome: 'no_mentions' });
    await checkCancelled('perception_model_call');
    const { call, outcome } = await classify(gateway, pkg, settings);
    return settle(outcome, call);
  };
}

/** A task that exhausted its attempts still leaves a persisted, explained outcome. */
export async function compensatePerception(db: Database, task: QueueTask) {
  const projectId = await taskProject(db, task);
  const subject = await loadSubject(db, task, projectId);
  const versions = frozenPerceptionVersions(subject.configuration);
  if (!versions) return;
  await persist(
    task,
    projectId,
    subject,
    versions,
    { outcome: 'unavailable', reason: 'task_failed' },
    null,
  )(db);
}
