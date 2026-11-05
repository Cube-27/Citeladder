/**
 * Slug for a body heading, used as its anchor id and Toc target.
 *
 * A heading carrying no ASCII alphanumerics at all — one written entirely in
 * another script, or in punctuation — would otherwise slug to the bare prefix,
 * so every such heading in a post would answer to the same anchor. The
 * character-sum fallback keeps those distinct. Two headings with identical
 * text still collide by construction; `content.test.ts` fails the build on a
 * post that contains a pair, which is the point at which an editor can retitle
 * one rather than ship a contents link that jumps to the wrong section.
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
