/**
 * Golden-master replay: the Python implementation produced every expected
 * output (`backend/scripts/golden_masters.py`); the port must match it as
 * serialized JSON, key order included. `golden/frozen/` holds fixtures for
 * Python behavior that retired when its owner moved here; they are replayed
 * the same way but never regenerated.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  brandMentionRateWhenPresent,
  competitorMentionRate,
  countObservations,
  overallBrandVisibility,
  ownedCitationRateWhenPresent,
  triggerRate,
  type AioObservationRow,
} from '../src/analysis/aio-rates.ts';
import { domainMatches, isGroundingRedirect, normalizeDomain } from '../src/analysis/domains.ts';
import { brandPosition, competitorPosition } from '../src/analysis/position.ts';
import { executionFrozenProvenance } from '../src/analysis/provenance.ts';
import { classifyCitation, scoringConfig } from '../src/analysis/scoring.ts';
import { aiReferralSources } from '../src/analytics/ai-referrals.ts';
import { metricSeriesPoints } from '../src/analytics/metric-series.ts';
import { decodeSessionToken } from '../src/auth/session.ts';
import { secretIsWeak } from '../src/config.ts';
import { defaultCode, errorEnvelope, isRetryableStatus } from '../src/errors.ts';
import { pyIntOrZero, pyRepr, pyStrOrEmpty } from '../src/python/text.ts';
import { classifyReferralSignals } from '../src/referrals/classification.ts';
import { referralEventFields, sanitizeReferralUrl } from '../src/referrals/events.ts';
import {
  buildAiReferralsProjection,
  ProjectionError,
  type ReferralFact,
} from '../src/referrals/projection.ts';
import { PythonValueError } from '../src/python/urlparse.ts';
import { sanitizeCorrelationId } from '../src/request-id.ts';
import { identityKey } from '../src/visibility/brand-identities.ts';
import { assembleSeries, type SourceDimension } from '../src/visibility/source-series.ts';

type GoldenCase = { input: never; output: unknown };

// Session fixtures carry fixed `exp`/`nbf`/`iat` claims; replay them at a
// fixed instant so the verdicts do not depend on when the suite runs.
const REPLAY_INSTANT = new Date('2026-09-27T00:00:00Z');

/** Python's `ValueError`, recorded by the builders as `{raises: ...}`. */
function raising<T>(port: () => T): T | { raises: string } {
  try {
    return port();
  } catch (error) {
    if (error instanceof PythonValueError) return { raises: 'ValueError' };
    throw error;
  }
}

function aioRates(input: { rows: AioObservationRow[] }): unknown {
  let counts;
  try {
    counts = countObservations(input.rows);
  } catch (error) {
    return { error: (error as Error).message };
  }
  return {
    counts,
    trigger_rate: triggerRate(counts),
    brand_mention_rate_when_present: brandMentionRateWhenPresent(counts),
    overall_brand_visibility: overallBrandVisibility(counts),
    owned_citation_rate_when_present: ownedCitationRateWhenPresent(counts),
    competitor_mention_rate: competitorMentionRate(counts, 1),
  };
}

/** Python's `+00:00` isoformat to the `Z` rendering the reader works in. */
const utcZ = (value: string) => value.replace(/\+00:00$/u, 'Z');

function sourceSeriesAssembly(input: {
  rows: { key: string; bucket: string; responses: number; citations: number }[];
  totals: Record<string, number>;
  dimension: SourceDimension;
  granularity: string;
  limit: number;
}): unknown {
  return assembleSeries(
    input.rows.map((row) => ({ ...row, bucket: utcZ(row.bucket) })),
    {
      totals: new Map(Object.entries(input.totals).map(([at, total]) => [utcZ(at), total])),
      dimension: input.dimension,
      granularity: input.granularity,
      limit: input.limit,
    },
  );
}

function aiReferralsProjection(input: {
  facts: ReferralFact[];
  window_start: string;
  window_end: string;
  granularity: string;
}): unknown {
  try {
    return buildAiReferralsProjection({
      facts: input.facts,
      windowStart: input.window_start,
      windowEnd: input.window_end,
      granularity: input.granularity,
    });
  } catch (error) {
    if (error instanceof ProjectionError) return { raises: 'ValueError' };
    throw error;
  }
}

