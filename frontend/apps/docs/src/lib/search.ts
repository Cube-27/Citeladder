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

/** A run of result text; `match` marks a run that is one of the query's terms. */
export type Segment = { text: string; match: boolean };

/** Split text into runs, marking every case-insensitive occurrence of a query term. */
export function highlight(text: string, query: string): Segment[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [{ text, match: false }];
  const pattern = new RegExp(
    `(${terms.map((term) => term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join('|')})`,
    'gi',
  );
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase()),
    }));
}

/**
 * Ranked results grouped by their docs group, groups ordered by their best
 * result. The keyboard walks the results in this displayed order.
 */
export function groupResults(results: readonly SearchEntry[]) {
  const groups: { label: string; items: SearchEntry[] }[] = [];
  for (const result of results) {
    const group = groups.find((candidate) => candidate.label === result.group);
    if (group) group.items.push(result);
    else groups.push({ label: result.group, items: [result] });
  }
  return groups;
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
