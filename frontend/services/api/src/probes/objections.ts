/**
 * The Objections tab (W13, AV-35/36): each objection group's position score
 * in the newest labelled probe, the engines raising it, its scores over the
 * recent probes, and the pages the answers raising it cited. An answer that
 * did not search cites nothing, so a group can truly have no sources.
 */
import type { ProbeObjections } from '@citeladder/contracts/probes';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { logicalEngines } from '../providers/config.ts';
import { probeAnswers, probeRoster, type ProbeAnswer } from './answers.ts';
import { probeLaunches } from './launches.ts';
import { listGroups } from './objection-groups.ts';
import { distinctPlaces, positionScores, scoreOf } from './scores.ts';

type Scope = { workspaceId: string; projectId: string };
const probes = policy.probes;

/** Each group's score over a probe's objection answers, and how many answers there were. */
function groupScores(answers: readonly ProbeAnswer[]) {
  const asked = answers.filter((answer) => answer.question.question === 'objection');
  return {
    asked,
    scores: positionScores(
      asked.map((answer) =>
        distinctPlaces(
          answer.items.flatMap((item) =>
            item.objection_group_id ? [{ key: item.objection_group_id, rank: item.rank }] : [],
          ),
        ),
      ),
    ),
  };
}

/** The pages each group's answers cited, most cited first. */
async function groupPages(db: Database, scope: Scope, asked: readonly ProbeAnswer[]) {
  const taskIds = asked.map((answer) => answer.taskId);
  const rows = taskIds.length
    ? await db
        .selectFrom('citations as c')
        .innerJoin('response_analyses as ra', 'ra.id', 'c.analysis_id')
        .select(['ra.task_id', 'c.url', 'c.title', 'c.domain', 'c.classification'])
        .distinctOn(['ra.task_id', 'c.url'])
        .where('ra.workspace_id', '=', scope.workspaceId)
        .where('c.workspace_id', '=', scope.workspaceId)
        .where('ra.task_id', 'in', taskIds)
        .orderBy('ra.task_id')
        .orderBy('c.url')
        .orderBy('c.ordinal')
        .execute()
    : [];
  const byTask = new Map<string, typeof rows>();
  for (const row of rows) byTask.set(row.task_id, [...(byTask.get(row.task_id) ?? []), row]);
  return (groupId: string) => {
    const pages = new Map<
      string,
      { url: string; title: string; domain: string; classification: string; citations: number }
    >();
    for (const answer of asked)
      if (answer.items.some((item) => item.objection_group_id === groupId))
        for (const row of byTask.get(answer.taskId) ?? []) {
          const page = pages.get(row.url) ?? {
            url: row.url,
            title: row.title,
            domain: row.domain,
            classification: row.classification,
            citations: 0,
          };
          page.citations += 1;
          pages.set(row.url, page);
        }
    const sorted = [...pages.values()].sort(
      (a, b) => b.citations - a.citations || a.url.localeCompare(b.url),
    );
    return { sources: sorted.length, pages: sorted.slice(0, probes.max_sources_per_group) };
  };
}

export async function probeObjections(db: Database, scope: Scope): Promise<ProbeObjections> {
  const launches = await probeLaunches(db, scope, { limit: probes.history_probes, labelled: true });
  const latest = launches[0];
  if (!latest) return { state: 'none' };
  const [history, groups, roster] = await Promise.all([
    Promise.all(launches.map((launch) => probeAnswers(db, scope, launch.labelledIds))),
    listGroups(db, scope),
    probeRoster(db, scope, latest.labelledIds),
  ]);
  const [latestAnswers = []] = history;
  const current = groupScores(latestAnswers);
  // Oldest first, the newest probe last.
  const scored = history.map(groupScores).reverse();
  const pagesOf = await groupPages(db, scope, current.asked);
  const rows = groups.map((group) => {
    const series = scored.map(({ asked, scores }) => scoreOf(scores, group.id, asked.length));
    const score = series.at(-1) ?? null;
    const previous = series.length > 1 ? (series.at(-2) ?? null) : null;
    const raising = new Set(
      current.asked
        .filter((answer) => answer.items.some((item) => item.objection_group_id === group.id))
        .map((answer) => answer.engine),
    );
    return {
      id: group.id,
      name: group.name,
      score,
      engines: logicalEngines.filter((engine) => raising.has(engine)),
      change: score !== null && previous !== null ? score - previous : null,
      history: series,
      ...pagesOf(group.id),
    };
  });
  // A late, rare objection can average to 0 and still be raised by an engine.
  const raised = rows.filter((row) => row.engines.length > 0);
  return {
    state: 'value',
    probe: { ...latest.run, answers: latestAnswers.length },
    brand: roster.brand,
    answers: current.asked.length,
    average: raised.length
      ? Math.round(raised.reduce((sum, row) => sum + (row.score ?? 0), 0) / raised.length)
      : null,
    groups: rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)),
  };
}
