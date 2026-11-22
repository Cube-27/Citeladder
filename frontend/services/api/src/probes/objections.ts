import type { ProbeObjections } from '@citeladder/contracts/probes';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { logicalEngines } from '../providers/config.ts';
import { probeAnswers, type ProbeAnswer } from './answers.ts';
import { labelledLaunches } from './launches.ts';
import { listGroups } from './objection-groups.ts';
import { citedPages } from './pages.ts';
import { distinctPlaces, positionScores, scoreOf } from './scores.ts';

const probes = policy.probes;

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

export async function probeObjections(db: Database, scope: Scope): Promise<ProbeObjections> {
  const launches = await labelledLaunches(db, scope, probes.history_probes);
  const latest = launches[0];
  if (!latest) return { state: 'none' };
  const [history, groups] = await Promise.all([
    Promise.all(launches.map((launch) => probeAnswers(db, scope, launch.ids))),
    listGroups(db, scope),
  ]);
  const [latestAnswers = []] = history;
  const current = groupScores(latestAnswers);
  const scored = history.map(groupScores).reverse();
  const pagesOf = await citedPages(db, scope, current.asked);
  const rows = groups.map((group) => {
    const series = scored.map(({ asked, scores }) => scoreOf(scores, group.id, asked.length));
    const score = series.at(-1) ?? null;
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
      history: series,
      ...(raising.size
        ? pagesOf((answer) => answer.items.some((item) => item.objection_group_id === group.id))
        : { sources: null, pages: [] }),
    };
  });
  const raised = rows.filter((row) => row.engines.length > 0);
  const answering = new Set(current.asked.map((answer) => answer.engine));
  return {
    state: 'value',
    probe: { ...latest.basis, answers: latestAnswers.length },
    brand: latest.brand,
    answers: current.asked.length,
    answered_by: logicalEngines.filter((engine) => answering.has(engine)),
    average: raised.length
      ? Math.round(raised.reduce((sum, row) => sum + (row.score ?? 0), 0) / raised.length)
      : null,
    groups: rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)),
  };
}

export async function probeObjection(db: Database, scope: Scope, groupId: string) {
  const objections = await probeObjections(db, scope);
  if (objections.state !== 'value') return null;
  const group = objections.groups.find((row) => row.id === groupId);
  if (!group) return null;
  return {
    name: group.name,
    score: group.score,
    engines: group.engines,
    answered_by: objections.answered_by,
    probe_created_at: objections.probe.created_at,
    sources: group.sources,
    pages: group.pages,
  };
}
