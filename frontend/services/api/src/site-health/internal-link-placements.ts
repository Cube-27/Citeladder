import type { InternalLinkPage, InternalLinkPlacement } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';

const limits = policy.internal_links;
const stopWords = new Set<string>(limits.stop_words);
const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const words = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+/gu)];

/** Exact, bounded source spans; flattened crawl text does not establish DOM paragraphs. */
export function sourcePassages(
  text: string,
  headings: string[] = [],
): InternalLinkPage['source_passages'] {
  const passages: InternalLinkPage['source_passages'] = [];
  // The extractor flattens headings into the text. Split at their observed,
  // ordered occurrences so an H1 and its opening sentence cannot form an anchor.
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const heading of headings) {
    if (!heading.trim()) continue;
    const index = text.indexOf(heading, cursor);
    if (index < 0) continue;
    ranges.push({ start: cursor, end: index });
    cursor = index + heading.length;
  }
  ranges.push({ start: cursor, end: text.length });
  for (const range of ranges) {
    for (const { segment, index: offset } of segmenter.segment(
      text.slice(range.start, range.end),
    )) {
      const index = range.start + offset;
      if (index + segment.length > limits.max_source_chars) return passages;
      const value = segment.trim();
      if (
        value.length > limits.max_passage_chars ||
        words(value).length < limits.min_passage_words ||
        !/[.!?。！？][\s"'’”)]*$/u.test(value)
      )
        continue;
      const start = index + segment.indexOf(value);
      passages.push({ text: value, start, end: start + value.length });
      if (passages.length >= limits.max_passages) return passages;
    }
  }
  return passages;
}

/** Candidate phrases share destination vocabulary; JEV decides meaning in context. */
export function sourcePlacements(
  passages: InternalLinkPage['source_passages'],
  targetTerms: Set<string>,
): InternalLinkPlacement[] {
  const found: InternalLinkPlacement[] = [];
  for (const passage of passages) {
    const tokens = words(passage.text);
    for (let start = 0; start < tokens.length; start += 1) {
      const first = tokens[start]!;
      if (!targetTerms.has(first[0].toLowerCase())) continue;
      let end = start;
      for (let next = start + 1; next < tokens.length; next += 1) {
        const token = tokens[next]!;
        const previous = tokens[next - 1]!;
        if (
          next - start >= limits.max_anchor_words ||
          !/^[\s-]+$/u.test(passage.text.slice(previous.index + previous[0].length, token.index)) ||
          (!targetTerms.has(token[0].toLowerCase()) && !stopWords.has(token[0].toLowerCase()))
        )
          break;
        if (targetTerms.has(token[0].toLowerCase())) end = next;
      }
      const last = tokens[end]!;
      const anchor = passage.text.slice(first.index, last.index + last[0].length);
      if (anchor.length >= limits.min_anchor_chars && anchor.length <= limits.max_anchor_chars)
        found.push({ ...passage, anchor, anchor_start: first.index });
      start = end;
    }
  }
  // Longer phrases carry more specific meaning; retain source order for ties.
  return found
    .toSorted((a, b) => words(b.anchor).length - words(a.anchor).length)
    .slice(0, limits.max_placements);
}
