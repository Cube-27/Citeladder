import type { Database } from '../db/database.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { compareText } from '../text-order.ts';
import { pageSection } from '../visibility/source-url.ts';
import { answeredProbeTasks } from './answers.ts';
import { labelledLaunches } from './launches.ts';

function counted(values: readonly { key: string; task: string }[]) {
  const tasks = Map.groupBy(values, (value) => value.key);
  return [...tasks]
    .map(([key, rows]) => ({ key, answers: new Set(rows.map((row) => row.task)).size }))
    .sort((a, b) => b.answers - a.answers || compareText(a.key, b.key));
}

export async function probeCitedPage(
  db: Database,
  scope: Scope,
  { url, engine }: { url: string; engine: string | null },
) {
  const [latest] = await labelledLaunches(db, scope, 1);
  if (!latest) return null;
  let query = answeredProbeTasks(db, scope, latest.ids)
    .innerJoin('response_analyses as ra', 'ra.task_id', 't.id')
    .innerJoin('citations as c', 'c.analysis_id', 'ra.id')
    .select(['t.id as task_id', 'ra.logical_engine', 'p.text', 'c.title', 'c.url_hash'])
    .where('ra.workspace_id', '=', scope.workspaceId)
    .where('c.workspace_id', '=', scope.workspaceId)
    .where('c.url', '=', url)
    .orderBy('t.id')
    .orderBy('c.ordinal');
  if (engine !== null) query = query.where('ra.logical_engine', '=', engine);
  const rows = await query.execute();
  if (!rows.length) return null;
  const engines = counted(rows.map((row) => ({ key: row.logical_engine, task: row.task_id })));
  const questions = counted(rows.map((row) => ({ key: row.text, task: row.task_id })));
  return {
    url,
    title: rows.find((row) => row.title)?.title ?? '',
    cited_by: 'market_probe',
    probe: {
      launch_id: latest.basis.launch_id,
      created_at: latest.basis.created_at,
      answers: new Set(rows.map((row) => row.task_id)).size,
      engines: engines.map(({ key, answers }) => ({ logical_engine: key, answers })),
      questions: questions.map(({ key, answers }) => ({ question: key, answers })),
    },
    page: await pageSection(db, scope, rows.find((row) => row.url_hash)?.url_hash),
  };
}
