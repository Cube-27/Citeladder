import type { ProbeMarketValue, ProbeObjectionsValue } from '@citeladder/contracts/probes';

type ThemeRow = ProbeMarketValue['themes'][number];

/** The Market tab's headline and KPI picks, from a labelled probe. */
export function marketSummary(data: ProbeMarketValue) {
  const top = data.known_for.find((item) => item.theme_id !== null && item.score > 0);
  // Ties put the brand first, so a led theme is one the brand tops with a score.
  const led = data.themes.filter(
    (row) => row.rank === 1 && row.leader.kind === 'brand' && row.leader.score > 0,
  );
  const best = [...led].sort((a, b) => b.leader.score - a.leader.score);
  const gaps = data.themes.filter((row) => row.gap > 0);
  const biggestGap = gaps.reduce<ThemeRow | undefined>(
    (worst, row) => (worst === undefined || row.gap > worst.gap ? row : worst),
    undefined,
  );
  // A rank is shown only where answers named the brand: an all-zero theme ranks everyone first.
  const topRow = data.themes.find(
    (row) =>
      row.theme_id === top?.theme_id &&
      row.entities.some((entity) => entity.kind === 'brand' && entity.score > 0),
  );
  return { top, topRow, led, biggestGap, headline: headline(data.brand, top?.theme, best[0]) };
}

function headline(brand: string, top: string | undefined, best: ThemeRow | undefined) {
  if (top === undefined) return `How AI describes ${brand}`;
  if (best === undefined) return `AI describes ${brand} as ${top}`;
  if (best.theme === top)
    return `AI describes ${brand} as ${top}, and that is also where it competes best`;
  return `AI describes ${brand} as ${top}, and it competes best on ${best.theme}`;
}

/** The Objections tab's headline and KPI picks: groups the probe raised. */
export function objectionsSummary(data: ProbeObjectionsValue) {
  // A late, rare objection can average to 0 and still be raised by an engine.
  const raised = data.groups.filter((group) => group.score > 0 || group.engines.length > 0);
  const [first] = raised;
  const widest = raised.reduce<(typeof raised)[number] | undefined>(
    (most, group) =>
      most === undefined || group.engines.length > most.engines.length ? group : most,
    undefined,
  );
  const average = raised.length
    ? Math.round(raised.reduce((sum, group) => sum + group.score, 0) / raised.length)
    : null;
  return { raised, widest, average, headline: objectionsHeadline(data, first?.name) };
}

function objectionsHeadline(data: ProbeObjectionsValue, first: string | undefined) {
  if (data.answers === 0) return 'No engine answered the objection question';
  if (first === undefined) return `AI raises no objections to ${data.brand}`;
  return `${first} is the objection AI raises first`;
}
