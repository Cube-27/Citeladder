/**
 * Fanout search terms (AV-8): the words engines searched for while answering,
 * counted per run at finalization from each answer's persisted fanout queries,
 * with the tracked brands each word names and its share change since the
 * previous finalized run.
 */
import { randomUUID } from 'node:crypto';
import { fanoutTermSchema } from '@citeladder/contracts/visibility-evidence';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import type { Audits, ResponseAnalyses } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { answerEvidence } from '../config/answer-evidence.ts';
import { compareText } from '../text-order.ts';
import { entitySpans, type EntityPolicy, tokensOf } from './aliases.ts';
import type { ScoringConfig } from './scoring.ts';

const rules = answerEvidence.fanout_terms;
const STOP_WORDS = new Set<string>(rules.stop_words);
const PLURAL_EXCEPTIONS = new Set<string>(rules.plural_exceptions);
const NUMBER = /^\p{N}+$/u;
// Engine states that searched without saying what for: their words are not applicable.
const UNREPORTED_STATES = new Set(['unavailable', 'count_only']);

export const storedTermsSchema = z.array(fanoutTermSchema);
export type FanoutTerm = z.infer<typeof fanoutTermSchema>;
type TrackedBrand = FanoutTerm['brands'][number] & {
  aliases: readonly string[];
  matching?: EntityPolicy;
};

/** An English plural folded to its singular ("agencies" → "agency"); other words unchanged. */
function foldPlural(word: string): string {
  if (!/^[a-z]{4,}$/.test(word) || !word.endsWith('s') || PLURAL_EXCEPTIONS.has(word)) return word;
  if (/(?:ss|us|is)$/.test(word)) return word;
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
}

/** Each distinct term of a tokenized search with the token indexes it came from. */
function termTokens(tokens: readonly string[]): Map<string, number[]> {
  const terms = new Map<string, number[]>();
  tokens.forEach((word, index) => {
    if (Array.from(word).length < rules.min_term_length || NUMBER.test(word)) return;
    const term = foldPlural(word);
    if (STOP_WORDS.has(word) || STOP_WORDS.has(term)) return;
    terms.set(term, [...(terms.get(term) ?? []), index]);
  });
  return terms;
}

/** A search's distinct terms: folded words without function words, numbers or single letters. */
export function searchTerms(query: string): string[] {
  return [...termTokens(tokensOf(query)).keys()];
}

/** The brand and every competitor, with the names, aliases and matching policy that name it. */
function trackedBrands(config: ScoringConfig): TrackedBrand[] {
  return [
    {
      kind: 'brand' as const,
      name: config.brandName,
      aliases: config.brandAliases,
      matching: config.brandMatching,
    },
    ...config.competitors.map((c) => ({
      kind: 'competitor' as const,
      name: c.name,
      aliases: c.aliases,
      matching: c.matching,
    })),
  ].filter((brand) => brand.name && brand.aliases.length);
}

/**
 * Per term, the indexes of the tracked brands it was part of a name of, in
 * any search: "harbor" and "pine" in "harbor & pine beans" name Harbor & Pine,
 * "beans" names nothing.
 */
