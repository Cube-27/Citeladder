/**
 * The `probe_labelling` analytics executor: once a probe run finalizes, a few
 * bounded model calls label its answers (known-for themes, objection groups,
 * the brands each theme answer names). The calls are paid for by the AI
 * credits each answer held at admission, so they are metered as included.
 *
 * Reads commit before the calls and no transaction spans them; the labels,
 * any new objection groups and the outcome land in the worker's lease-fenced
 * terminal transaction, once per run (`probe_labellings.audit_id`). A call
 * that fails retries the task; an exhausted task still records an outcome.
 */
import { randomUUID } from 'node:crypto';

import type { z } from 'zod';

import { scoringConfig } from '../analysis/scoring.ts';
import { meterFor } from '../billing/metering.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { parseUuid } from '../http/uuid.ts';
import type { ModelGateway } from '../models/gateway.ts';
import { callStructured, configuredGateway, type ModelCall } from '../perception/model-call.ts';
import { listThemes } from '../projects/themes.ts';
import { enqueueTask } from '../queue/enqueue.ts';
import { payloadString, taskProject, type Executor } from '../queue/executor.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import {
  knownForOutput,
  knownForRequest,
  mapKnownFor,
  mapObjections,
  mapThemeBrands,
  nameKey,
  objectionOutput,
  objectionRequest,
  themeOutput,
  themeRequest,
  type LabelAnswer,
  type TrackedName,
} from './label-model.ts';
import { listGroups } from './objection-groups.ts';
import { frozenQuestion } from './questions.ts';

const probes = policy.probes;
type Scope = { workspaceId: string; projectId: string };

/** Queued in the finalizing transaction of a probe run; a re-derived finalize adds none. */
export function enqueueProbeLabelling(db: Database, scope: Scope & { auditId: string }) {
  return enqueueTask(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    kind: probes.task_kind,
    payload: { audit_id: scope.auditId },
    keyParts: [scope.auditId, probes.labelling_version],
    maxAttempts: probes.task_max_attempts,
  });
}

async function loadProbe(db: Database, task: QueueTask, projectId: string) {
  const auditId = parseUuid(payloadString(task, 'audit_id'));
  if (auditId === null) throw new Error('probe_labelling payload missing audit_id');
  const audit = await db
    .selectFrom('audits')
    .select(['id', 'configuration'])
    .where('id', '=', auditId)
    .where('workspace_id', '=', task.workspace_id)
    .where('project_id', '=', projectId)
    .where('audit_scope', '=', probes.audit_scope)
    .executeTakeFirstOrThrow();
  const rows = await db
    .selectFrom('audit_tasks as t')
    .innerJoin('audit_prompt_snapshots as p', (join) =>
      join.onRef('p.id', '=', 't.prompt_snapshot_id').onRef('p.audit_id', '=', 't.audit_id'),
    )
    .select(['t.id', 't.answer_text', 'p.text as question_text', 'p.generation_evidence'])
    .where('t.workspace_id', '=', task.workspace_id)
    .where('t.audit_id', '=', audit.id)
    .where('t.status', '=', 'succeeded')
    .where('t.answer_text', '<>', '')
    .orderBy('t.prompt_index')
    .orderBy('t.logical_engine')
    .orderBy('t.repetition')
    .execute();
  const answers = rows.flatMap((row) => {
    const question = frozenQuestion(row.generation_evidence);
    return question
      ? [{ taskId: row.id, text: row.answer_text, questionText: row.question_text, question }]
      : [];
  });
  return { audit, answers };
}

async function labelled(db: Database, auditId: string) {
  const row = await db
    .selectFrom('probe_labellings')
    .select('id')
    .where('audit_id', '=', auditId)
    .executeTakeFirst();
  return row !== undefined;
}

class LabellingFailed extends Error {}

