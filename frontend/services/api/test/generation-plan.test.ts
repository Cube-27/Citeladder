import { describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import { admitDrafts } from '../src/prompts/generation-drafts.ts';
import { generationInput } from '../src/prompts/generation-input.ts';
import { setMetrics, thresholdFailures } from '../src/prompts/generation-metrics.ts';
import { geoTerms, namesPlace, planSlots } from '../src/prompts/generation-plan.ts';
import { fixtureContext, generationFixtures } from './fixtures/prompt-generation/context.ts';

const G = policy.prompts.generation;
const fixture = (name: string) => generationFixtures.find((item) => item.name === name)!;

describe('universe planner', () => {
  it.each(generationFixtures)(
    '$name: covers every offering and stage, and places only within its scope',
    (item) => {
      const slots = planSlots(fixtureContext(item), generationInput.parse({ count: 20 }), []);
      const located = slots.filter((slot) => slot.buyer_need.market).length / slots.length;
      expect(located).toBeLessThanOrEqual(
        G.location_policy[String(item.business_context.market_scope)] ?? 0,
      );
      const [low, high] =
        G.eval_thresholds.located_share[String(item.business_context.market_scope)] ??
        G.eval_thresholds.located_share.national!;
      expect(located).toBeGreaterThanOrEqual(low);
      expect(located).toBeLessThanOrEqual(high);
      expect(new Set(slots.map((slot) => slot.buyer_need.offering))).toEqual(
        new Set(item.offerings),
      );
      for (const offering of item.offerings)
        expect(
          new Set(
            slots
              .filter((slot) => slot.buyer_need.offering === offering)
              .map((slot) => slot.target_buyer_stage),
          ),
        ).toEqual(new Set(G.stages));
    },
  );

  it('never plans a market for a national business, whatever its service areas say', () => {
    const slots = planSlots(
      fixtureContext(fixture('national-d2c-apparel')),
      generationInput.parse({ count: 50 }),
      [],
    );
    expect(slots.some((slot) => slot.buyer_need.market)).toBe(false);
  });

  it('covers stages bare before facets, then keeps facets to their share of cells', () => {
    const entry = (value: string) => ({
      value,
      origin: 'manual' as const,
      review_state: 'confirmed' as const,
      reviewed_by: null,
      reviewed_at: null,
      source: {},
    });
    const school = fixture('regional-school');
    const maps = [
      {
        offering: 'Boarding school',
        attributes: [entry('co-educational'), entry('sports facilities')],
        situations: [entry('first-time boarder')],
        audiences: [entry('working parents')],
        exclusions: [],
      },
    ];
    const slots = planSlots(
      fixtureContext(school, maps),
      generationInput.parse({ count: 30 }),
      [],
    ).filter((slot) => slot.buyer_need.offering === 'Boarding school');
    const faceted = (slot: (typeof slots)[number]) =>
      Object.keys(slot.buyer_need).some((key) => key !== 'offering' && key !== 'market');
    expect(slots.slice(0, G.stages.length).some(faceted)).toBe(false);
    expect(slots.filter(faceted).length).toBeGreaterThan(0);
    expect(slots.filter(faceted).length).toBeLessThanOrEqual(G.facet_cell_share * slots.length);
    // Core cells suggest the intents coherent with their stage.
    for (const slot of slots)
      expect(slot.target_prompt_intents).toEqual(G.stage_intents[slot.target_buyer_stage]);
  });
});

describe('location admission', () => {
  const school = fixtureContext(fixture('regional-school'));
  const input = generationInput.parse({ count: 20 });
  const slots = planSlots(school, input, []);
  const bare = slots.find(
    (slot) => !slot.buyer_need.market && slot.target_buyer_stage === 'consideration',
  )!;
  const located = slots.find((slot) => slot.buyer_need.market)!;
  const row = (slot_id: string, text: string, names_place?: boolean) => ({
    slot_id,
    text,
    buyer_stage: 'consideration',
    prompt_intent: 'recommend',
    names_place,
  });

  it('drops a place in a cell without a market and records the model label beside it', () => {
    const result = admitDrafts(
      [
        row(
          bare.slot_id,
          'Which boarding schools in Uttarakhand suit a first-time boarder?',
          false,
        ),
        row(
          located.slot_id,
          `Which boarding schools near ${located.buyer_need.market} offer CBSE?`,
        ),
      ],
      [bare, located],
      school,
      input,
      [],
    );
    expect(result.admitted.map((draft) => draft.slot.slot_id)).toEqual([located.slot_id]);
    expect(result.drops).toEqual({ location_unplanned: 1 });
    expect(result.dropRecords[0]).toMatchObject({
      reason: 'location_unplanned',
      names_place: false,
    });
  });

  it('recognises places by whole word, capitals for short codes and dense scripts', () => {
    expect(geoTerms(school)).toEqual(expect.arrayContaining(['Dehradun', 'India']));
    expect(geoTerms(school)).not.toContain('INR');
    expect(namesPlace('Which school would suit us best?', ['US'])).toBe(false);
    expect(namesPlace('Which feed tools work in the US?', ['US'])).toBe(true);
    expect(namesPlace('Indiana schools', ['India'])).toBe(false);
    expect(namesPlace('静岡でおすすめの緑茶は？', ['静岡'])).toBe(true);
  });
});

describe('set metrics', () => {
  const base = {
    stages: G.stages,
    intents: ['recommend'],
    offerings: ['Jeans'],
    offeringOf: [] as string[],
    category: ['denim'],
    geo: ['India', 'Bengaluru'],
    brands: ['Denimly'],
  };
  const texts = [
    'Which jeans stay comfortable through a long workday at a desk?',
    'My jeans keep ripping at the pockets, what should I buy instead?',
    'Which stretch jeans keep their shape after many washes at home?',
    'What jeans suit tall men who struggle to find a long inseam?',
  ];

  it('passes a varied unlocated national set and fails one that leaks places', () => {
    const offeringOf = texts.map(() => 'Jeans');
    const clean = setMetrics({ ...base, texts, offeringOf });
    expect(thresholdFailures(clean, { market_scope: 'national', requested: 4 })).toEqual([]);
    const located = [
      ...texts.slice(0, 2),
      'Where can I buy jeans in Bengaluru that fit well?',
      'Which jeans brands in India last longest for daily wear?',
    ];
    const leaky = setMetrics({ ...base, texts: located, offeringOf });
    expect(leaky.located_share).toBe(0.5);
    expect(thresholdFailures(leaky, { market_scope: 'national', requested: 4 })).toEqual([
      'located_share',
    ]);
    expect(thresholdFailures(leaky, { market_scope: 'local', requested: 4 })).toEqual([]);
  });

  it('counts near duplicates, category restatements and shortfall', () => {
    const offeringOf = ['Jeans', 'Jeans', 'Jeans'];
    const metrics = setMetrics({
      ...base,
      offeringOf,
      texts: [
        'Which jeans stay comfortable at a desk all day?',
        'Which jeans stay comfortable at a desk all day long?',
        'Denim jeans?',
      ],
    });
    expect(metrics.near_duplicate_rate).toBeCloseTo(2 / 3);
    expect(metrics.category_restatement_rate).toBeCloseTo(1 / 3);
    expect(thresholdFailures(metrics, { market_scope: 'national', requested: 20 })).toEqual(
      expect.arrayContaining(['near_duplicate_rate', 'shortfall']),
    );
  });
});