function termBrands(queries: readonly string[], brands: readonly TrackedBrand[]) {
  const named = new Map<string, Set<number>>();
  for (const query of queries) {
    const tokens = tokensOf(query);
    const terms = termTokens(tokens);
    brands.forEach((brand, brandIndex) => {
      const spans = entitySpans(tokens, brand.aliases, brand.matching);
      if (!spans.length) return;
      for (const [term, indexes] of terms)
        if (indexes.some((i) => spans.some((span) => i >= span.start && i < span.end)))
          named.set(term, (named.get(term) ?? new Set()).add(brandIndex));
    });
  }
  return named;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Terms by searches, then term. A search counts once per term it holds; share
 * is of all the run's searches. With a previous run, a term it had and this
 * run lost stays with zero searches so it can read as falling.
 */
export function countTerms(input: {
  queries: readonly string[];
  config: ScoringConfig;
  previous: readonly Pick<FanoutTerm, 'term' | 'share'>[] | null;
}): { totalSearches: number; terms: FanoutTerm[] } {
  const counts = new Map<string, number>();
  for (const query of input.queries)
    for (const term of searchTerms(query)) counts.set(term, (counts.get(term) ?? 0) + 1);
  const previous = new Map(input.previous?.map((t) => [t.term, t.share]));
  if (input.previous)
    for (const [term, share] of previous) if (share > 0 && !counts.has(term)) counts.set(term, 0);
  const total = input.queries.length,
    brands = trackedBrands(input.config),
    named = termBrands(input.queries, brands);
  const terms = [...counts]
    .map(([term, searches]) => {
      const share = total ? round(searches / total) : 0;
      return {
        term,
        searches,
        share,
        change: input.previous ? round(share - (previous.get(term) ?? 0)) : null,
        brands: brands
          .filter((_, index) => named.get(term)?.has(index))
          .map(({ kind, name }) => ({ kind, name })),
      };
    })
    // Every term is kept: a capped list would turn a term past the cap into a new one next run.
    .sort((a, b) => b.searches - a.searches || compareText(a.term, b.term));
  return { totalSearches: total, terms };
}

/** Engines that searched in this run without ever reporting what they searched for. */
function unreportedEngines(analyses: readonly Selectable<ResponseAnalyses>[]): string[] {
  const reported = new Set(
    analyses.filter((a) => a.fanout_state === 'queries_available').map((a) => a.logical_engine),
  );
  return [
    ...new Set(
      analyses
        .filter((a) => UNREPORTED_STATES.has(a.fanout_state) && !reported.has(a.logical_engine))
        .map((a) => a.logical_engine),
    ),
  ].sort(compareText);
}

/** The newest earlier finalized run of the same project, market and mode that counted searches. */
async function previousTerms(db: Database, audit: Selectable<Audits>) {
  const row = await db
    .selectFrom('audit_fanout_terms as t')
    .innerJoin('audits as a', 'a.id', 't.audit_id')
    .select(['t.audit_id', 't.terms'])
    .where('t.workspace_id', '=', audit.workspace_id)
    .where('a.workspace_id', '=', audit.workspace_id)
    .where('t.project_id', '=', audit.project_id)
    .where('t.audit_id', '!=', audit.id)
    .where('t.total_searches', '>', 0)
    .where('t.analyzer_version', '=', policy.audits.analysis.analyzer_version)
    .where('a.market_id', 'is not distinct from', audit.market_id)
    .where('a.audit_scope', '=', audit.audit_scope)
    .where('a.benchmark_mode', '=', audit.benchmark_mode)
    .where('a.completed_at', 'is not', null)
    .orderBy('a.completed_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row ? { auditId: row.audit_id, terms: storedTermsSchema.parse(row.terms) } : null;
}

/** Caller holds the run's finalization transaction; one row per run. */
export async function persistFanoutTerms(
  db: Database,
  audit: Selectable<Audits>,
  analyses: readonly Selectable<ResponseAnalyses>[],
  config: ScoringConfig,
  at: Date,
) {
  const queries = analyses.flatMap((a) => a.fanout_queries);
  // No reported search on either side leaves nothing to compare, never a fall to zero.
  const previous = queries.length ? await previousTerms(db, audit) : null;
  const { totalSearches, terms } = countTerms({
    queries,
    config,
    previous: previous?.terms ?? null,
  });
  await db
    .insertInto('audit_fanout_terms')
    .values({
      id: randomUUID(),
      workspace_id: audit.workspace_id,
      project_id: audit.project_id,
      audit_id: audit.id,
      previous_audit_id: previous?.auditId ?? null,
      total_searches: totalSearches,
      unreported_engines: unreportedEngines(analyses),
      terms: JSON.stringify(terms),
      source_analysis_ids: JSON.stringify(analyses.map((a) => a.id)),
      analyzer_version: policy.audits.analysis.analyzer_version,
      created_at: at,
    })
    .execute();
}
