export interface SearchEntry {
  title: string;
  description: string;
  href: string;
  group: string;
  body: string;
}

function termWeight(term: string, title: string, summary: string): number {
  if (title.includes(term)) return 10;
  if (summary.includes(term)) return 3;
  return 1;
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
      if (!terms.every((term) => text.includes(term))) return { entry, score: 0 };
      const exactTitle = title === normalized ? 100 : 0;
      const score = terms.reduce(
        (total, term) => total + termWeight(term, title, summary),
        exactTitle,
      );
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 12)
    .map(({ entry }) => entry);
}
