import { randomUUID } from 'node:crypto';
import type { ContentPage } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';

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
  label: string;
  source: string;
  page: string;
};
export type ContentCandidate = LinkCandidate | TopicCandidate;

function words(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function overlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const word of left) if (right.has(word)) count += 1;
  return count / Math.sqrt(Math.max(1, left.size * right.size));
}

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
      if (/[.!?;:]/u.test(text)) continue;
      const score = overlap(words(text), targetWords);
      if (score > 0) candidates.push({ text, start, end, score });
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.start - b.start || a.end - b.end)
    .slice(0, limits.max_anchors)
    .map(({ text, start, end }) => ({ text, start, end }));
}

export function linkCandidates(pages: ContentPage[]): {
  candidates: LinkCandidate[];
  omitted: number;
} {
  const candidates: LinkCandidate[] = [];
  const targetWords = new Map(
    pages.map((page) => [page.analysis_id, words(`${page.title} ${page.excerpt}`)]),
  );
  for (const source of pages) {
    if (!source.links_complete) continue;
    const seen = new Set<string>();
    for (const passage of source.passages) {
      const query = words(`${passage.heading} ${passage.text}`);
      const targets = pages
        .filter(
          (target) =>
            target.eligible_target &&
            target.url !== source.url &&
            !source.contextual_targets.includes(target.url) &&
            !seen.has(target.url),
        )
        .map((target) => ({ target, score: overlap(query, targetWords.get(target.analysis_id)!) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.target.url.localeCompare(b.target.url))
        .slice(0, limits.targets_per_passage);
      for (const { target } of targets) {
        const anchors = anchorCandidates(passage, target);
        if (!anchors.length) continue;
        seen.add(target.url);
        candidates.push({
          id: randomUUID(),
          kind: 'link',
          source: source.analysis_id,
          target: target.analysis_id,
          passage,
          anchors,
        });
      }
    }
  }
  return {
    candidates: candidates.slice(0, limits.max_link_candidates),
    omitted: Math.max(0, candidates.length - limits.max_link_candidates),
  };
}

export function topicCandidates(pages: ContentPage[]): {
  candidates: TopicCandidate[];
  omitted: number;
} {
  const labels = new Map<string, { label: string; source: string }>();
  for (const page of pages) {
    for (const label of [...page.headings, page.title]) {
      const count = label.trim().split(/\s+/u).length;
      if (count < limits.min_label_words || count > limits.max_label_words) continue;
      const key = label.trim().toLocaleLowerCase();
      if (!labels.has(key)) labels.set(key, { label: label.trim(), source: page.analysis_id });
    }
  }
  const ranked = [...labels.values()]
    .map((seed) => ({
      ...seed,
      members: pages
        .map((page) => ({
          page,
          score: overlap(words(seed.label), words(`${page.title} ${page.excerpt}`)),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score),
    }))
    .filter((seed) => seed.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label));
  const total = ranked.reduce((count, seed) => count + seed.members.length, 0);
  const candidates = ranked
    .slice(0, limits.max_topics)
    .flatMap((seed) =>
      seed.members.map(({ page }) => ({
        id: randomUUID(),
        kind: 'topic' as const,
        label: seed.label,
        source: seed.source,
        page: page.analysis_id,
      })),
    )
    .slice(0, limits.max_memberships);
  return { candidates, omitted: total - candidates.length };
}
