import { z } from 'zod';

export const searchIndexSchema = z.array(
  z.object({
    title: z.string(),
    description: z.string(),
    href: z.string(),
    group: z.string(),
    body: z.string(),
  }),
);

export type SearchEntry = z.infer<typeof searchIndexSchema>[number];

function termWeight(term: string, title: string, summary: string): number {
  if (title.includes(term)) return 10;
  if (summary.includes(term)) return 3;
  return 1;
}

export type Segment = { text: string; match: boolean };

const escapeRegExp = (term: string) => term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

export function highlight(text: string, query: string): Segment[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [{ text, match: false }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase()),
    }));
}

export function groupResults(results: readonly SearchEntry[]) {
  const groups: { label: string; items: SearchEntry[] }[] = [];
  for (const result of results) {
    const group = groups.find((candidate) => candidate.label === result.group);
    if (group) group.items.push(result);
    else groups.push({ label: result.group, items: [result] });
  }
  return groups;
}

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
