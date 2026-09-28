import type { ContentPage } from '@citeladder/contracts/site-health';
import { policy } from '../config.ts';

export const stopWords = new Set<string>(policy.content_structure.stop_words);

export function words(text: string): Set<string> {
  return new Set(
    (text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(
      (word) => !stopWords.has(word),
    ),
  );
}

/** Site-common brand/template words must not dominate retrieval. */
export function retrievalIndex(pages: ContentPage[]) {
  const documents = new Map(
    pages.map((page) => [
      page.analysis_id,
      words(`${page.title} ${page.headings.join(' ')} ${page.excerpt}`),
    ]),
  );
  const frequencies = new Map<string, number>();
  for (const document of documents.values())
    for (const word of document) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const weight = (word: string) => {
    const count = frequencies.get(word) ?? 0;
    if (pages.length > 2 && count / pages.length > policy.content_structure.common_word_fraction)
      return 0;
    return Math.log(1 + pages.length / Math.max(1, count));
  };
  const totals = new WeakMap<Set<string>, number>();
  const score = (query: Set<string>, document: Set<string>) => {
    let shared = 0;
    let total = totals.get(query);
    if (total === undefined) {
      total = [...query].reduce((sum, word) => sum + weight(word), 0);
      totals.set(query, total);
    }
    const [smaller, larger] = query.size < document.size ? [query, document] : [document, query];
    for (const word of smaller) if (larger.has(word)) shared += weight(word);
    return total ? shared / total : 0;
  };
  return { documents, score };
}

/** Sample the whole remainder, rather than always selecting its first URLs. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)]!,
  );
}
