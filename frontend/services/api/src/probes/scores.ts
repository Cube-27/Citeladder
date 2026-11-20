/**
 * The position score (AV-35), computed by code: 100 when named first, minus
 * 10 per later place, 0 when not raised, averaged over every answer the probe
 * got to that question, so an answer that never raised it counts as 0.
 */

/** One answer's score for an item at `place` (0 is first); null is not raised. */
export const placeScore = (place: number | null) =>
  place === null ? 0 : Math.max(0, 100 - 10 * place);

/**
 * Each key's place in one answer's items, read in the answer's order: the
 * place among the distinct keys raised so far, so two points under one theme
 * (or reasons merged into one group) never push later ones down.
 */
export function distinctPlaces<Key>(items: readonly { key: Key; rank: number }[]) {
  const places = new Map<Key, number>();
  for (const item of [...items].sort((a, b) => a.rank - b.rank))
    if (!places.has(item.key)) places.set(item.key, places.size);
  return places;
}

/** Each key's places as stored: the first rank it was named at. */
export function firstPlaces<Key>(items: readonly { key: Key; rank: number }[]) {
  const places = new Map<Key, number>();
  for (const item of items) {
    const prior = places.get(item.key);
    if (prior === undefined || item.rank < prior) places.set(item.key, item.rank);
  }
  return places;
}

/**
 * Every key's score over `answers` (each answer's places by key) and how many
 * answers raised it. No answers is no score, never zero.
 */
export function positionScores<Key>(answers: readonly ReadonlyMap<Key, number>[]) {
  const totals = new Map<Key, { sum: number; raised: number }>();
  for (const places of answers)
    for (const [key, place] of places) {
      const total = totals.get(key) ?? { sum: 0, raised: 0 };
      total.sum += placeScore(place);
      total.raised += 1;
      totals.set(key, total);
    }
  return new Map(
    [...totals].map(([key, { sum, raised }]) => [
      key,
      { score: Math.round(sum / answers.length), raised },
    ]),
  );
}

/** A key's score among `scores`, 0 when it was never raised and null without answers. */
export function scoreOf<Key>(
  scores: ReadonlyMap<Key, { score: number }>,
  key: Key,
  answers: number,
): number | null {
  if (!answers) return null;
  return scores.get(key)?.score ?? 0;
}

/**
 * Standard competition ranking of `subject` among `entries` by score: one plus
 * the number scoring strictly higher, so ties share a rank.
 */
export function rankOf<Key>(entries: readonly { key: Key; score: number }[], subject: Key) {
  const own = entries.find((entry) => entry.key === subject);
  if (!own) return null;
  return 1 + entries.filter((entry) => entry.score > own.score).length;
}
