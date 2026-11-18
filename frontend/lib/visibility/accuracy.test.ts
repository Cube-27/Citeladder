import type { AccuracyClaim } from '@citeladder/contracts/fact-checking';
import { describe, expect, it } from 'vite-plus/test';

import { claimAgentPrompt } from './accuracy';

const claim: AccuracyClaim = {
  claim: 'Pro costs $49 a month.',
  topic: 'pricing',
  quote: 'Pro is $49/month',
  status: 'verdict',
  verdict: 'contradicted',
  reason: null,
  facts: [{ topic: 'pricing', statement: 'Pro costs $59 per month.', source_url: null }],
  logical_engine: 'chatgpt',
  prompt: 'best tools?',
  run_id: '00000000-0000-4000-8000-000000000001',
  execution_id: '00000000-0000-4000-8000-000000000002',
  observed_at: '2026-11-01T00:00:00Z',
  verdict_id: null,
  edited: null,
};

describe('claimAgentPrompt', () => {
  it('names why a claim has no verdict instead of one shared "not checked"', () => {
    const states: Partial<AccuracyClaim>[] = [
      {},
      { status: 'low_confidence', verdict: null, facts: [] },
      { status: 'unavailable', verdict: null, reason: 'platform_cap', facts: [] },
    ];
    expect(
      states.map(
        (state) =>
          claimAgentPrompt({ ...claim, ...state }, 'ChatGPT').split(
            '(claim: Pro costs $49 a month.). ',
          )[1],
      ),
    ).toEqual([
      'Checked against our fact: "Pro costs $59 per month.". Verdict: contradicted.',
      'Verdict: low confidence.',
      'Verdict: unavailable (platform limit reached).',
    ]);
  });
});
