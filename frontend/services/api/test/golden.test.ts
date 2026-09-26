/**
 * Golden-master replay: the Python implementation produced every expected
 * output (`backend/scripts/golden_masters.py`); the port must match it as
 * serialized JSON, key order included.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodeSessionToken } from '../src/auth/session.ts';
import { secretIsWeak } from '../src/config.ts';
import { defaultCode, errorEnvelope, isRetryableStatus } from '../src/errors.ts';
import { sanitizeCorrelationId } from '../src/request-id.ts';

type GoldenCase = { input: never; output: unknown };

// Session fixtures carry fixed `exp`/`nbf`/`iat` claims; replay them at a
// fixed instant so the verdicts do not depend on when the suite runs.
const REPLAY_INSTANT = new Date('2026-09-27T00:00:00Z');

const PORTS: Record<string, (input: never) => unknown> = {
  correlation_ids: (input: string) => sanitizeCorrelationId(input),
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
  secret_strength: (input: string) => secretIsWeak(input),
  session_tokens: async (input: { key: string; token_segments: string[] }) => {
    const token = input.token_segments.join('.');
    const claims = await decodeSessionToken(token, input.key, REPLAY_INSTANT);
    return claims === null ? { rejected: true } : { claims };
  },
};

const goldenRoot = new URL('../golden/', import.meta.url);
const files = readdirSync(goldenRoot).filter((name) => name.endsWith('.json'));

describe('golden masters', () => {
  it('has a TypeScript port for every Python fixture set', () => {
    expect(files.map((name) => name.replace(/\.json$/u, '')).sort()).toEqual(
      Object.keys(PORTS).sort(),
    );
  });

  for (const file of files) {
    const golden = JSON.parse(readFileSync(new URL(file, goldenRoot), 'utf8')) as {
      name: string;
      cases: GoldenCase[];
    };
    const port = PORTS[golden.name];
    it.each(golden.cases.map((entry, index) => [index, entry] as const))(
      `${golden.name} case %i`,
      async (_index, entry) => {
        expect(JSON.stringify(await port?.(entry.input))).toBe(JSON.stringify(entry.output));
      },
    );
  }
});
