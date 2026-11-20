/**
 * The Market tab (W12, AV-35/36): what the newest labelled probe's answers
 * say the brand is known for, and the brand's rank, leader and gap on every
 * current theme. Every number is a position score code computes here.
 */
import type { ProbeMarket } from '@citeladder/contracts/probes';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { listThemes } from '../projects/themes.ts';
import { probeAnswers, probeRoster, type ProbeAnswer } from './answers.ts';
import { probeLaunches } from './launches.ts';
import { probeSubject } from './questions.ts';
import { distinctPlaces, firstPlaces, positionScores, rankOf, scoreOf } from './scores.ts';

type Scope = { workspaceId: string; projectId: string };
type Theme = { id: string; name: string };
type KnownFor = Extract<ProbeMarket, { state: 'value' }>['known_for'][number];
const OTHER = 'other';
const BRAND = 'brand';
const TOP_THEMES = 3;

/** The brand's known-for scores over `answers`, highest first; Other is `theme_id: null`. */
function knownFor(answers: readonly ProbeAnswer[], themes: readonly Theme[]) {
  const asked = answers.filter((answer) => answer.question.question === 'known_for');
  const scores = positionScores(
    asked.map((answer) =>
      distinctPlaces(
        answer.items
          .filter((item) => item.question === 'known_for')
          .map((item) => ({ key: item.theme_id ?? OTHER, rank: item.rank })),
      ),
    ),
  );
  const names = new Map(themes.map((theme) => [theme.id, theme.name]));
  return [...scores]
    .flatMap(([key, { score, raised }]): KnownFor[] => {
      const theme = key === OTHER ? policy.perception.project_themes.fallback : names.get(key);
      if (!theme) return [];
      return [{ theme_id: key === OTHER ? null : key, theme, score, raised_in: raised }];
    })
    .sort((a, b) => b.score - a.score || a.theme.localeCompare(b.theme));
}

type Roster = Awaited<ReturnType<typeof probeRoster>>;

/** Every tracked business's score on one theme, the brand first. */
function themeScores(answers: readonly ProbeAnswer[], roster: Roster) {
  const scores = positionScores(
    answers.map((answer) =>
      firstPlaces(
        answer.items
          .filter((item) => item.question === 'theme')
          .map((item) => ({ key: item.entity_id ?? BRAND, rank: item.rank })),
      ),
    ),
  );
  const own = {
    kind: 'brand' as const,
    id: null,
    name: roster.brand,
    key: BRAND,
    score: scoreOf(scores, BRAND, answers.length) ?? 0,
  };
  const competitors = roster.competitors.map((competitor) => ({
    kind: 'competitor' as const,
    id: competitor.id,
    name: competitor.name,
    key: competitor.id,
    score: scoreOf(scores, competitor.id, answers.length) ?? 0,
  }));
  return { own, entities: [own, ...competitors] };
}

function themeRow(theme: Theme, answers: readonly ProbeAnswer[], roster: Roster) {
  const { own, entities } = themeScores(answers, roster);
  // Ties keep the brand first, so a shared top score reads as "You lead".
  const leader = entities.reduce(
    (best, entity) => (entity.score > best.score ? entity : best),
    own,
  );
  return {
    theme_id: theme.id,
    theme: theme.name,
    answers: answers.length,
    entities: entities.map(({ kind, id, name, score }) => ({ kind, id, name, score })),
    rank: rankOf(entities, BRAND)!,
    of: entities.length,
    leader: { kind: leader.kind, id: leader.id, name: leader.name, score: leader.score },
    gap: leader.score - own.score,
  };
}

const themeAnswers = (answers: readonly ProbeAnswer[], themeId: string) =>
  answers.filter(
    (answer) => answer.question.question === 'theme' && answer.question.theme_id === themeId,
  );

export async function probeMarket(db: Database, scope: Scope): Promise<ProbeMarket> {
  const [latest] = await probeLaunches(db, scope, { limit: 1, labelled: true });
  if (!latest) return { state: 'none' };
  const [answers, themes, roster, subject] = await Promise.all([
    probeAnswers(db, scope, latest.labelledIds),
    listThemes(db, scope),
    probeRoster(db, scope, latest.labelledIds),
    probeSubject(db, scope),
  ]);
  const rows = themes.flatMap((theme) => {
    const asked = themeAnswers(answers, theme.id);
    return asked.length ? [themeRow(theme, asked, roster)] : [];
  });
  const engines = latest.run.engines.map((engine) => {
    const own = answers.filter((answer) => answer.engine === engine);
    const top = knownFor(own, themes)
      .filter((row) => row.score > 0)
      .slice(0, TOP_THEMES);
    const first = top[0]?.theme_id;
    const asked = first ? themeAnswers(own, first) : [];
    const row = first && asked.length ? themeRow({ id: first, name: '' }, asked, roster) : null;
    return {
      engine,
      answered: own.some((answer) => answer.question.question === 'known_for'),
      top_themes: top.map(({ theme_id, theme }) => ({ theme_id, theme })),
      // A gap as large as the leader's score means the brand scored 0: not named.
      rank_in_top_theme: row && row.gap < row.leader.score ? row.rank : null,
    };
  });
  return {
    state: 'value',
    probe: { ...latest.run, answers: answers.length },
    brand: roster.brand,
    category: subject.category,
    language_code: latest.run.markets[0]?.language_code ?? '',
    known_for_answers: answers.filter((answer) => answer.question.question === 'known_for').length,
    known_for: knownFor(answers, themes),
    themes: rows,
    engines,
  };
}
