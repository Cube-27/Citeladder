import { describe, expect, it } from 'vite-plus/test';

import { contradictedChange } from './accuracy';

const coverage = {
  claims: 10,
  supported: 5,
  contradicted: 0,
  inconclusive: 0,
  not_covered: 0,
  low_confidence: 0,
  pending: 0,
  unavailable: [],
  answers_pending: 0,
  answers_unavailable: 0,
  edited: 0,
};

describe('contradictedChange', () => {
  const point = (audit: string, contradicted: number, comparable = true) => ({
    audit_id: audit,
    completed_at: '2026-11-01T00:00:00Z',
    comparable,
    score: { accuracy: null, coverage: { ...coverage, contradicted } },
  });
  const [A, B] = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'];

  it('compares the one run shown with the comparable run before it, else nothing', () => {
    expect([
      contradictedChange({ source_audit_ids: [B], trend: [point(A, 7), point(B, 3)] }),
      contradictedChange({ source_audit_ids: [B], trend: [point(A, 7), point(B, 3, false)] }),
      contradictedChange({ source_audit_ids: [A, B], trend: [point(A, 7), point(B, 3)] }),
      contradictedChange({ source_audit_ids: [B], trend: [point(B, 3)] }),
    ]).toEqual([-4, null, null, null]);
  });
});