/** One labelling call; an unusable output or provider fault fails the attempt. */
async function ask<Value, Result>(
  gateway: ModelGateway,
  calls: ModelCall[],
  request: { user: string; schema: z.ZodType<Value> },
  accept: (value: Value) => Result,
): Promise<Result> {
  const { call, outcome } = await callStructured(
    gateway,
    {
      system: probes.system_template,
      user: request.user,
      schema: request.schema,
      inputHash: '',
      maxAttempts: probes.max_attempts,
    },
    (value) => ({ outcome: 'ok' as const, value: accept(value) }),
  );
  calls.push(call);
  if (outcome.outcome !== 'ok') throw new LabellingFailed(`probe labelling ${outcome.outcome}`);
  return outcome.value;
}

type Labels = {
  known: ReturnType<typeof mapKnownFor>;
  objections: ReturnType<typeof mapObjections>;
  themes: (ReturnType<typeof mapThemeBrands>[number] & { themeId: string })[];
};

async function label(
  db: Database,
  gateway: ModelGateway,
  scope: Scope,
  probe: Awaited<ReturnType<typeof loadProbe>>,
) {
  const config = scoringConfig(probe.audit.configuration);
  const [themes, groups] = await Promise.all([listThemes(db, scope), listGroups(db, scope)]);
  const calls: ModelCall[] = [];
  const of = (question: string): LabelAnswer[] =>
    probe.answers.filter((answer) => answer.question.question === question);
  const max = probes.max_items_per_answer;
  const known = of('known_for');
  const objections = of('objection');
  const labels: Labels = {
    known: known.length
      ? await ask(
          gateway,
          calls,
          {
            user: knownForRequest(probes, {
              brand: config.brandName,
              fallback: policy.perception.project_themes.fallback,
              themes,
              answers: known,
            }),
            schema: knownForOutput,
          },
          (value) => mapKnownFor(value, known, { themes, maxItems: max }),
        )
      : [],
    objections: objections.length
      ? await ask(
          gateway,
          calls,
          {
            user: objectionRequest(probes, {
              brand: config.brandName,
              groups,
              answers: objections,
            }),
            schema: objectionOutput,
          },
          (value) =>
            mapObjections(value, objections, {
              groups,
              maxItems: max,
              maxNewGroups: probes.max_new_groups_per_probe,
              nameMaxChars: probes.group_name_max_chars,
            }),
        )
      : { items: [], newGroups: [] },
    themes: [],
  };
  const tracked: TrackedName[] = [
    { kind: 'brand', id: null, name: config.brandName, aliases: config.brandAliases },
    ...config.competitors.flatMap((competitor) =>
      competitor.id
        ? [
            {
              kind: 'competitor' as const,
              id: competitor.id,
              name: competitor.name,
              aliases: competitor.aliases,
            },
          ]
        : [],
    ),
  ];
  const byTheme = new Map<string, typeof probe.answers>();
  for (const answer of probe.answers)
    if (answer.question.question === 'theme')
      byTheme.set(answer.question.theme_id, [
        ...(byTheme.get(answer.question.theme_id) ?? []),
        answer,
      ]);
  for (const [themeId, answers] of byTheme) {
    const request = {
      user: themeRequest(probes, { question: answers[0]?.questionText ?? '', answers }),
      schema: themeOutput,
    };
    const accept = (value: z.infer<typeof themeOutput>) =>
      mapThemeBrands(value, answers, { tracked, maxItems: max });
    const mapped = await ask(gateway, calls, request, accept); // NOSONAR -- One call per theme, in order.
    labels.themes.push(...mapped.map((item) => ({ ...item, themeId })));
  }
  return { labels, calls };
}

type Outcome =
  | { outcome: 'labelled'; labels: Labels }
  | { outcome: 'unavailable'; reason: 'model_not_configured' | 'task_failed' };

