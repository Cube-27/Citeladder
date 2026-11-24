import { policy } from '../../config.ts';
import { compareText } from '../../text-order.ts';
import { crawlSiteChecks, readinessReason, scoreAnalysis } from './scoring.ts';
import type { RuleEvaluation } from './rules.ts';

type Measurement = ReturnType<typeof scoreAnalysis>;
export type MeasuredPage = {
  id: string;
  page_kind: string;
  url_kind?: string | null;
  evaluations: RuleEvaluation[];
};
export type KnownUrls = ReadonlyMap<string, number>;
type Headline = 'web_fundamentals_score' | 'aeo_readiness_score';
type StratumScores = Record<Headline, number | null> & { analyzed_count: number };
export type Stratum = StratumScores & { page_kind: string; known_url_count: number };

export function stratify(
  known: KnownUrls,
  measured: ReadonlyMap<string, StratumScores>,
): Stratum[] {
  const kinds = new Set([...known.keys(), ...measured.keys()]);
  return [...kinds]
    .map((kind) => ({
      page_kind: kind,
      known_url_count: known.get(kind) ?? 0,
      analyzed_count: measured.get(kind)?.analyzed_count ?? 0,
      web_fundamentals_score: measured.get(kind)?.web_fundamentals_score ?? null,
      aeo_readiness_score: measured.get(kind)?.aeo_readiness_score ?? null,
    }))
    .sort((a, b) => b.known_url_count - a.known_url_count || compareText(a.page_kind, b.page_kind));
}

function weighted(strata: Stratum[], role: Headline, plain: number | null) {
  let weight = 0;
  let sum = 0;
  for (const row of strata) {
    const score = row[role];
    if (score === null || row.known_url_count <= 0) continue;
    weight += row.known_url_count;
    sum += row.known_url_count * score;
  }
  return weight ? sum / weight : plain;
}

export function siteWeighted<T extends Record<Headline, number | null>>(
  plain: T,
  strata: Stratum[],
): T {
  return {
    ...plain,
    web_fundamentals_score: weighted(
      strata,
      'web_fundamentals_score',
      plain.web_fundamentals_score,
    ),
    aeo_readiness_score: weighted(strata, 'aeo_readiness_score', plain.aeo_readiness_score),
  };
}

export function siteWeighting(strata: Stratum[]) {
  const known = strata.reduce((sum, row) => sum + row.known_url_count, 0);
  if (!known) return { kind: 'sample_average' as const };
  return { kind: 'site_share' as const, known_url_count: known, strata };
}
function state(scored: number, expected: number, unresolved: boolean) {
  if (!scored || !expected) return 'not_measured';
  return scored < expected || unresolved ? 'limited_evidence' : 'measured';
}

class RoleSum {
  pages = 0;
  applicable = 0;
  sum = 0;
  scored = 0;
  unresolved = false;
  add({
    score,
    expected,
    measured,
  }: {
    score: number | null;
    expected: number;
    measured: boolean;
  }) {
    this.pages++;
    if (expected > 0 || score !== null) this.applicable++;
    if (score !== null) {
      this.sum += score;
      this.scored++;
    }
    if (!measured) this.unresolved = true;
  }
  result() {
    return {
      score: this.scored ? this.sum / this.applicable : null,
      coverage: this.pages ? this.scored / this.pages : null,
      state: state(this.scored, this.pages, this.unresolved),
    };
  }
}

const EMPTY_DIMENSIONS = () => scoreAnalysis([], 'other').readiness_dimensions;

class DimensionSum {
  applicable = 0;
  sum = 0;
  scored = 0;
  unresolved = 0;
  checkpoints = new Set<string>();
  add(pillar: Measurement['readiness_dimensions'][number]) {
    if (pillar.dimension_applicability !== 'applicable') return;
    this.applicable++;
    if (pillar.score !== null) {
      this.sum += pillar.score;
      this.scored++;
    }
    this.unresolved += pillar.unresolved_count;
    for (const id of pillar.determinate_checkpoint_ids) this.checkpoints.add(id);
  }
  result(fallback: Measurement['readiness_dimensions'][number]) {
    if (!this.applicable) return fallback;
    const measurement = state(this.scored, this.applicable, this.unresolved > 0);
    return {
      ...fallback,
      dimension_applicability: 'applicable',
      dimension_measurement_state: measurement,
      score: this.scored ? this.sum / this.applicable : null,
      coverage: this.scored / this.applicable,
      earned_points: this.sum / 100,
      determinate_points: this.scored,
      expected_points: this.applicable,
      determinate_checkpoint_ids: [...this.checkpoints].sort(compareText),
      reason: measurement === 'measured' ? '' : 'unresolved_checks',
      unresolved_count: this.unresolved,
    };
  }
}

class ChecksSum {
  run = 0;
  total = 0;
  add(run: number, total: number) {
    this.run += run;
    this.total += total;
  }
  result() {
    return this.total ? { run: this.run, total: this.total } : null;
  }
}

