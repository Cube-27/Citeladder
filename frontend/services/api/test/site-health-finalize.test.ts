import { describe, expect, it } from 'vitest';
import {
  canonicalIntegrity,
  entitySetEvaluation,
  hreflangConflict,
  sitemapOrphan,
} from '../src/site-health/analysis/finalize.ts';
import { aggregateMeasurements } from '../src/site-health/analysis/measurement-aggregation.ts';
import {
  canonicalResolution,
  resolutionSet,
  type Resolution,
} from '../src/site-health/resolution-evidence.ts';
import { resolveDuplicateAliases } from '../src/site-health/canonical-alias.ts';
import { assessCoverage, type CoverageSignals } from '../src/site-health/coverage.ts';
import { ScoreRefreshCadence } from '../src/site-health/lifecycle.ts';
import { eligibilityState } from '../src/site-health/snapshot-eligibility.ts';

const canonical = (declarations: string[], changes = {}) =>
  canonicalIntegrity({
    declarations,
    finalUrl: 'https://example.test/page',
    targetUrl: 'https://example.test/target',
    checked: true,
    statusCode: 200,
    redirected: false,
    ...changes,
  });

describe('terminal checks from persisted evidence', () => {
  it('distinguishes absent, conflicting, cross-origin and unresolved canonical declarations', () => {
    expect(canonical([]).outcome).toBe('not_applicable');
    expect(canonical(['/a', '/b']).reason_code).toBe('conflicting_declarations');
    expect(canonical(['https://elsewhere.test/a']).reason_code).toBe('cross_origin_canonical');
    expect(canonical(['/a'], { checked: false }).outcome).toBe('unknown');
    expect(canonical(['https://example.test:443/a'], { redirected: true }).outcome).toBe(
      'satisfied',
    );
  });

  it('keeps incomplete target coverage unknown and observed failures actionable', () => {
    expect(entitySetEvaluation('technical.broken_internal_link', 2, 1, []).outcome).toBe('unknown');
    expect(entitySetEvaluation('technical.broken_internal_link', 3, 2, ['/missing']).outcome).toBe(
      'partial',
    );
    expect(sitemapOrphan(1, ['/orphan'], 'partial').outcome).toBe('unknown');
    expect(sitemapOrphan(1, ['/orphan'], 'complete').outcome).toBe('missing');
    expect(
      hreflangConflict({
        alternateCount: 2,
        checkedCount: 1,
        uncheckedCount: 1,
        missingReturnTags: [],
        rateLimitedCount: 1,
      }).reason_code,
    ).toBe('rate_limited_alternates');
  });

  it('retains resolution provenance without treating rate limits as broken URLs', () => {
    const limited: Resolution = {
      status: 429,
      finalUrl: 'https://example.test/a',
      redirected: false,
      taskId: 'task-a',
      attemptId: 'attempt-a',
      artifactId: null,
    };
    const resolutions = new Map([['https://example.test/a', limited]]);
    const result = resolutionSet(['https://example.test/a'], resolutions);
    expect(result.outcome).toBe('unknown');
    expect(result.evidence).toMatchObject({
      failing_targets: [],
      resolution_source_ids: ['attempt-a', 'task-a'],
    });
    expect(canonicalResolution(['/a'], 'https://example.test/', resolutions).reason_code).toBe(
      'rate_limited',
    );
    resolutions.set('https://example.test/b', {
      ...limited,
      status: 404,
      taskId: 'task-b',
      attemptId: 'attempt-b',
    });
    expect(resolutionSet([...resolutions.keys()], resolutions).outcome).toBe('missing');
  });

  it('weights pages equally and keeps missing measurements out of the score denominator', () => {
    const passed = canonical(['/a']);
    const failed = canonical(['/a'], { statusCode: 404 });
    const result = aggregateMeasurements([
      { id: 'a', page_kind: 'article', evaluations: [passed] },
      {
        id: 'b',
        page_kind: 'article',
        evaluations: [failed, { ...passed, rule_id: 'technical.title_present' }],
      },
      { id: 'c', page_kind: 'other', evaluations: [] },
    ]);
    expect(result.web_fundamentals_score).toBe(75);
    expect(result.web_fundamentals_coverage).toBeCloseTo(2 / 3);
    expect(result.web_fundamentals_state).toBe('limited_evidence');
  });

  it('scores a site-level crawler block on every page, not only the site root', () => {
    const crawlability = {
      ...canonical(['/a']),
      score_roles: ['aeo_readiness'],
      readiness_dimension: 'crawlability',
      readiness_weight: 1,
    };
    const blocked = {
      ...crawlability,
      rule_id: 'technical.ai_crawler_access',
      scope: 'site',
      outcome: 'missing',
    };
    const indexable = { ...crawlability, rule_id: 'technical.indexable', outcome: 'satisfied' };
    const result = aggregateMeasurements([
      { id: 'root', page_kind: 'homepage', evaluations: [blocked] },
      // Another page records the site rule as not applicable; the root's verdict still applies.
      {
        id: 'page',
        page_kind: 'article',
        evaluations: [indexable, { ...blocked, outcome: 'not_applicable' }],
      },
    ]);
    // Root 0 (blocked), page 50 (indexable, blocked); without the site check the page would be 100.
    expect(result.aeo_readiness_score).toBe(25);
  });
});

const graph = (
  edges: [string, string][],
  active: string[],
  protectedHashes: string[] = [],
  known?: string[],
) => ({
  edges: new Map(edges),
  known: new Set(known ?? [...new Set([...edges.flat(), ...active])]),
  active: new Set(active),
  protectedHashes: new Set(protectedHashes),
});

