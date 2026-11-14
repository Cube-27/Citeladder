/**
 * Slug for a body heading, used as its anchor id and Toc target.
 *
 * A heading carrying no ASCII alphanumerics at all — one written entirely in
 * another script, or in punctuation — would otherwise slug to the bare prefix,
 * so every such heading in a post would answer to the same anchor. The
 * character-sum fallback keeps those distinct. Two headings with identical
 * text still collide here; a Markdown guide numbers repeats through
 * `headingIds`, and `content.test.ts` fails the build on a block post that
 * contains a pair.
 */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug) return `s-${slug}`;
  let sum = 0;
  for (const character of text) sum = (sum * 31 + character.codePointAt(0)!) % 1_000_000;
  return `s-h${sum}`;
}

/** Anchor ids for one document's headings in order: a repeated heading gets `-2`, `-3`… */
export function headingIds() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = headingId(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

/** Stable React keys for a list whose values may repeat. */
export function withOccurrenceKeys<T>(
  values: readonly T[],
  identity: (value: T) => string,
): Array<{ key: string; value: T }> {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const base = identity(value);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { key: `${base}:${occurrence}`, value };
  });
}