const aeoChecks = (dimensions: Measurement['readiness_dimensions']) =>
  dimensions
    .filter((pillar) => pillar.dimension_applicability === 'applicable')
    .reduce(
      (sum, pillar) => ({
        run: sum.run + pillar.determinate_points,
        total: sum.total + pillar.expected_points,
      }),
      { run: 0, total: 0 },
    );

class PageSetFold {
  private readonly web = new RoleSum();
  private readonly aeo = new RoleSum();
  private readonly webChecks = new ChecksSum();
  private readonly aeoChecks = new ChecksSum();
  private readonly dimensions = EMPTY_DIMENSIONS().map(() => new DimensionSum());
  private pages = 0;
  add(page: Measurement) {
    this.pages++;
    const aeo = aeoChecks(page.readiness_dimensions);
    this.web.add({
      score: page.web_fundamentals_score,
      expected: page.technical_expected_weight,
      measured: page.web_fundamentals_state === 'measured',
    });
    this.aeo.add({
      score: page.aeo_readiness_score,
      expected: aeo.total,
      measured: page.aeo_measurement_state === 'measured',
    });
    this.webChecks.add(page.technical_determinate_weight, page.technical_expected_weight);
    this.aeoChecks.add(aeo.run, aeo.total);
    page.readiness_dimensions.forEach((pillar, index) => this.dimensions[index]?.add(pillar));
  }
  result() {
    const web = this.web.result();
    const aeo = this.aeo.result();
    const empty = EMPTY_DIMENSIONS();
    return {
      web_fundamentals_score: web.score,
      web_fundamentals_coverage: web.coverage,
      web_fundamentals_state: web.state,
      aeo_readiness_score: aeo.score,
      aeo_measurement_coverage: aeo.coverage,
      aeo_measurement_state: aeo.state,
      web_fundamentals_checks: this.webChecks.result(),
      aeo_readiness_checks: this.aeoChecks.result(),
      readiness_dimensions: this.dimensions.map((sum, index) => sum.result(empty[index]!)),
      analyzed_url_count: this.pages,
      scoring_version: policy.site_health.reads.scoring_version,
    };
  }
}

export class MeasurementFold {
  private readonly all = new PageSetFold();
  private readonly kinds = new Map<string, PageSetFold>();
  private readonly strata = new Map<string, PageSetFold>();
  private readonly site: RuleEvaluation[];
  constructor(site: RuleEvaluation[]) {
    this.site = site;
  }
  add(page: Omit<MeasuredPage, 'id'>) {
    const measured = scoreAnalysis(page.evaluations, page.page_kind, this.site);
    this.all.add(measured);
    const kind = this.kinds.get(page.page_kind) ?? new PageSetFold();
    kind.add(measured);
    this.kinds.set(page.page_kind, kind);
    if (!page.url_kind) return;
    const stratum = this.strata.get(page.url_kind) ?? new PageSetFold();
    stratum.add(measured);
    this.strata.set(page.url_kind, stratum);
  }
  private stratified(known: KnownUrls) {
    const measured = new Map(
      [...this.strata].map(([kind, fold]) => {
        const scores = fold.result();
        return [
          kind,
          {
            analyzed_count: scores.analyzed_url_count,
            web_fundamentals_score: scores.web_fundamentals_score,
            aeo_readiness_score: scores.aeo_readiness_score,
          },
        ] as const;
      }),
    );
    return stratify(known, measured);
  }
  aggregate(known: KnownUrls = new Map()) {
    return siteWeighted(this.all.result(), this.stratified(known));
  }
  weighting(known: KnownUrls) {
    return siteWeighting(this.stratified(known));
  }
  byPageKind() {
    return Object.fromEntries(
      [...this.kinds.keys()].sort(compareText).map((kind) => {
        const {
          readiness_dimensions: dimensions,
          analyzed_url_count: analyzed,
          scoring_version: _version,
          ...scores
        } = this.kinds.get(kind)!.result();
        const applicable = dimensions.some(
          (dimension) => dimension.dimension_applicability === 'applicable',
        );
        const reason = readinessReason(
          scores.aeo_readiness_score,
          scores.aeo_measurement_state,
          applicable,
          kind,
        );
        return [kind, { ...scores, analyzed_count: analyzed, aeo_measurement_reason: reason }];
      }),
    );
  }
}

const siteChecksOf = (rows: MeasuredPage[]) =>
  crawlSiteChecks(rows.flatMap((row) => row.evaluations));

function foldOf(rows: MeasuredPage[], site: RuleEvaluation[]) {
  const fold = new MeasurementFold(site);
  for (const row of rows) fold.add(row);
  return fold;
}

export function aggregateMeasurements(rows: MeasuredPage[], site = siteChecksOf(rows)) {
  return foldOf(rows, site).aggregate();
}

export function aggregateByPageKind(rows: MeasuredPage[]) {
  return foldOf(rows, siteChecksOf(rows)).byPageKind();
}