describe('crawl-wide canonical alias resolution', () => {
  it('excludes every link of a chain in favour of its retained sink', () => {
    expect(
      resolveDuplicateAliases(
        graph(
          [
            ['a', 'b'],
            ['b', 'c'],
          ],
          ['a', 'b', 'c'],
        ),
      ).sort(),
    ).toEqual(['a', 'b']);
  });

  it('keeps one deterministic member of a cycle, preferring a user selection', () => {
    expect(
      resolveDuplicateAliases(
        graph(
          [
            ['a', 'b'],
            ['b', 'a'],
          ],
          ['a', 'b'],
        ),
      ),
    ).toEqual(['b']);
    expect(
      resolveDuplicateAliases(
        graph(
          [
            ['a', 'b'],
            ['b', 'a'],
          ],
          ['a', 'b'],
          ['b'],
        ),
      ),
    ).toEqual(['a']);
  });

  it('never excludes a user selection or aliases toward an unfetched or inactive target', () => {
    expect(resolveDuplicateAliases(graph([['a', 'b']], ['a', 'b'], ['a']))).toEqual([]);
    expect(resolveDuplicateAliases(graph([['a', 'b']], ['a', 'b'], [], ['a']))).toEqual([]);
    expect(resolveDuplicateAliases(graph([['a', 'b']], ['a']))).toEqual([]);
  });
});

const signals = (changes: Partial<CoverageSignals> = {}): CoverageSignals => ({
  sampleMode: false,
  inputMode: 'auto',
  cancelled: false,
  discoveryStatus: 'completed',
  requestedPageLimit: 50,
  frontierLimit: 0,
  admittedUrlCount: 10,
  observationCount: 10,
  pendingFrontierCount: 0,
  discoveryTaskCount: 3,
  failedDiscoveryTaskCount: 0,
  ...changes,
});

describe('crawl coverage', () => {
  it('is complete only for an exhausted frontier below every limit', () => {
    expect(assessCoverage(signals())).toMatchObject({
      state: 'complete',
      evidence: { reasons: ['frontier_exhausted'] },
    });
  });

  it('is partial when a limit, pending frontier or explicit bound cut discovery short', () => {
    expect(assessCoverage(signals({ admittedUrlCount: 50 })).state).toBe('partial');
    expect(assessCoverage(signals({ pendingFrontierCount: 1 })).state).toBe('partial');
    expect(assessCoverage(signals({ cancelled: true })).evidence.reasons).toEqual([
      'discovery_bounded_or_stopped',
    ]);
    expect(assessCoverage(signals({ inputMode: 'exact_urls' })).state).toBe('partial');
  });

  it('is unknown, not complete, when discovery failed or observed nothing', () => {
    expect(assessCoverage(signals({ failedDiscoveryTaskCount: 1 })).state).toBe('unknown');
    expect(assessCoverage(signals({ observationCount: 0 })).evidence.reasons).toEqual([
      'no_observed_urls',
    ]);
  });
});

describe('search eligibility', () => {
  const satisfied = {
    'acquisition.public_representation': 'satisfied',
    'search.indexability': 'satisfied',
  };
  it('is gated by the critical checkpoints alone', () => {
    expect(
      eligibilityState({ ...satisfied, 'search.crawler_access': 'unknown' }, undefined),
    ).toEqual({ state: 'eligible', status: 'audited' });
    expect(
      eligibilityState({ ...satisfied, 'search.indexability': 'missing' }, undefined).state,
    ).toBe('blocked');
  });

  it('separates a policy exclusion from an unresolved failure and pending work', () => {
    const failed = (error_code: string) => ({ status: 'failed', error_code });
    expect(eligibilityState({}, failed('url_admission_rejected'))).toEqual({
      state: 'excluded',
      status: 'excluded',
    });
    expect(eligibilityState({}, failed('task_failed'))).toEqual({
      state: 'unknown',
      status: 'error',
    });
    expect(eligibilityState({}, { status: 'queued', error_code: '' })).toEqual({
      state: 'unknown',
      status: 'pending',
    });
  });
});

describe('live score refresh cadence', () => {
  const cadence = (changes = {}) =>
    new ScoreRefreshCadence({
      pageInterval: 10,
      pageFraction: 0.1,
      minIntervalSeconds: 0,
      maxTrackedCrawls: 10,
      ...changes,
    });

  it('refreshes the first analysis, then after a batch that grows with the crawl', () => {
    const gate = cadence();
    const admitted = Array.from({ length: 250 }, () => gate.admits('crawl', 0)).flatMap(
      (due, index) => (due ? [index] : []),
    );
    expect(admitted.slice(0, 3)).toEqual([0, 10, 20]);
    expect(admitted.at(-1)! - admitted.at(-2)!).toBeGreaterThan(10);
  });

  it('refreshes slow progress on elapsed time and every analysis when both triggers are off', () => {
    const slow = cadence({ minIntervalSeconds: 5 });
    slow.admits('crawl', 0);
    expect(slow.admits('crawl', 1000)).toBe(false);
    expect(slow.admits('crawl', 6000)).toBe(true);
    const off = cadence({ pageInterval: 0 });
    expect([off.admits('crawl', 0), off.admits('crawl', 0)]).toEqual([true, true]);
  });
});

it('resolves a canonical declared more than once as the one canonical it names', () => {
  const ok: Resolution = {
    status: 200,
    finalUrl: 'https://example.test/a',
    redirected: false,
    taskId: 'task',
    attemptId: 'attempt',
    artifactId: null,
  };
  const result = canonicalResolution(
    ['/a', ' /a '],
    'https://example.test/page',
    new Map([['https://example.test/a', ok]]),
  );
  expect(result.outcome).toBe('satisfied');
});
