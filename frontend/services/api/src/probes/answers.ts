/**
 * A labelled probe's answers and what each raised: the persisted projection
 * the Market and Objections reads score. Only recorded answers count; an
 * answer that raised nothing still counts in every average it belongs to.
 */
import { scoringConfig } from '../analysis/scoring.ts';
import type { Database } from '../db/database.ts';
import { logicalEngines, type Engine } from '../providers/config.ts';
import { frozenQuestion, type ProbeQuestion } from './questions.ts';

type Scope = { workspaceId: string; projectId: string };

export type ProbeItem = {
  question: string;
  rank: number;
  theme_id: string | null;
  objection_group_id: string | null;
  entity_kind: string | null;
  entity_id: string | null;
};
export type ProbeAnswer = {
  taskId: string;
  engine: Engine;
  question: ProbeQuestion;
  items: ProbeItem[];
};

const engineOf = (value: string) => logicalEngines.find((engine) => engine === value);

export async function probeAnswers(
  db: Database,
  scope: Scope,
  auditIds: readonly string[],
): Promise<ProbeAnswer[]> {
  if (!auditIds.length) return [];
  const [tasks, items] = await Promise.all([
    db
      .selectFrom('audit_tasks as t')
      .innerJoin('audit_prompt_snapshots as p', (join) =>
        join.onRef('p.id', '=', 't.prompt_snapshot_id').onRef('p.audit_id', '=', 't.audit_id'),
      )
      .select(['t.id', 't.logical_engine', 'p.generation_evidence'])
      .where('t.workspace_id', '=', scope.workspaceId)
      .where('t.project_id', '=', scope.projectId)
      .where('t.audit_id', 'in', auditIds)
      .where('t.status', '=', 'succeeded')
      .where('t.answer_text', '<>', '')
      .orderBy('t.id')
      .execute(),
    db
      .selectFrom('probe_answer_items')
      .select([
        'task_id',
        'question',
        'rank',
        'theme_id',
        'objection_group_id',
        'entity_kind',
        'entity_id',
      ])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('audit_id', 'in', auditIds)
      .execute(),
  ]);
  const byTask = new Map<string, ProbeItem[]>();
  for (const { task_id: taskId, ...item } of items)
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), item]);
  return tasks.flatMap((task) => {
    const question = frozenQuestion(task.generation_evidence);
    const engine = engineOf(task.logical_engine);
    return question && engine
      ? [{ taskId: task.id, engine, question, items: byTask.get(task.id) ?? [] }]
      : [];
  });
}

/** The tracked businesses a probe's first run froze: the brand, then competitors with ids. */
export async function probeRoster(db: Database, scope: Scope, auditIds: readonly string[]) {
  const audit = auditIds.length
    ? await db
        .selectFrom('audits')
        .select('configuration')
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', 'in', auditIds)
        .orderBy('created_at')
        .orderBy('id')
        .executeTakeFirst()
    : undefined;
  const config = scoringConfig(audit?.configuration);
  return {
    brand: config.brandName,
    competitors: config.competitors.flatMap(({ id, name }) => (id ? [{ id, name }] : [])),
  };
}
