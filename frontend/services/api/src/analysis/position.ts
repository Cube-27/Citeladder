/**
 * Where a brand sits among the brands one answer names.
 *
 * Ports `brand_position` and `competitor_position` from
 * `app/analysis/position.py`, which the scorer keeps. A rank is arithmetic
 * over first-mention offsets; an entity the answer never named has no rank,
 * which is not last place.
 */

type Offsets = Readonly<Record<string, unknown>>;

function isOffset(value: unknown): value is number {
  return typeof value === 'number';
}

/** The brand's 1-based rank among the brands named in one answer, or null. */
export function brandPosition(brandOffset: unknown, competitorOffsets: Offsets): number | null {
  if (brandOffset === null || brandOffset === undefined) return null;
  const ahead = Object.values(competitorOffsets).filter(
    (offset) => isOffset(offset) && offset < (brandOffset as number),
  ).length;
  return ahead + 1;
}

/** One competitor's rank inside one answer, by the same offset ordering. */
export function competitorPosition(score: Offsets, name: string): number | null {
  const offsets = (score.competitor_first_offsets || {}) as Offsets;
  const own = Object.hasOwn(offsets, name) ? offsets[name] : null;
  if (own === null || own === undefined) return null;
  const brandOffset = score.brand_first_offset;
  let ahead = Object.entries(offsets).filter(
    ([other, offset]) => other !== name && isOffset(offset) && offset < (own as number),
  ).length;
  if (isOffset(brandOffset) && brandOffset < (own as number)) ahead += 1;
  return ahead + 1;
}
