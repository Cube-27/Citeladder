import { describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import type { GenerationContext } from '../src/prompts/generation-context.ts';
import { admitDrafts, planBatches, type Draft } from '../src/prompts/generation-drafts.ts';
import { selectRun } from '../src/prompts/generation-quality.ts';
import {
  draftCallLimit,
  generationInput,
  validateSelection,
} from '../src/prompts/generation-input.ts';
import {
  observedLikeness,
  setMetrics,
  thresholdFailures,
} from '../src/prompts/generation-metrics.ts';
import {
  geoTerms,
  modelSlot,
  namesPlace,
  planSlots,
  topicWeights,
  type Slot,
} from '../src/prompts/generation-plan.ts';
import {
  fixtureContext,
  fixtureTopicId,
  generationFixtures,
} from './fixtures/prompt-generation/context.ts';

const G = policy.prompts.generation;
const fixture = (name: string) => generationFixtures.find((item) => item.name === name)!;
const entry = (value: string) => ({
  value,
  origin: 'manual' as const,
  review_state: 'confirmed' as const,
  reviewed_by: null,
  reviewed_at: null,
  source: {},
});
const schoolMaps = [
  {
    offering: 'Boarding school',
    attributes: [entry('co-educational'), entry('sports facilities')],
    situations: [entry('first-time boarder')],
    audiences: [entry('working parents')],
    exclusions: [],
  },
];
const facetOf = (slot: Slot) => {
  const keys = Object.keys(slot.buyer_need).filter((key) => !['offering', 'market'].includes(key));
  return keys.length ? keys.map((key) => [key, slot.buyer_need[key]]) : null;
};

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
        ).toEqual(new Set(['awareness', 'consideration', 'decision']));
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

  const school = fixture('regional-school');

  it('gives every cell exactly one facet from the first, alternating dimensions least-used first', () => {
    const slots = planSlots(
      fixtureContext(school, schoolMaps),
      generationInput.parse({ count: 30 }),
      [],
    ).filter((slot) => slot.buyer_need.offering === 'Boarding school');
    expect(slots.slice(0, 5).map(facetOf)).toEqual([
      [['attribute', 'co-educational']],
      [['situation_or_constraint', 'first-time boarder']],
      [['audience', 'working parents']],
      [['attribute', 'sports facilities']],
      [['situation_or_constraint', 'first-time boarder']],
    ]);
    expect(slots.every((slot) => facetOf(slot)?.length === 1)).toBe(true);
    for (const slot of slots)
      expect(slot.target_prompt_intents).toEqual(G.stage_intents[slot.target_buyer_stage]);
  });

  it('falls back to buyer roles and the business map audiences, and plans bare cells only without any', () => {
    const day = planSlots(
      fixtureContext(school, schoolMaps),
      generationInput.parse({ count: 9 }),
      [],
    ).filter((slot) => slot.buyer_need.offering === 'Day school');
    expect(day.map((slot) => [slot.buyer_need.audience, slot.evidence_ref.review_state])).toEqual([
      ['working parents', 'confirmed'],
      ['parents', 'suggested'],
      ['guardians', 'suggested'],
      ['working parents', 'confirmed'],
      ['parents', 'suggested'],
      ['guardians', 'suggested'],
    ]);
    const plain = fixtureContext(school);
    const roleless = {
      ...plain,
      context: {
        ...plain.context,
        business_context: { ...plain.context.business_context, buyer_roles: [] },
      },
    } as GenerationContext;
    const bare = planSlots(roleless, generationInput.parse({ count: 3 }), []);
    expect(bare.map(facetOf)).toEqual([null, null, null, null, null, null]);
    expect(new Set(bare.map((slot) => slot.evidence_ref.review_state))).toEqual(
      new Set(['not_applicable']),
    );
  });

  it('gives every cell of a default ten-topic run a facet (the thenetreturn.com shape)', () => {
    const offerings = Array.from({ length: 10 }, (_, index) => `Golf net ${index + 1}`);
    const topics = offerings.map((name, index) => ({
      id: fixtureTopicId(index),
      name,
      description: '',
      parent_id: null,
    }));
    const base = fixtureContext(fixture('national-d2c-apparel'));
    const context = {
      ...base,
      selected: topics,
      topics,
      maps: offerings.slice(0, 8).map((offering) => ({
        offering,
        attributes: [entry('automatic ball return')],
        situations: [entry('small garage')],
        audiences: [],
        exclusions: [],
      })),
      context: {
        ...base.context,
        business_context: {
          ...base.context.business_context,
          buyer_roles: ['home golfers', 'golf coaches'],
        },
      },
    } as GenerationContext;
    const slots = planSlots(context, generationInput.parse({ count: 20 }), []);
    expect(slots).toHaveLength(40);
    expect(slots.filter((slot) => facetOf(slot))).toHaveLength(40);
    expect(slots.filter((slot) => slot.buyer_need.offering === 'Golf net 9').map(facetOf)).toEqual([
      [['audience', 'home golfers']],
      [['audience', 'golf coaches']],
      [['audience', 'home golfers']],
      [['audience', 'golf coaches']],
    ]);
    const stages = Map.groupBy(slots, (slot) => slot.target_buyer_stage);
    expect(Object.fromEntries([...stages].map(([stage, items]) => [stage, items.length]))).toEqual({
      awareness: 14,
      consideration: 13,
      decision: 13,
    });
  });
});

