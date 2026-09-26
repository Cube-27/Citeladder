export interface SearchEntry {
  title: string;
  description: string;
  href: string;
  group: string;
  body: string;
}

/** Match every term, with exact titles and title matches ahead of body matches. */
export function searchArticles(entries: readonly SearchEntry[], query: string): SearchEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries
    .map((entry) => {
      const title = entry.title.toLocaleLowerCase();
      const summary = `${entry.group} ${entry.description}`.toLocaleLowerCase();
      const text = `${title} ${summary} ${entry.body.toLocaleLowerCase()}`;
      const score = terms.every((term) => text.includes(term))
        ? (title === normalized ? 100 : 0) +
          terms.reduce(
            (total, term) => total + (title.includes(term) ? 10 : summary.includes(term) ? 3 : 1),
            0,
          )
        : 0;
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 12)
    .map(({ entry }) => entry);
}
