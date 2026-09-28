import { randomUUID } from 'node:crypto';
import type { ContentPage } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';
import { retrievalIndex, spread, stopWords, words } from './content-retrieval.ts';

const limits = policy.content_structure;
type Passage = ContentPage['passages'][number];
export type Anchor = { text: string; start: number; end: number };
export type LinkCandidate = {
  id: string;
  kind: 'link';
  source: string;
  target: string;
  passage: Passage;
  anchors: Anchor[];
};
export type TopicCandidate = {
  id: string;
  kind: 'topic';
  page: string;
  passage: Passage | null;
  labels: { id: string; label: string; source: string }[];
};
export type ContentCandidate = LinkCandidate | TopicCandidate;

/** Only contiguous existing text outside every observed anchor is selectable. */
export function anchorCandidates(passage: Passage, target: ContentPage): Anchor[] {
  const tokens = [...passage.text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)];
  const targetWords = words(`${target.title} ${target.headings.join(' ')}`);
  const candidates: (Anchor & { score: number })[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    for (
      let length = limits.min_anchor_words;
      length <= limits.max_anchor_words && index + length <= tokens.length;
      length += 1
    ) {
      const start = tokens[index]!.index;
      const last = tokens[index + length - 1]!;
      const end = last.index + last[0].length;
      if (passage.linked_ranges.some((range) => start < range.end && end > range.start)) continue;
      const text = passage.text.slice(start, end);
      if (/[^\p{L}\p{N}\s'’–-]/u.test(text)) continue;
      if (
        stopWords.has(tokens[index]![0].toLocaleLowerCase()) ||
        stopWords.has(last[0].toLocaleLowerCase())
      )
        continue;
      const score = [...words(text)].filter((word) => targetWords.has(word)).length;
      candidates.push({ text, start, end, score });
    }
  }
  const ranked = candidates.toSorted(
    (a, b) => b.score - a.score || a.start - b.start || a.end - b.end,
  );
  const lexical = ranked
    .filter((item) => item.score > 0)
    .slice(0, Math.floor(limits.max_anchors / 2));
  const selected = new Set(lexical);
  return [
    ...lexical,
    ...spread(
      ranked.filter((item) => !selected.has(item)),
      limits.max_anchors - lexical.length,
    ),
  ].map(({ text, start, end }) => ({ text, start, end }));
}

export function linkCandidates(pages: ContentPage[]): {
  candidates: LinkCandidate[];
  omitted: number;
} {
  const candidates: LinkCandidate[] = [];
  const index = retrievalIndex(pages);
  let omitted = 0;
  for (const source of pages) {
    if (!source.links_complete || !source.passages.length) continue;
    const query = words(
      `${source.title} ${source.excerpt} ${source.passages.map((p) => p.text).join(' ')}`,
    );
    const ranked = pages
      .filter(
        (target) =>
          target.eligible_target &&
          target.url !== source.url &&
          !source.contextual_targets.includes(target.url),
      )
      .map((target) => ({
        target,
        score: index.score(query, index.documents.get(target.analysis_id)!),
      }))
      .toSorted((a, b) => b.score - a.score || a.target.url.localeCompare(b.target.url));
    const nearest = ranked.slice(0, limits.targets_per_page - limits.exploration_targets);
    const targets = [
      ...nearest,
      ...spread(ranked.slice(nearest.length), limits.targets_per_page - nearest.length),
    ];
    omitted += ranked.length - targets.length;
    const passageQueries = source.passages.map((passage) => ({
      passage,
      query: words(`${passage.heading} ${passage.text}`),
    }));
    for (const { target } of targets) {
      const passages = passageQueries
        .map(({ passage, query }) => ({
          passage,
          score: index.score(query, index.documents.get(target.analysis_id)!),
        }))
        .toSorted((a, b) => b.score - a.score);
      for (const { passage } of passages) {
        const anchors = anchorCandidates(passage, target);
        if (!anchors.length) continue;
        candidates.push({
          id: randomUUID(),
          kind: 'link',
          source: source.analysis_id,
          target: target.analysis_id,
          passage,
          anchors,
        });
        break;
      }
    }
  }
  return { candidates, omitted };
}

function sourceLabel(raw: string): string | null {
  const tokens = [...raw.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)];
  while (tokens.length && stopWords.has(tokens[0]![0].toLocaleLowerCase())) tokens.shift();
  while (tokens.length && stopWords.has(tokens.at(-1)![0].toLocaleLowerCase())) tokens.pop();
  if (!tokens.length) return null;
  const last = tokens.at(-1)!;
  const label = raw.slice(tokens[0]!.index, last.index + last[0].length).trim();
  const count = label.split(/\s+/u).length;
  return count < limits.min_label_words || count > limits.max_label_words ? null : label;
}

export function topicCandidates(pages: ContentPage[]): {
  candidates: TopicCandidate[];
  omitted: number;
} {
  const labels = new Map<string, { id: string; label: string; source: string }>();
  const sourceLabels = pages.map((page) => ({
    page,
    texts: [...page.headings, ...page.title.split(/\s*[|:–—]\s*/u)],
  }));
  // Round-robin source coverage, not lexical topic classification. These are
  // verbatim options; JEV decides which are meaningful and which fit a page.
  const depth = Math.max(0, ...sourceLabels.map((source) => source.texts.length));
  for (let position = 0; position < depth; position += 1) {
    for (const { page, texts } of sourceLabels) {
      const raw = texts[position];
      if (!raw) continue;
      const label = sourceLabel(raw);
      if (!label) continue;
      const key = label.toLocaleLowerCase();
      if (!labels.has(key)) labels.set(key, { id: randomUUID(), label, source: page.analysis_id });
    }
  }
  const selected = [...labels.values()].slice(0, limits.max_topic_labels);
  const candidates = selected.length
    ? pages.flatMap((page) =>
        [null, ...spread(page.passages, limits.topic_passages_per_page)].map((passage) => ({
          id: randomUUID(),
          kind: 'topic' as const,
          page: page.analysis_id,
          passage,
          labels: selected,
        })),
      )
    : [];
  return { candidates, omitted: labels.size - selected.length };
}