describe('distribution-aware planning', () => {
  const school = fixture('regional-school');
  const tally = (values: string[]) =>
    Object.fromEntries(
      [...Map.groupBy(values, (value) => value)].map(([key, items]) => [key, items.length]),
    );

  it('defaults to a core-only run with stages balanced across the run', () => {
    const slots = planSlots(fixtureContext(school), generationInput.parse({ count: 15 }), []);
    expect(tally(slots.map((slot) => slot.cohort))).toEqual({ core: 30 });
    expect(tally(slots.map((slot) => slot.target_buyer_stage))).toEqual({
      awareness: 10,
      consideration: 10,
      decision: 10,
    });
  });

  it('allocates cohorts by share and stage labels by the intent mix', () => {
    const slots = planSlots(
      fixtureContext(school),
      generationInput.parse({
        count: 20,
        distribution: {
          branded_share: 0.2,
          comparison_share: 0.1,
          intent_mix: { informational: 25, commercial: 50, transactional: 25 },
        },
      }),
      [],
    );
    expect(tally(slots.map((slot) => slot.cohort))).toEqual({
      core: 28,
      brand_diagnostic: 8,
      comparison: 4,
    });
    expect(tally(slots.map((slot) => slot.target_buyer_stage))).toEqual({
      awareness: 10,
      consideration: 20,
      decision: 10,
    });
    expect(
      slots
        .filter((slot) => slot.cohort === 'comparison')
        .map((slot) => slot.allowed_prompt_intents),
    ).toEqual(Array.from({ length: 4 }, () => ['compare']));
  });

  it("uses the run's personas as the audience facets", () => {
    const slots = planSlots(
      fixtureContext(school, schoolMaps),
      generationInput.parse({
        count: 9,
        distribution: { personas: ['grandparents', 'military families'] },
      }),
      [],
    );
    const audiences = new Set(slots.flatMap((slot) => slot.buyer_need.audience ?? []));
    expect(audiences).toEqual(new Set(['grandparents', 'military families']));
    expect(slots.filter((slot) => slot.buyer_need.offering === 'Day school').map(facetOf)).toEqual([
      [['audience', 'grandparents']],
      [['audience', 'military families']],
      [['audience', 'grandparents']],
      [['audience', 'military families']],
      [['audience', 'grandparents']],
      [['audience', 'military families']],
    ]);
    const states = (offering: string) =>
      new Set(
        slots
          .filter((slot) => slot.buyer_need.offering === offering)
          .map((slot) => [slot.buyer_need.audience ?? '-', slot.evidence_ref.review_state].join()),
      );
    expect(states('Day school')).toEqual(
      new Set(['grandparents,requested', 'military families,requested']),
    );
    expect(states('Boarding school')).toEqual(
      new Set(['-,confirmed', 'grandparents,requested', 'military families,requested']),
    );
  });

  it('plans a recovered category with the business maps of the offerings it covers', () => {
    const base = fixtureContext(school, schoolMaps);
    const category = {
      id: fixtureTopicId(7),
      name: 'Residential schooling',
      description: '',
      parent_id: null,
    };
    const context = {
      ...base,
      selected: [category],
      topics: [category],
      context: {
        ...base.context,
        business_context: {
          ...base.context.business_context,
          topic_offerings: { [category.id]: ['Boarding school'] },
        },
      },
    } as GenerationContext;
    const slots = planSlots(context, generationInput.parse({ count: 2 }), []);
    expect(
      slots.map((slot) => [
        slot.buyer_need.offering,
        facetOf(slot),
        slot.evidence_ref.review_state,
      ]),
    ).toEqual([
      ['Residential schooling', [['attribute', 'co-educational']], 'confirmed'],
      ['Residential schooling', [['situation_or_constraint', 'first-time boarder']], 'confirmed'],
      ['Residential schooling', [['audience', 'working parents']], 'confirmed'],
      ['Residential schooling', [['attribute', 'sports facilities']], 'confirmed'],
    ]);
  });

  it('grounds only on the chosen seed source and ids, and on nothing for none', () => {
    const context = fixtureContext(school, [], { grounded: true });
    const [first, second] = context.observed;
    const grounding = (input: Record<string, unknown>) =>
      new Set(
        planSlots(context, generationInput.parse({ count: 6, ...input }), []).flatMap(
          (slot) => slot.grounding?.map((search) => search.id) ?? [],
        ),
      );
    expect(grounding({ seed_source: 'search_console', seed_query_ids: [second!.id] })).toEqual(
      new Set([second!.id]),
    );
    expect(grounding({ seed_source: 'none' })).toEqual(new Set());
    expect(grounding({ seed_source: 'search_intelligence' })).toEqual(new Set());
    expect(grounding({})).toContain(first!.id);
  });

  it('refuses distributions that cannot be planned before any model call', () => {
    expect(() =>
      generationInput.parse({ distribution: { branded_share: 0.7, comparison_share: 0.4 } }),
    ).toThrow('Branded and comparison shares cannot exceed the whole run');
    expect(() =>
      validateSelection(
        generationInput.parse({ cohort: 'comparison', distribution: { branded_share: 0.2 } }),
        [],
      ),
    ).toThrow(expect.objectContaining({ status: 422 }));
    expect(() =>
      validateSelection(generationInput.parse({ seed_query_ids: [fixtureTopicId(1)] }), []),
    ).toThrow('Seed queries need their search data source');
  });
});