function mentionPositions(score: Record<string, unknown>): unknown {
  const offsets = (score.competitor_first_offsets ?? {}) as Record<string, unknown>;
  return {
    brand: brandPosition(score.brand_first_offset ?? null, offsets),
    competitors: Object.fromEntries(
      ['A', 'B', 'C', 'Z'].map((name) => [name, competitorPosition(score, name)]),
    ),
  };
}

const PORTS: Record<string, (input: never) => unknown> = {
  ai_referral_sources: (input: unknown) => {
    try {
      return aiReferralSources(input);
    } catch (error) {
      if (error instanceof TypeError) return { raises: 'error' };
      throw error;
    }
  },
  brand_identity_keys: (input: string) => identityKey(input),
  citation_classifications: (input: { citation: Record<string, unknown>; config: unknown }) =>
    raising(() => classifyCitation(input.citation, scoringConfig(input.config))),
  correlation_ids: (input: string) => sanitizeCorrelationId(input),
  domain_matches: ([candidate, target]: [unknown, unknown]) =>
    raising(() => domainMatches(candidate, target)),
  error_envelopes: (input: {
    status: number;
    message: string;
    details?: Record<string, unknown>;
    detail?: unknown;
  }) =>
    errorEnvelope({
      code: defaultCode(input.status),
      message: input.message,
      requestId: '0123456789abcdef',
      retryable: isRetryableStatus(input.status),
      details: input.details,
      detail: input.detail,
    }),
  grounding_redirects: (input: unknown) => isGroundingRedirect(input),
  mention_positions: mentionPositions,
  metric_series_points: (input: unknown) => metricSeriesPoints(input),
  normalized_domains: (input: unknown) => raising(() => normalizeDomain(input)),
  // `int()` raises ValueError for a str and TypeError for any other JSON value.
  python_int_or_zero: (input: unknown) =>
    pyIntOrZero(input) ?? { raises: typeof input === 'string' ? 'ValueError' : 'TypeError' },
  python_str_or_empty: (input: unknown) => pyStrOrEmpty(input),
  python_string_reprs: (input: string) => pyRepr(input),
  referral_classifications: (input: Record<string, string | null>) =>
    classifyReferralSignals(input),
  retrieval_provenance: (input: { request?: unknown; route?: unknown; audit?: unknown }) =>
    executionFrozenProvenance({
      requestSnapshot: input.request ?? null,
      routeSnapshot: input.route ?? null,
      auditConfiguration: input.audit ?? null,
    }),
  secret_strength: (input: string) => secretIsWeak(input),
  session_tokens: async (input: { key: string; token_segments: string[] }) => {
    const token = input.token_segments.join('.');
    const claims = await decodeSessionToken(token, input.key, REPLAY_INSTANT);
    return claims === null ? { rejected: true } : { claims };
  },
  // Frozen: the Python owner retired with TypeScript migration PR 3.
  aio_rates: aioRates,
  source_series_assembly: sourceSeriesAssembly,
  // Frozen: the Python owners retired with TypeScript migration PR 4.
  ai_referrals_projections: aiReferralsProjection,
  referral_event_rows: (input: { dataset: string; date: string; dimension_key: string }) =>
    referralEventFields(input),
  referral_url_sanitize: (input: string) => raising(() => sanitizeReferralUrl(input)),
};

const goldenRoot = new URL('../golden/', import.meta.url);

function fixtureFiles(directory: URL): URL[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => new URL(name, directory));
}

const files = [...fixtureFiles(goldenRoot), ...fixtureFiles(new URL('frozen/', goldenRoot))];
const fixtures = files.map(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as { name: string; cases: GoldenCase[] },
);

describe('golden masters', () => {
  it('has a TypeScript port for every Python fixture set', () => {
    expect(fixtures.map((golden) => golden.name).sort()).toEqual(Object.keys(PORTS).sort());
  });

  for (const golden of fixtures) {
    const port = PORTS[golden.name];
    it.each(golden.cases.map((entry, index) => [index, entry] as const))(
      `${golden.name} case %i`,
      async (_index, entry) => {
        expect(JSON.stringify(await port?.(entry.input))).toBe(JSON.stringify(entry.output));
      },
    );
  }
});
