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

export function headingIds() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = headingId(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

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