describe('topic weights and branded claims (the thenetreturn.com run)', () => {
  const suggested = (value: string) => ({ ...entry(value), review_state: 'suggested' as const });
  const names = [
    'Golf practice nets',
    'Football kicking nets',
    'Golf net packages',
    'Golf simulators',
    'Hitting mats',
    'Training aids',
  ];
  const topics = names.map((name, index) => ({
    id: fixtureTopicId(index),
    name,
    description: '',
    parent_id: null,
  }));
  const covered: Record<string, string[]> = {
    [topics[0]!.id]: ['Pro net', 'Home net', 'Mini net', 'Junior net'],
    [topics[1]!.id]: ['Extra Point net', 'Custom Extra Point net'],
    [topics[2]!.id]: ['Net packages', 'Side barriers'],
    [topics[3]!.id]: ['Launch monitor packages', 'Simulator bays'],
    [topics[4]!.id]: ['Hitting mats'],
    [topics[5]!.id]: ['Training aids'],
  };
  const base = fixtureContext(fixture('national-d2c-apparel'));
  const context = {
    ...base,
    selected: topics,
    topics,
    maps: [
      {
        offering: 'Simulator bays',
        attributes: [suggested('Portable bay design'), entry('Impact screen')],
        situations: [suggested('Indoor simulator build')],
        audiences: [suggested('Golf facility operators')],
        exclusions: [],
      },
    ],
    context: {
      ...base.context,
      business_context: {
        ...base.context.business_context,
        buyer_roles: ['home golfers'],
        topic_offerings: covered,
      },
    },
  } as GenerationContext;
  const input = generationInput.parse({ count: 20, distribution: { branded_share: 0.2 } });
  const perTopic = (slots: readonly Slot[]) =>
    names.map((name) => slots.filter((slot) => slot.topic_name === name).length);

  it('plans and selects each topic in proportion to the offerings it covers', () => {
    const slots = planSlots(context, input, []);
    const core = slots.filter((slot) => slot.cohort === 'core');
    expect(perTopic(core)).toEqual([11, 5, 5, 5, 3, 3]);
    const drafts: Draft[] = slots.map((slot) => ({
      slot,
      text: slot.slot_id,
      hash: slot.slot_id,
      intent: 'purchase',
      buyer_stage: slot.target_buyer_stage,
      prompt_intent: 'recommend',
    }));
    const selected = selectRun(drafts, input, topicWeights(context));
    expect(
      perTopic(selected.filter((draft) => draft.slot.cohort === 'core').map((d) => d.slot)),
    ).toEqual([5, 3, 3, 3, 1, 1]);
  });

  it('never gives a branded cell an attribute only a model suggested, and bounds its claims', () => {
    const simulators = (cohort: 'core' | 'brand_diagnostic') =>
      planSlots(context, generationInput.parse({ count: 20, cohort }), []).filter(
        (slot) => slot.topic_name === 'Golf simulators',
      );
    const facets = (slots: Slot[]) => new Set(slots.map((slot) => facetOf(slot)?.[0]?.join(': ')));
    expect(facets(simulators('core'))).toEqual(
      new Set([
        'attribute: Portable bay design',
        'attribute: Impact screen',
        'situation_or_constraint: Indoor simulator build',
        'audience: Golf facility operators',
        'audience: home golfers',
      ]),
    );
    expect(facets(simulators('brand_diagnostic'))).toEqual(
      new Set([
        'attribute: Impact screen',
        'situation_or_constraint: Indoor simulator build',
        'audience: Golf facility operators',
        'audience: home golfers',
      ]),
    );
    const branded = simulators('brand_diagnostic')[0]!;
    expect(branded.grounded_attributes).toEqual([
      'Launch monitor packages',
      'Simulator bays',
      'Impact screen',
    ]);
    expect(modelSlot(branded)).not.toHaveProperty('grounded_attributes');
    expect(simulators('core')[0]).not.toHaveProperty('grounded_attributes');
  });
});

