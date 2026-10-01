/** Equal-page aggregation; a page with more checks never gets more influence. */
import { policy } from '../../config.ts';
import { scoreAnalysis } from './scoring.ts';
import type { RuleEvaluation } from './rules.ts';

type Measurement = ReturnType<typeof scoreAnalysis>;
export type MeasuredPage = { id: string; page_kind: string; evaluations: RuleEvaluation[] };
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const state = (scored: number, expected: number, unresolved: boolean) =>
  !scored || !expected
    ? 'not_measured'
    : scored < expected || unresolved
      ? 'limited_evidence'
      : 'measured';

function role(pages: Measurement[], role: 'web' | 'aeo') {
  const scores = pages
    .map((page) => (role === 'web' ? page.web_fundamentals_score : page.aeo_readiness_score))
    .filter((score): score is number => score !== null);
  return {
    score: mean(scores),
    coverage: pages.length ? scores.length / pages.length : null,
    state: state(
      scores.length,
      pages.length,
      pages.some(
        (page) =>
          (role === 'web' ? page.web_fundamentals_state : page.aeo_measurement_state) !==
          'measured',
      ),
    ),
  };
}

export function aggregateMeasurements(rows: MeasuredPage[]) {
  const pages = rows.map((row) => scoreAnalysis(row.evaluations, row.page_kind));
  const web = role(pages, 'web');
  const aeo = role(pages, 'aeo');
  const empty = scoreAnalysis([], 'other').readiness_dimensions;
  const dimensions = empty.map((fallback, index) => {
    const applicable = pages
      .map((page) => page.readiness_dimensions[index]!)
      .filter((pillar) => pillar.dimension_applicability === 'applicable');
    if (!applicable.length) return fallback;
    const scores = applicable
      .map((pillar) => pillar.score)
      .filter((score): score is number => score !== null);
    const unresolved = applicable.reduce((sum, pillar) => sum + pillar.unresolved_count, 0);
    const measurement = state(scores.length, applicable.length, unresolved > 0);
    return {
      ...fallback,
      dimension_applicability: 'applicable',
      dimension_measurement_state: measurement,
      score: mean(scores),
      coverage: scores.length / applicable.length,
      earned_points: scores.reduce((sum, value) => sum + value, 0) / 100,
      determinate_points: scores.length,
      expected_points: applicable.length,
      determinate_checkpoint_ids: [
        ...new Set(applicable.flatMap((pillar) => pillar.determinate_checkpoint_ids)),
      ].sort(),
      reason: measurement === 'measured' ? '' : 'unresolved_checks',
      unresolved_count: unresolved,
    };
  });
  return {
    web_fundamentals_score: web.score,
    web_fundamentals_coverage: web.coverage,
    web_fundamentals_state: web.state,
    aeo_readiness_score: aeo.score,
    aeo_measurement_coverage: aeo.coverage,
    aeo_measurement_state: aeo.state,
    readiness_dimensions: dimensions,
    analyzed_url_count: rows.length,
    scoring_version: policy.site_health.reads.scoring_version,
  };
}

export function aggregateByPageKind(rows: MeasuredPage[]) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.page_kind))].sort().map((kind) => {
      const aggregate = aggregateMeasurements(rows.filter((row) => row.page_kind === kind));
      const {
        readiness_dimensions: dimensions,
        analyzed_url_count: analyzed,
        scoring_version: _version,
        ...scores
      } = aggregate;
      const applicable = dimensions.some(
        (dimension) => dimension.dimension_applicability === 'applicable',
      );
      const reason =
        scores.aeo_readiness_score !== null
          ? scores.aeo_measurement_state === 'measured'
            ? ''
            : 'unresolved_checks'
          : applicable
            ? 'unresolved_checks'
            : kind === 'other'
              ? 'page_purpose_unresolved'
              : 'no_applicable_checks';
      return [kind, { ...scores, analyzed_count: analyzed, aeo_measurement_reason: reason }];
    }),
  );
}
