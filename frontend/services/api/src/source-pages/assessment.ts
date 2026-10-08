/** Exact quoted matches and explicit abstention when an extraction cannot establish absence. */
import { policy } from '../config.ts';
import { scalarText } from '../text-order.ts';
import { record, strings } from '../db/json.ts';
import { routePageKind } from '../site-health/routes.ts';
import type { ExtractedPage } from './extract.ts';
import { publicUrl } from '../projects/safe-fetch.ts';
import { aliasOffset, normalizeAlias, normalizeText } from '../analysis/aliases.ts';

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
export function urlFormat(value: string): { format: string; method: string } {
  let url: URL;
  try {
    url = publicUrl(value);
  } catch {
    return { format: 'unresolved', method: 'none' };
  }
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
function pageFormat(page: ExtractedPage) {
  if (!page.facts.parsed) return { format: 'unresolved', method: 'none' };
  const types = new Set(
    page.facts.structured_types.map((s) => s.replace(/\/$/u, '').split('/').at(-1)!.toLowerCase()),
  );
  for (const [token, format] of p.schema_formats)
    if (types.has(token!)) return { format: format!, method: 'structured_data' };
  const title = [page.facts.title, ...page.facts.headings].join(' ');
  for (const [pattern, format] of p.heading_formats)
    if (new RegExp(pattern!, 'iu').test(title))
      return { format: format!, method: 'heading_evidence' };
  return { format: 'unresolved', method: 'none' };
}
/** Quote each literal match until the page's passage cap; returns the new passage indexes. */
function quote(text: string, matches: RegExpExecArray[], ref: string, passages: Passage[]) {
  const refs: number[] = [];
  for (const match of matches) {
    if (passages.length >= p.max_passages) break;
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
function entity(
  page: ExtractedPage,
  kind: string,
  name: string,
  aliases: string[],
  passages: Passage[],
): Presence {
  const text = [page.facts.title, page.facts.meta_description, page.text].filter(Boolean).join(' ');
  const candidates = [...new Set([name, ...aliases].map((s) => s.trim()))].filter(
    (s) => s.length >= p.min_alias_chars,
  );
  for (const alias of candidates) {
    const escaped = alias.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
    const word = String.raw`[\p{L}\p{N}_]`;
    const matches = [...text.matchAll(new RegExp(`(?<!${word})${escaped}(?!${word})`, 'giu'))];
    if (!matches.length) continue;
    const refs = quote(text, matches, `${kind}:${normalizeAlias(name)}`, passages);
    return {
      entity_kind: kind,
      entity_name: name,
      presence: refs.length ? 'present' : 'ambiguous',
      match_method: alias === name ? 'exact_alias' : 'normalized_alias',
      match_count: matches.length,
      first_offset: matches[0]!.index,
      passage_refs: refs,
    };
  }
  // Spelling variants ("Best&Less", "BestandLess") offset into normalized text,
  // which cannot be quoted, so a hit is ambiguous rather than present.
  const haystack = normalizeText(text);
  const offsets = candidates.flatMap((alias) => aliasOffset(haystack, alias) ?? []);
  const offset = offsets.length ? Math.min(...offsets) : undefined;
  const sufficient =
    page.facts.parsed && !page.facts.text_truncated && page.extracted_chars >= p.min_coverage_chars;
  let presence = sufficient ? 'not_detected' : 'partial';
  if (offset !== undefined) presence = 'ambiguous';
  return {
    entity_kind: kind,
    entity_name: name,
    presence,
    match_method: offset !== undefined ? 'normalized_alias' : 'none',
    match_count: offset !== undefined ? 1 : 0,
    first_offset: offset ?? null,
    passage_refs: [],
  };
}
export function assessPage(page: ExtractedPage, configuration: unknown) {
  const config = record(configuration);
  const passages: Passage[] = [];
  const brand = scalarText(config.brand_name).trim();
  const presences: Presence[] = brand
    ? [entity(page, 'brand', brand, strings(config.brand_aliases), passages)]
    : [];
  for (const raw of Array.isArray(config.competitors) ? config.competitors : []) {
    const competitor = record(raw);
    const name = scalarText(competitor.name).trim();
    if (name)
      presences.push(entity(page, 'competitor', name, strings(competitor.aliases), passages));
  }
  return { ...pageFormat(page), presences, passages };
}
