import { describe, expect, it } from 'vitest';
import { executionFrozenProvenance } from '../src/analysis/provenance.ts';
import { policy } from '../src/config.ts';
import { aiReferralSources } from '../src/analytics/ai-referrals.ts';
import { metricSeriesPoints } from '../src/analytics/metric-series.ts';
import { domainMatches, isGroundingRedirect, normalizeDomain } from '../src/analysis/domains.ts';
import { listedInHeadings } from '../src/analysis/opportunities/page-predicates.ts';
import { classifySourceDomain } from '../src/analysis/opportunities/source-patterns.ts';
import {
  evaluatePlacement,
  type PlacementReading,
} from '../src/analysis/opportunities/placement-outcome.ts';
import { epochMicros, parseDatetime } from '../src/http/datetimes.ts';
import { RequestValidationError, validateParams } from '../src/http/params.ts';

describe('recorded evidence normalization', () => {
  it('does not turn an unknown retrieval flag into false', () => {
    const input = {
      requestSnapshot: { retrieval_enabled: 'false' },
      routeSnapshot: null,
      auditConfiguration: null,
    };
    expect(executionFrozenProvenance(input)).toBeNull();
    expect(
      executionFrozenProvenance({ ...input, requestSnapshot: { retrieval_enabled: false } }),
    ).toBe(false);
  });
  it('rejects ambiguous session counts without turning missing or false into zero', () => {
    expect(
      aiReferralSources([{ ai_source: 'chatgpt', sessions: '12', share: null }])[0]?.sessions,
    ).toBe(12);
    for (const sessions of [true, false, null, '', 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => aiReferralSources([{ sessions }])).toThrow();
    expect(
      metricSeriesPoints([
        { date: '2026-01-01', value: null },
        { date: '2026-01-02', value: 0 },
      ]),
    ).toEqual([
      { date: '2026-01-01', value: null },
      { date: '2026-01-02', value: 0 },
    ]);
    for (const value of [true, false, Infinity, 'NaN'])
      expect(() => metricSeriesPoints([{ value }])).toThrow();
  });

  it('uses URL host identity without accepting a lookalike suffix', () => {
    expect(normalizeDomain('https://WWW.münchen.example/path')).toBe('xn--mnchen-3ya.example');
    expect(normalizeDomain('https://[broken/')).toBe('');
    expect(domainMatches('https://docs.brand.test/a', 'brand.test')).toBe(true);
    expect(domainMatches('brand.test.evil.test', 'brand.test')).toBe(false);
    const p = policy.opportunity.source_patterns;
    expect(classifySourceDomain('google.com', true, null)).toBe(p.SOURCE_CLASS_BRAND_OWNED);
    expect(classifySourceDomain('google.com', false, 'Competitor')).toBe(
      p.SOURCE_CLASS_COMPETITOR_OWNED,
    );
    expect(classifySourceDomain('google.com', false, null)).toBe(p.SOURCE_CLASS_SEARCH_SURFACE);
    expect(classifySourceDomain('google.evil.test', false, null)).toBe(
      p.SOURCE_CLASS_OTHER_THIRD_PARTY,
    );
  });

  it('reads a grounding redirect from its host, never a substring', () => {
    expect(
      isGroundingRedirect('https://vertexaisearch.cloud.google.com/grounding-api-redirect/x'),
    ).toBe(true);
    expect(isGroundingRedirect('grounding-api-redirect/xyz')).toBe(true);
    expect(isGroundingRedirect('evil-grounding-api-redirect.example')).toBe(false);
    expect(isGroundingRedirect('https://pub.example/a?ref=grounding-api-redirect')).toBe(false);
  });

  it('lists a name only within one heading', () => {
    expect(listedInHeadings('Best & Less', ['Top picks', 'Best and Less'])).toBe(true);
    expect(listedInHeadings('Acme', ['Ac', 'me'])).toBe(false);
  });

  it('keeps changed-roster and missing-verdict placement observations unavailable', () => {
    const p = policy.opportunity.placement;
    const baseline: PlacementReading = {
      snapshot_id: 'before',
      roster_version: 'roster-1',
      extracted_chars: policy.opportunity.source_pages.SOURCE_PAGE_MIN_COVERAGE_CHARS,
      brand_presence: 'present',
      brand_present: true,
      brand_match_count: 1,
      outbound_domains: [],
      headings: [],
    };
    const expectation = {
      expected_change: p.PLACEMENT_CHANGE_BRAND_LISTED,
      brand_name: 'Brand',
      owned_domains: [],
      discrepancies: [],
    };
    expect(
      evaluatePlacement(expectation, baseline, {
        ...baseline,
        snapshot_id: 'after',
        roster_version: 'roster-2',
      }),
    ).toEqual({ state: p.PLACEMENT_STATE_UNAVAILABLE, reason: p.PLACEMENT_REASON_ROSTER_CHANGED });
    expect(evaluatePlacement(expectation, baseline, { ...baseline, brand_presence: null })).toEqual(
      { state: p.PLACEMENT_STATE_UNAVAILABLE, reason: p.PLACEMENT_REASON_NO_VERDICT },
    );
    expect(
      evaluatePlacement(expectation, baseline, { ...baseline, brand_present: false }).state,
    ).toBe(p.PLACEMENT_STATE_UNMET);
  });
});

it('parses ISO timestamps without losing PostgreSQL microseconds', () => {
  const utc = parseDatetime('2026-01-01T00:00:00.123456Z')!;
  const offset = parseDatetime('2026-01-01T05:30:00.123456+05:30')!;
  expect(epochMicros(utc)).toBe(epochMicros(offset));
  expect(epochMicros(utc) % 1_000_000n).toBe(123456n);
  expect(parseDatetime('2026-02-30T00:00:00Z')).toBeNull();
  expect(parseDatetime('0000-01-01T00:00:00Z')).toBeNull();
  expect(parseDatetime('2026-01-01 00:00:00')).toBeNull();
  expect(parseDatetime('2026-01-01')).toMatchObject({ hour: 0, offsetSeconds: null });
  expect(parseDatetime('2026-01-01T10:15')).toMatchObject({ hour: 10, minute: 15, second: 0 });
  expect(parseDatetime('2026-01-01T00:00:00Zjunk')).toBeNull();
});

it('reads float parameters in decimal notation only', () => {
  const specs = { path: {}, query: { min: { scalar: { kind: 'float' as const } } } };
  expect(validateParams(specs, { path: {}, search: 'min=1.5e1' }).query).toEqual({ min: 15 });
  for (const min of ['0x10', 'Infinity', ''])
    expect(() => validateParams(specs, { path: {}, search: `min=${min}` })).toThrow(
      RequestValidationError,
    );
});

it('collects invalid parameter locations in the 422 envelope', () => {
  try {
    validateParams(
      {
        path: { id: { scalar: { kind: 'uuid' }, required: true } },
        query: { limit: { scalar: { kind: 'int' } } },
      },
      { path: { id: 'bad' }, search: 'limit=9007199254740992' },
    );
    expect.fail('invalid request accepted');
  } catch (error) {
    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      details: { errors: [{ loc: ['id'] }, { loc: ['limit'] }] },
    });
  }
});
