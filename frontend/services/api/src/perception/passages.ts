/**
 * The bounded model input for one answer: for each mentioned business, the
 * sentences that name it plus one sentence either side. Offsets are code
 * points, the unit the entity assessment already stores, converted from the
 * UTF-16 indexes the regex and the sentence segmenter report.
 */
import { createHash } from 'node:crypto';

import { countedMatches, trackedEntities } from '../analysis/entity-assessment.ts';
import type { ScoringConfig } from '../analysis/scoring.ts';
import type { PerceptionPolicy } from '../config/perception.ts';

/** A code-point span of the answer and its exact text. */
export type Span = { start: number; end: number; text: string };

export type EntityPassages = {
  entity_id: string;
  name: string;
  kind: 'brand' | 'competitor';
  spans: Span[];
};

export type PerceptionPackage = {
  extractor_version: string;
  template_version: string;
  language: string;
  prompt: string;
  entities: EntityPassages[];
};

/** States of the deterministic assessment that mean the entity is not named. */
const NOT_NAMED = new Set(['absent', 'unavailable']);

/** True when any assessed entity is named in the answer (an empty list names none). */
export function namesAnyEntity(assessments: readonly { state: string }[]): boolean {
  return assessments.some((row) => !NOT_NAMED.has(row.state));
}

function segmenter(languageCode: string) {
  try {
    return new Intl.Segmenter(languageCode || 'en', { granularity: 'sentence' });
  } catch {
    // An unrecognised stored language code still segments; English rules are the fallback.
    return new Intl.Segmenter('en', { granularity: 'sentence' });
  }
}

/** Code-point offset of every UTF-16 index, so spans convert explicitly. */
function codePointIndex(text: string): (utf16: number) => number {
  const offsets = new Uint32Array(text.length + 1);
  let points = 0;
  for (let index = 0; index < text.length;) {
    const width = (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
    offsets[index] = points;
    if (width === 2) offsets[index + 1] = points;
    index += width;
    points += 1;
  }
  offsets[text.length] = points;
  return (utf16) => offsets[utf16]!;
}

type Range = { start: number; end: number };

/** Sentence ranges (UTF-16) with their surrounding whitespace trimmed away. */
function sentences(answer: string, languageCode: string): Range[] {
  const ranges: Range[] = [];
  for (const { index, segment } of segmenter(languageCode).segment(answer)) {
    const lead = segment.length - segment.trimStart().length;
    const body = segment.trim();
    if (body) ranges.push({ start: index + lead, end: index + lead + body.length });
  }
  return ranges;
}

/** Answer ranges (UTF-16) of the sentences holding an occurrence, widened by one either side and merged. */
function windows(occurrences: readonly number[], ranges: readonly Range[]): Range[] {
  const hit = new Set<number>();
  for (const offset of occurrences) {
    const sentence = ranges.findIndex((range) => offset < range.end);
    if (sentence === -1) continue;
    for (const index of [sentence - 1, sentence, sentence + 1])
      if (index >= 0 && index < ranges.length) hit.add(index);
  }
  const merged: Range[] = [];
  let previous = -2;
  for (const index of [...hit].sort((a, b) => a - b)) {
    const range = ranges[index];
    if (!range) continue;
    const last = merged.at(-1);
    if (last && previous + 1 === index) last.end = range.end;
    else merged.push({ ...range });
    previous = index;
  }
  return merged;
}

/** Passages for each named entity: brand first, then competitors by first mention. */
export function entityPassages(input: {
  answer: string;
  languageCode: string;
  config: ScoringConfig;
  policy: Pick<PerceptionPolicy, 'max_entities' | 'max_passage_chars_per_entity'>;
}): EntityPassages[] {
  const { answer, policy } = input;
  if (!answer.trim()) return [];
  const ranges = sentences(answer, input.languageCode);
  const points = codePointIndex(answer);
  const chars = Array.from(answer);
  const named = trackedEntities(input.config).flatMap((entity) => {
    const occurrences = countedMatches(entity.aliases, answer, entity.matching).map((m) => m.index);
    const [first] = occurrences;
    return first === undefined ? [] : [{ entity, occurrences, first }];
  });
  const [brand, competitors] = [
    named.filter(({ entity }) => entity.kind === 'brand'),
    named.filter(({ entity }) => entity.kind !== 'brand').sort((a, b) => a.first - b.first),
  ];
  return [...brand, ...competitors].slice(0, policy.max_entities).map(({ entity, occurrences }) => {
    let budget = policy.max_passage_chars_per_entity;
    const spans: Span[] = [];
    for (const window of windows(occurrences, ranges)) {
      if (budget <= 0) break;
      const start = points(window.start);
      const end = Math.min(points(window.end), start + budget);
      const text = chars.slice(start, end).join('');
      spans.push({ start, end, text });
      budget -= end - start;
    }
    return {
      entity_id: entity.id,
      name: entity.name,
      kind: entity.kind === 'brand' ? 'brand' : 'competitor',
      spans,
    };
  });
}

/** JSON with object keys sorted at every depth, so equal packages hash equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function packageHash(pkg: PerceptionPackage): string {
  return createHash('sha256').update(canonicalJson(pkg)).digest('hex');
}