function persist(
  task: QueueTask,
  scope: Scope,
  auditId: string,
  outcome: Outcome,
  calls: ModelCall[],
) {
  return async (db: Database) => {
    const id = randomUUID();
    const now = new Date();
    const inserted = await db
      .insertInto('probe_labellings')
      .values({
        id,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        audit_id: auditId,
        labelling_version: probes.labelling_version,
        outcome: outcome.outcome,
        outcome_reason: outcome.outcome === 'unavailable' ? outcome.reason : null,
        model_provider: calls[0]?.provider ?? null,
        model: calls[0]?.model ?? null,
        usage: calls.length ? JSON.stringify({ calls: calls.map((call) => call.usage) }) : null,
        created_at: now,
      })
      .onConflict((conflict) => conflict.column('audit_id').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted || outcome.outcome !== 'labelled') return;
    const { known, objections, themes } = outcome.labels;
    const groupIds = await saveGroups(db, scope, objections.newGroups, now);
    const base = {
      workspace_id: task.workspace_id,
      project_id: scope.projectId,
      audit_id: auditId,
      labelling_id: id,
      created_at: now,
    };
    const empty = {
      theme_id: null,
      objection_group_id: null,
      entity_kind: null,
      entity_id: null,
      entity_name: null,
    };
    const rows = [
      ...known.map((item) => ({
        ...base,
        ...empty,
        id: randomUUID(),
        task_id: item.taskId,
        question: 'known_for',
        rank: item.rank,
        theme_id: item.themeId,
        quote: item.quote,
      })),
      ...objections.items.flatMap((item) => {
        const group =
          item.group.kind === 'existing' ? item.group.id : groupIds.get(nameKey(item.group.name));
        return group
          ? [
              {
                ...base,
                ...empty,
                id: randomUUID(),
                task_id: item.taskId,
                question: 'objection',
                rank: item.rank,
                objection_group_id: group,
                quote: item.quote,
              },
            ]
          : [];
      }),
      ...themes.map((item) => ({
        ...base,
        ...empty,
        id: randomUUID(),
        task_id: item.taskId,
        question: 'theme',
        rank: item.rank,
        theme_id: item.themeId,
        entity_kind: item.entity.kind,
        entity_id: item.entity.id,
        entity_name: item.entity.name,
        quote: '',
      })),
    ];
    if (rows.length) await db.insertInto('probe_answer_items').values(rows).execute();
  };
}

/** Creates the probe's new groups (a concurrent probe may have made one) and maps every name to its id. */
async function saveGroups(db: Database, scope: Scope, names: readonly string[], at: Date) {
  if (names.length)
    await db
      .insertInto('probe_objection_groups')
      .values(
        names.map((name) => ({
          id: randomUUID(),
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          name,
          created_at: at,
          updated_at: at,
        })),
      )
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  const groups = await listGroups(db, scope);
  return new Map(groups.map((group) => [nameKey(group.name), group.id]));
}

export function probeLabelling(
  gatewayFactory: () => ModelGateway | null = configuredGateway,
): Executor {
  return async (task, { db, checkCancelled }) => {
    const projectId = await taskProject(db, task);
    const scope = { workspaceId: task.workspace_id, projectId };
    const probe = await loadProbe(db, task, projectId);
    if (await labelled(db, probe.audit.id)) return;
    const settle = (outcome: Outcome, calls: ModelCall[] = []) => ({
      error: null,
      persist: persist(task, scope, probe.audit.id, outcome, calls),
    });
    const raw = gatewayFactory();
    if (!raw) return settle({ outcome: 'unavailable', reason: 'model_not_configured' });
    const gateway = meterFor(db, task.workspace_id).gateway(raw, 'probe_labelling');
    await checkCancelled('probe_labelling_model_call');
    const { labels, calls } = await label(db, gateway, scope, probe);
    return settle({ outcome: 'labelled', labels }, calls);
  };
}

/** A task that exhausted its attempts still records why the probe has no labels. */
export async function compensateProbeLabelling(db: Database, task: QueueTask) {
  const projectId = await taskProject(db, task);
  const probe = await loadProbe(db, task, projectId);
  await persist(
    task,
    { workspaceId: task.workspace_id, projectId },
    probe.audit.id,
    { outcome: 'unavailable', reason: 'task_failed' },
    [],
  )(db);
}
