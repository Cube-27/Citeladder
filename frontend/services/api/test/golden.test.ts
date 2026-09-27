/** Live parity only for identities that active Python and TypeScript owners share. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sourcesGolden } from './sources-golden.ts';
import { frozenComparisonKey } from '../src/analysis/comparison.ts';
import { canonicalPage } from '../src/traffic/normalization.ts';
import { normalizeQuery } from '../src/demand/classification.ts';
import { decodeSessionToken } from '../src/auth/session.ts';
import { defaultCode, errorEnvelope, isRetryableStatus } from '../src/errors.ts';

type GoldenCase = { input: never; output: unknown };
const REPLAY_INSTANT = new Date('2026-09-27T00:00:00Z');
const PORTS: Record<string, (input: never) => unknown> = {
  opportunity_sources: sourcesGolden,
  opportunity_comparisons: (input: Parameters<typeof frozenComparisonKey>) =>
    frozenComparisonKey(...input),
  canonical_pages: (input: { url: string; origin: string | null }) =>
    canonicalPage(input.url, input.origin),
  query_normalizations: normalizeQuery,
  session_tokens: async (input: { key: string; token_segments: string[] }) => {
    const claims = await decodeSessionToken(
      input.token_segments.join('.'),
      input.key,
      REPLAY_INSTANT,
    );
    return claims === null ? { rejected: true } : { claims };
  },
};
const envelopeSchema = z.object({
  detail: z.unknown(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    request_id: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
const root = new URL('../golden/', import.meta.url);
const fixtures = readdirSync(root)
  .filter((name) => name.endsWith('.json'))
  .map(
    (name) =>
      JSON.parse(readFileSync(new URL(name, root), 'utf8')) as {
        name: string;
        cases: GoldenCase[];
      },
  );

describe('cross-stack contracts', () => {
  it('covers every registered live fixture', () => {
    expect(fixtures.map((fixture) => fixture.name).sort()).toEqual(
      [...Object.keys(PORTS), 'error_envelopes'].sort(),
    );
  });
  for (const golden of fixtures.filter((fixture) => fixture.name !== 'error_envelopes')) {
    it.each(golden.cases.map((entry, index) => [index, entry] as const))(
      `${golden.name} case %i`,
      async (_index, entry) =>
        expect(await PORTS[golden.name]?.(entry.input)).toEqual(entry.output),
    );
  }
  it.each(fixtures.find((fixture) => fixture.name === 'error_envelopes')!.cases)(
    'serves the shared envelope shape and status policy',
    ({ input, output }) => {
      const value = input as {
        status: number;
        message: string;
        details?: Record<string, unknown>;
        detail?: unknown;
      };
      const expected = envelopeSchema.parse(output);
      const actual = envelopeSchema.parse(
        errorEnvelope({
          code: defaultCode(value.status),
          message: value.message,
          requestId: 'request-fixture',
          retryable: isRetryableStatus(value.status),
          details: value.details,
          detail: value.detail,
        }),
      );
      // Everything but the per-request ID, which is checked only by the schema.
      const { request_id: _actualId, ...actualError } = actual.error;
      const { request_id: _expectedId, ...expectedError } = expected.error;
      expect({ ...actual, error: actualError }).toEqual({ ...expected, error: expectedError });
    },
  );
});
