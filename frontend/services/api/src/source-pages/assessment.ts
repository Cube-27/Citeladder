import { policy } from '../config.ts';
import { sourcePageVocabulary } from '../config/source-pages.ts';
import { routePageKind } from '../site-health/routes.ts';
import type { ExtractedPage } from './extract.ts';
import { publicUrl } from '../safe-fetch.ts';
import {
  aliasSpellings,
  CONNECTOR,
  countsAnywhere,
  DENSE_SCRIPT,
  entityOffset,
  normalizeAlias,
  normalizeText,
  occurrenceCounts,
  tokensOf,
  withoutAliases,
  type EntityPolicy,
} from '../analysis/aliases.ts';
import { scoringConfig } from '../analysis/scoring.ts';

const p = policy.source_pages;
type Passage = { text: string; char_start: number; char_end: number; entity_ref: string };
export type Presence = {
  entity_kind: string;
  entity_name: string;
  presence: string;
  match_method: string;
  match_count: number;
  first_offset: number | null;
  passage_refs: number[];
};
export function rosterNames(configuration: unknown): string[] {
  const config = scoringConfig(configuration);
  return [...config.brandAliases, ...config.competitors.flatMap((item) => item.aliases)];
}
function decoded(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
function unnamedSegment(segment: string, names: readonly string[]) {
  const text = normalizeText(decoded(segment).replaceAll(/[-_+.]+/gu, ' '));
  const rest = withoutAliases(text, names);
  return rest === text ? segment : rest.replaceAll(' ', '-') || p.name_mask;
}
export function urlFormat(
  value: string,
  names: readonly string[],
): { format: string; method: string } {
  let url: URL;
  try {
    url = publicUrl(value);
  } catch {
    return { format: 'unresolved', method: 'none' };
  }
  url.pathname = url.pathname
    .split('/')
    .map((segment) => unnamedSegment(segment, names))
    .join('/');
  const slug = url.pathname
    .toLowerCase()
    .replaceAll(/[/_+.]+/gu, '-')
    .replaceAll(/-{2,}/gu, '-');
  for (const [pattern, format] of p.url_formats)
    if (new RegExp(pattern!).test(slug)) return { format: format!, method: 'url_pattern' };
  const kind = routePageKind(url.href);
  const format = kind ? p.kind_formats[kind as keyof typeof p.kind_formats] : undefined;
  if (format) return { format, method: 'url_pattern' };
  return /(^|-)\d{4}-\d{2}(-|$)/u.test(slug)
    ? { format: 'article', method: 'url_pattern' }
    : { format: 'unresolved', method: 'none' };
}
function pageFormat(page: ExtractedPage, names: readonly string[]) {
  if (!page.facts.parsed) return { format: 'unresolved', method: 'none' };
  const types = new Set(
    page.facts.structured_types.map((s) => s.replace(/\/$/u, '').split('/').at(-1)!.toLowerCase()),
  );
  const title = withoutAliases(
    normalizeText([page.facts.title, ...page.facts.headings].join(' ')),
    names,
  );
  const heading = p.heading_formats.find(([pattern]) =>
    new RegExp(pattern!, 'iu').test(title),
  )?.[1];
  const schema = p.schema_formats.find(([token]) => types.has(token!));
  const headingWins =
    heading !== undefined &&
    heading !== schema?.[1] &&
    p.headings_over_schema.formats.includes(heading) &&
    p.headings_over_schema.schemas.includes(schema?.[0] ?? '');
  if (schema && !headingWins) return { format: schema[1]!, method: 'structured_data' };
  if (heading) return { format: heading, method: 'heading_evidence' };
  return p.generic_schema_types.some((token) => types.has(token))
    ? { format: 'article', method: 'structured_data' }
    : { format: 'unresolved', method: 'none' };
}
const escape = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
const WORD = String.raw`[\p{L}\p{N}_]`;
const bounded = (body: string, alias: string) =>
  DENSE_SCRIPT.test(alias)
    ? new RegExp(body, 'giu')
    : new RegExp(`(?<!${WORD})${body}(?!${WORD})`, 'giu');
const SEPARATOR = String.raw`[^\p{L}\p{M}\p{N}_]{0,3}`;
const wordPattern = (word: string) => (word === CONNECTOR ? `(?:${CONNECTOR}|&)` : escape(word));
function spellings(alias: string): RegExp[] {
  const spaced = aliasSpellings(alias).map((words) =>
    bounded(words.map(wordPattern).join(SEPARATOR), alias),
  );
  return [bounded(escape(alias), alias), ...spaced];
}
function counted(
  text: string,
  matches: readonly RegExpExecArray[],
  tokens: readonly string[],
  entity: EntityPolicy | undefined,
) {
  if (countsAnywhere(entity)) return [...matches];
  let cursor = 0;
  let start = 0;
  return matches.filter((match) => {
    start += tokensOf(text.slice(cursor, match.index)).length;
    const width = tokensOf(match[0]).length;
    cursor = match.index + match[0].length;
    const counts = occurrenceCounts(tokens, { start, end: start + width }, entity);
    start += width;
    return counts;
  });
}
function quote(text: string, matches: RegExpExecArray[], ref: string, passages: Passage[]) {
  const refs: number[] = [];
  for (const match of matches.slice(0, p.passages_per_entity)) {
    const half = Math.max(0, Math.floor((p.passage_chars - match[0].length) / 2));
    const start = Math.max(0, match.index - half);
    const end = Math.min(text.length, match.index + match[0].length + half);
    refs.push(passages.length);
    passages.push({
      text: text.slice(start, end).trim(),
      char_start: start,
      char_end: end,
      entity_ref: ref,
    });
  }
  return refs;
}
type Entity = { kind: string; name: string; aliases: string[]; matching?: EntityPolicy };
function entity(page: PageText, item: Entity, passages: Passage[]): Presence {
  const { text } = page;
  const aliases = [...new Set([item.name, ...item.aliases].map((a) => a.trim()))].filter(
    (a) => a.length >= p.min_alias_chars,
  );
  const named = { entity_kind: item.kind, entity_name: item.name };
  const unmatched = { match_method: 'none', match_count: 0, first_offset: null, passage_refs: [] };
  if (!aliases.length)
    return { ...named, presence: sourcePageVocabulary.PRESENCE_NOT_ASSESSABLE, ...unmatched };
  const offset = entityOffset(page.normalized, aliases, item.matching);
  if (offset === null)
    return { ...named, presence: page.sufficient ? 'not_detected' : 'partial', ...unmatched };
  const tokens = page.normalized.split(' ');
  for (const pattern of aliases.flatMap(spellings)) {
    const matches = counted(text, [...text.matchAll(pattern)], tokens, item.matching);
    const [first] = matches;
    if (!first) continue;
    const found = first[0].toLowerCase();
    return {
      ...named,
      presence: 'present',
      match_method: aliases.some((alias) => alias.toLowerCase() === found)
        ? 'exact_alias'
        : 'normalized_alias',
      match_count: matches.length,
      first_offset: first.index,
      passage_refs: quote(text, matches, `${item.kind}:${normalizeAlias(item.name)}`, passages),
    };
  }
  return {
    ...named,
    presence: 'ambiguous',
    match_method: 'normalized_alias',
    match_count: 1,
    first_offset: offset,
    passage_refs: [],
  };
}
type PageText = { text: string; normalized: string; sufficient: boolean };
export function assessPage(page: ExtractedPage, configuration: unknown) {
  const config = scoringConfig(configuration);
  const passages: Passage[] = [];
  const text = [page.facts.title, page.facts.meta_description, page.text].filter(Boolean).join(' ');
  const read: PageText = {
    text,
    normalized: normalizeText(text),
    sufficient:
      page.facts.parsed &&
      !page.facts.text_truncated &&
      page.extracted_chars >= p.min_coverage_chars,
  };
  const brand = config.brandName.trim();
  const presences: Presence[] = brand
    ? [
        entity(
          read,
          {
            kind: 'brand',
            name: brand,
            aliases: config.brandAliases,
            matching: config.brandMatching,
          },
          passages,
        ),
      ]
    : [];
  for (const competitor of config.competitors) {
    const name = competitor.name.trim();
    if (name)
      presences.push(
        entity(
          read,
          { kind: 'competitor', name, aliases: competitor.aliases, matching: competitor.matching },
          passages,
        ),
      );
  }
  return { ...pageFormat(page, rosterNames(configuration)), presences, passages };
}
