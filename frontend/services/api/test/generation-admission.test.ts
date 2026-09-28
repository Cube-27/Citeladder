import { afterEach, describe, expect, it, vi } from 'vitest';

import { policy } from '../src/config.ts';
import { ModelError } from '../src/models/http.ts';
import type { JevClient } from '../src/models/jev.ts';
import type { GenerationContext } from '../src/prompts/generation-context.ts';
import { admitDrafts, planSlots, type Draft } from '../src/prompts/generation-drafts.ts';
import { generationInput } from '../src/prompts/generation-input.ts';
import {
  applyQualityPolicy,
  judgeDrafts,
  selectDrafts,
} from '../src/prompts/generation-quality.ts';

const context = {
  prompts: [],
  candidates: [],
  maps: [],
  selected: [{ id: 'topic', name: 'Dresses', description: '', parent_id: null }],
  topics: [{ id: 'topic', name: 'Dresses', description: '', parent_id: null }],
  context: {
    brand_name: 'Red Dress',
    brand_aliases: [],
    competitors: [{ name: 'Rival', aliases: [] }],
    business_context: { category: 'Maxi dresses' },
    demand_signals: [{ observed_query: 'best dresses online' }],
  },
  vocabulary: { tokens: new Set(['dress', 'dresses']), phrases: new Set<string>() },
} as unknown as GenerationContext;

it('admits category language but rejects tracked identities, placeholders and copied observations', () => {
  const input = generationInput.parse({ count: 4 }),
    slots = planSlots(context, input, []);
  const texts = [
    'Which maxi dresses suit warm weather?',
    'Best Red Dress for summer?',
    'Which Rival dresses last longest?',
    'best dresses online',
    'Dresses near [city]',
    'Are reddress maxi dresses worth it?',
  ];
  const result = admitDrafts(
    texts.map((text, index) => ({
      text,
      slot_id: slots[index]!.slot_id,
      buyer_stage: 'decision',
      prompt_intent: 'recommend',
    })),
    slots,
    context,
    input,
    [],
  );
  expect(result.admitted.map((row) => row.text)).toEqual([texts[0]]);
});

it('never combines excluded map facets and retains hypothesis provenance', () => {
  const entry = (value: string) => ({
    value,
    origin: 'manual' as const,
    review_state: 'confirmed' as const,
    reviewed_by: null,
    reviewed_at: null,
    source: {},
  });
  const slots = planSlots(context, generationInput.parse({ count: 8 }), [
    {
      offering: 'Dresses',
      attributes: [entry('silk')],
      situations: [entry('machine wash')],
      audiences: [],
      exclusions: [{ first: 'silk', second: 'machine wash' }],
    },
  ]);
  expect(
    slots.every(
      (slot) =>
        !(
          slot.buyer_need.attribute === 'silk' &&
          slot.buyer_need.situation_or_constraint === 'machine wash'
        ),
    ),
  ).toBe(true);
  expect(slots.some((slot) => slot.buyer_need.attribute === 'silk')).toBe(true);
  expect(slots[0]!.evidence_ref.evidence_type).toBe('hypothesis');
});

describe('JEV judgments', () => {
  const answers = Object.fromEntries(
    Object.keys(policy.models.quality.noul_questions).map((key) => [key, { noul: 0.9 }]),
  );
  const draft = (): Draft => ({
    slot: planSlots(context, generationInput.parse({ count: 1 }), [])[0]!,
    text: 'Which maxi dresses suit warm weather?',
    hash: 'hash',
    intent: 'purchase',
    buyer_stage: 'decision',
    prompt_intent: 'buy',
  });
  const judge = (decide: JevClient['decide']): JevClient => ({ model: 'jev-test', decide });
  afterEach(() => vi.unstubAllEnvs());

  it('reports the gate unavailable only when a judgment is missing', async () => {
    const failed = judge(async () => {
      throw new ModelError('http', 503);
    });
    expect(await judgeDrafts(context, [draft()], failed)).toBe('unavailable');
    const incomplete = [draft()];
    const partial = judge(async () => ({ model: 'jev-test', answers: {} }));
    expect(await judgeDrafts(context, incomplete, partial)).toBe('gate');
    expect(incomplete[0]!.decision?.flags).toContain(policy.models.quality.flag_incomplete);
  });

  it('records but never removes strong failures in shadow mode', async () => {
    vi.stubEnv('JEV_MODE', 'shadow');
    const drafts = [draft()];
    const failing = judge(async () => ({
      model: 'jev-test',
      answers: { ...answers, decision_value: { noul: 0.01 } },
    }));
    expect(await judgeDrafts(context, drafts, failing)).toBe('shadow');
    expect(drafts[0]!.decision).toMatchObject({ verdict: 'fail', mode: 'shadow' });
    expect(selectDrafts(drafts, 1)).toHaveLength(1);
  });
});

it('keeps incomplete judgments uncertain, gates strong failures and prefers passing drafts', () => {
  expect(applyQualityPolicy({ answers: {} }).verdict).toBe('uncertain');
  const answers = Object.fromEntries(
    Object.keys(policy.models.quality.noul_questions).map((key) => [key, 0.9]),
  );
  const input = generationInput.parse({ count: 2 }),
    slots = planSlots(context, input, []);
  const drafts: Draft[] = slots.slice(0, 3).map((slot, index) => ({
    slot,
    text: String(index),
    hash: String(index),
    intent: 'purchase',
    buyer_stage: 'decision',
    prompt_intent: 'buy',
  }));
  drafts[1]!.decision = applyQualityPolicy({ answers });
  drafts[2]!.decision = applyQualityPolicy({ answers: { ...answers, decision_value: 0.01 } });
  expect(selectDrafts(drafts, 1).map((row) => row.text)).toEqual(['1']);
  expect(selectDrafts(drafts, 3).map((row) => row.text)).toEqual(['0', '1']);
});