describe('draft batches', () => {
  it("keeps each topic's cells in one batch, one cohort per batch, within the call limit", () => {
    const offerings = Array.from({ length: 7 }, (_, index) => `Offering ${index + 1}`);
    const topics = offerings.map((name, index) => ({
      id: fixtureTopicId(index),
      name,
      description: '',
      parent_id: null,
    }));
    const base = fixtureContext(fixture('global-b2b-saas'));
    const context = { ...base, selected: topics, topics } as GenerationContext;
    const input = generationInput.parse({ count: 20, distribution: { branded_share: 0.25 } });
    const batches = planBatches(planSlots(context, input, []), 20);
    expect(batches.map((batch) => batch.length)).toEqual([17, 13, 10]);
    for (const batch of batches) expect(new Set(batch.map((slot) => slot.cohort)).size).toBe(1);
    const topicBatches = Map.groupBy(
      batches.flatMap((batch, index) =>
        batch.map((slot) => [`${slot.cohort}:${slot.topic_id}`, index] as const),
      ),
      ([key]) => key,
    );
    for (const placements of topicBatches.values())
      expect(new Set(placements.map(([, index]) => index)).size).toBe(1);
    expect(batches.length).toBeLessThan(draftCallLimit(input));
  });
});

describe('grounding', () => {
  it.each(generationFixtures)(
    '$name: observed searches only add grounding to an otherwise identical plan',
    (item) => {
      const input = generationInput.parse({ count: 20 });
      const plain = planSlots(fixtureContext(item), input, []);
      const grounded = planSlots(fixtureContext(item, [], { grounded: true }), input, []);
      expect(plain.some((slot) => 'grounding' in slot)).toBe(false);
      expect(plain.map(modelSlot)).toEqual(plain);
      expect(grounded.some((slot) => slot.grounding?.length)).toBe(true);
      expect(grounded.map(({ grounding: _grounding, ...slot }) => slot)).toEqual(plain);
    },
  );

  it('gives a slot up to three same-topic searches, closest to its cell first', () => {
    const service = fixture('local-service');
    const search = (text: string, topic: number, weight: number) => ({
      id: `id:${text}`,
      source: 'gsc' as const,
      text,
      topic_id: fixtureTopicId(topic),
      weight,
      classifier_version: 'branded-query-1',
      override_id: null,
    });
    const context = {
      ...fixtureContext(service),
      observed: [
        search('ac repair service near me same day', 0, 5400),
        search('split ac not cooling repair cost', 0, 1900),
        search('who repairs inverter ac gas leak', 0, 320),
        search('ac repair delhi same day visit', 0, 50),
        search('split ac installation charges with copper pipe', 1, 2900),
      ],
    };
    const slots = planSlots(context, generationInput.parse({ count: 20 }), []);
    const texts = (slot: (typeof slots)[number] | undefined) =>
      slot?.grounding?.map((example) => example.text);
    const repair = slots.filter((slot) => slot.buyer_need.offering === 'AC repair');
    expect(texts(repair.find((slot) => !slot.buyer_need.market))).toEqual([
      'ac repair service near me same day',
      'split ac not cooling repair cost',
      'who repairs inverter ac gas leak',
    ]);
    expect(texts(repair.find((slot) => slot.buyer_need.market === 'Delhi'))).toEqual([
      'ac repair delhi same day visit',
      'ac repair service near me same day',
      'split ac not cooling repair cost',
    ]);
    expect(
      new Set(
        slots
          .filter((slot) => slot.buyer_need.offering === 'AC installation')
          .flatMap((slot) => texts(slot) ?? []),
      ),
    ).toEqual(new Set(['split ac installation charges with copper pipe']));
    const sent = modelSlot(repair[0]!);
    expect(sent).toMatchObject({
      buyer_search_examples: [
        'ac repair service near me same day',
        'split ac not cooling repair cost',
        'who repairs inverter ac gas leak',
      ],
    });
    expect(sent).not.toHaveProperty('grounding');
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
    'Stretch jeans that keep their shape after many washes at home',
    'What jeans suit tall men who struggle to find a long inseam?',
  ];

  it('measures openings by their first word', () => {
    const metrics = setMetrics({
      ...base,
      offeringOf: ['Jeans', 'Jeans', 'Jeans', 'Jeans'],
      texts: [
        'Which jeans suit long days of desk work?',
        'Which stores sell jeans for very tall men?',
        'Best jeans for cycling to work every day',
        'Where can I buy raw denim jeans online?',
      ],
    });
    expect(metrics.opening_concentration).toBe(0.5);
    expect(thresholdFailures(metrics, { market_scope: 'national', requested: 4 })).toEqual([
      'opening_concentration',
    ]);
  });

  it('passes a varied unlocated national set and fails one that leaks places', () => {
    const offeringOf = texts.map(() => 'Jeans');
    const clean = setMetrics({ ...base, texts, offeringOf });
    expect(thresholdFailures(clean, { market_scope: 'national', requested: 4 })).toEqual([]);
    const located = [
      ...texts.slice(0, 2),
      'Where can I buy jeans in Bengaluru that fit well?',
      'Jeans brands in India that last longest for daily wear',
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

describe('observed likeness', () => {
  it('counts prompts phrased like a same-topic search, but not copies or other topics', () => {
    const observed = [
      { text: 'stretchable jeans for men slim fit', topic_id: 'jeans' },
      { text: 'cotton chinos for office wear', topic_id: 'chinos' },
    ];
    expect(
      observedLikeness(
        [
          { text: 'Which slim fit stretchable jeans suit men at work?', topic_id: 'jeans' },
          { text: 'stretchable jeans for men slim fit', topic_id: 'jeans' },
          { text: 'Which cotton chinos suit office wear?', topic_id: 'jeans' },
          { text: 'Where can I buy durable work boots?', topic_id: 'jeans' },
        ],
        observed,
      ),
    ).toBe(0.25);
  });
});
