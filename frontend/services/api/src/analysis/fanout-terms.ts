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
import { normalizeText } from './aliases.ts';
import type { ScoringConfig } from './scoring.ts';

const rules = answerEvidence.fanout_terms;
const STOP_WORDS = new Set<string>(rules.stop_words);
// Engine states that searched without saying what for: their words are not applicable.
const UNREPORTED_STATES = new Set(['unavailable', 'count_only']);

export const storedTermsSchema = z.array(fanoutTermSchema);
export type FanoutTerm = z.infer<typeof fanoutTermSchema>;
type TrackedBrand = FanoutTerm['brands'][number] & { keys: Set<string> };

/** A search's distinct normalized words, without function words or single letters. */
export function searchTerms(query: string): string[] {
  return [
    ...new Set(
      normalizeText(query)
        .split(' ')
        .filter(
          (word) => Array.from(word).length >= rules.min_term_length && !STOP_WORDS.has(word),
        ),
    ),
  ];
}

/** The brand and every competitor, each with its names and aliases as single-word keys. */
function trackedBrands(config: ScoringConfig): TrackedBrand[] {
  const keys = (names: readonly string[]) =>
    new Set(names.map((name) => normalizeText(name).replaceAll(' ', '')).filter(Boolean));
  return [
    { kind: 'brand' as const, name: config.brandName, keys: keys(config.brandAliases) },
    ...config.competitors.map((c) => ({
      kind: 'competitor' as const,
      name: c.name,
      keys: keys(c.aliases),
    })),
  ].filter((brand) => brand.name && brand.keys.size);
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
    brands = trackedBrands(input.config);
  const terms = [...counts]
    .map(([term, searches]) => {
      const share = total ? round(searches / total) : 0;
      return {
        term,
        searches,
        share,
        change: input.previous ? round(share - (previous.get(term) ?? 0)) : null,
        brands: brands
          .filter((brand) => brand.keys.has(term))
          .map(({ kind, name }) => ({ kind, name })),
      };
    })
    .sort((a, b) => b.searches - a.searches || compareText(a.term, b.term))
    .slice(0, rules.max_terms_per_audit);
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

/** The newest earlier finalized run of the same project, market and mode that counted terms. */
async function previousTerms(db: Database, audit: Selectable<Audits>) {
  const row = await db
    .selectFrom('audit_fanout_terms as t')
    .innerJoin('audits as a', 'a.id', 't.audit_id')
    .select(['t.audit_id', 't.terms'])
    .where('t.workspace_id', '=', audit.workspace_id)
    .where('a.workspace_id', '=', audit.workspace_id)
    .where('t.project_id', '=', audit.project_id)
    .where('t.audit_id', '!=', audit.id)
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
  const previous = await previousTerms(db, audit);
  const { totalSearches, terms } = countTerms({
    queries: analyses.flatMap((a) => a.fanout_queries),
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
