/**
 * The two letters that stand in for a brand when no logo resolves.
 *
 * A bracketed expansion is dropped before anything else: discovery returns
 * names with their long form in tow — "EY (Ernst & Young)" — and reading across
 * it produced "EE" for a brand whose whole name is already the two letters.
 * Only letters and digits count as a word after that, so "PwC (Pricewaterhouse
 * Coopers)" is "PW" rather than the "P(" that punctuation used to yield.
 *
 * Indexing is by code point, not UTF-16 unit, so an astral initial (𝕏) is one
 * character rather than half a surrogate pair.
 */
export function brandInitials(name: string) {
  const [first, second] = name.replace(/\([^)]*\)/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!first) return '?';
  const head = [...first];
  if (!second) return head.slice(0, 2).join('').toUpperCase();
  return (head[0] + [...second][0]).toUpperCase();
}
