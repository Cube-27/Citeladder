import { z } from 'zod';

import { policy } from '../config.ts';
import { record, strings } from '../db/json.ts';
import { getLogger } from '../logging.ts';
import { ModelError } from '../models/http.ts';
import type { ModelGateway } from '../models/gateway.ts';
import { bindingFailure } from './binding.ts';
import type { GenerationContext, OfferingMap } from './generation-context.ts';
import { generationInvalid, generationSetting, type GenerationInput } from './generation-input.ts';
import { promptTextHash } from './normalization.ts';

const G = policy.prompts.generation;
const dimensions = ['attributes', 'situations', 'audiences'] as const;
const facets = ['attribute', 'situation_or_constraint', 'audience'] as const;
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
const normalized = (text: string) => words(text).join(' ');
export const containsName = (text: string, names: readonly string[]) =>
  names.some(
    (name) => normalized(name) && ` ${normalized(text)} `.includes(` ${normalized(name)} `),
  );
const stem = (token: string) => token.replace(/(?<=[sxz]|ch|sh)es$/u, '').replace(/(?<!s)s$/u, '');

function brandTerms(context: GenerationContext): string[] {
  const { brand_name: brand, brand_aliases: aliases, business_context: business } = context.context;
  const generic = new Set([
    ...G.provider_phrases.flatMap(words).map(stem),
    ...policy.prompts.binding.stopwords,
    ...G.brand_common_words,
  ]);
  const category = new Set(
    policy.prompts.binding.business_context_fields.flatMap((field) => {
      const value = record(business)[field];
      return (typeof value === 'string' ? [value] : strings(value)).flatMap((phrase) =>
        phrase.split(/\s+-\s+|[(),;/–—|]+/u).map((segment) => stem(words(segment).at(-1) ?? '')),
      );
    }),
  );
  return [
    brand,
    ...aliases,
    ...words(brand).filter(
      (token) => token.length >= 4 && !generic.has(stem(token)) && !category.has(stem(token)),
    ),
  ];
}

export type Slot = {
  slot_id: string;
  topic_id: string;
  topic_name: string;
  topic_description: string;
  buyer_need: Record<string, string>;
  target_buyer_stage: string;
  allowed_prompt_intents: string[];
  evidence_ref: Record<string, unknown>;
};
export type Draft = {
  slot: Slot;
  text: string;
  hash: string;
  intent: string;
  buyer_stage: string;
  prompt_intent: string;
  decision?: Record<string, unknown>;
};
type Facet = { dimension: number; value: string; suggested: boolean };
function combinations(map: OfferingMap | undefined): Facet[][] {
  const options = dimensions.flatMap((dimension, index) =>
    (map?.[dimension] ?? []).map((entry) => ({
      dimension: index,
      value: entry.value,
      suggested: entry.review_state !== 'confirmed',
    })),
  );
  const result: Facet[][] = [[]];
  for (const option of options) {
    for (const prior of [...result]) {
      if (
        prior.length >= G.cell_max_facets ||
        prior.some((item) => item.dimension === option.dimension)
      )
        continue;
      const values = new Set([
        ...prior.map((item) => item.value.toLowerCase()),
        option.value.toLowerCase(),
      ]);
      if (
        map?.exclusions.some(
          (pair) => values.has(pair.first.toLowerCase()) && values.has(pair.second.toLowerCase()),
        )
      )
        continue;
      result.push([...prior, option]);
    }
  }
  return result;
}

export function planSlots(
  context: GenerationContext,
  input: GenerationInput,
  suggestions: OfferingMap[],
): Slot[] {
  const allowed = Object.entries(G.intent_legacy)
    .filter(([intent, legacy]) =>
      input.cohort === 'comparison'
        ? intent === 'compare'
        : input.cohort !== 'core' ||
          !input.intents.some(Boolean) ||
          input.intents.includes(legacy as GenerationInput['intents'][number]) ||
          (input.intents.includes('local') && G.local_intents.includes(intent)),
    )
    .map(([intent]) => intent);
  if (!allowed.length) throw generationInvalid('No labels support this request');
  const maps = [...context.maps, ...suggestions];
  const markets = ['', ...new Set(strings(record(context.context.business_context).service_areas))];
  const planners = context.selected.map((topic) => {
    const parent = context.topics.find((item) => item.id === topic.parent_id);
    const match = (name: string) =>
      maps.find(
        (map) =>
          map.offering.toLowerCase() === name.toLowerCase() &&
          dimensions.some((dimension) => map[dimension].length),
      );
    const map = match(topic.name) ?? (parent ? match(parent.name) : undefined);
    return {
      topic,
      map,
      combos: combinations(map),
      remaining: [] as Facet[][],
      usage: new Map<string, number>(),
    };
  });
  return Array.from(
    { length: input.count * generationSetting('overgenerate_factor') },
    (_, index) => {
      const plan = planners[index % planners.length]!;
      if (!plan.remaining.length) plan.remaining = [...plan.combos];
      const used = (key: string) => plan.usage.get(key) ?? 0;
      plan.remaining.sort(
        (a, b) =>
          Number(!a.length) - Number(!b.length) ||
          Number(a.some((v) => v.suggested)) - Number(b.some((v) => v.suggested)) ||
          a.reduce((sum, v) => sum + used(`${v.dimension}:${v.value}`), 0) -
            b.reduce((sum, v) => sum + used(`${v.dimension}:${v.value}`), 0),
      );
      const combo = plan.remaining.shift()!;
      const least = (key: string, options: readonly string[]) =>
        [...options].sort((a, b) => used(`${key}:${a}`) - used(`${key}:${b}`))[0]!;
      const stage = least('stage', G.stages),
        market = least('market', markets);
      for (const key of [
        ...combo.map((v) => `${v.dimension}:${v.value}`),
        `stage:${stage}`,
        `market:${market}`,
      ])
        plan.usage.set(key, used(key) + 1);
      const need: Record<string, string> = { offering: plan.map?.offering ?? plan.topic.name };
      for (const item of combo) need[facets[item.dimension]!] = item.value;
      if (market) need.market = market;
      return {
        slot_id: `q${index + 1}`,
        topic_id: plan.topic.id,
        topic_name: plan.topic.name,
        topic_description: plan.topic.description,
        buyer_need: need,
        target_buyer_stage: stage,
        allowed_prompt_intents: allowed,
        evidence_ref: {
          kind: 'business_map_cell',
          ...need,
          target_buyer_stage: stage,
          review_state: combo.some((v) => v.suggested) ? 'suggested' : 'confirmed',
          evidence_type: 'hypothesis',
        },
      };
    },
  );
}

const generatedRow = z.object({
  slot_id: z.string(),
  text: z.string(),
  buyer_stage: z.string(),
  prompt_intent: z.string(),
});
const generated = z.object({ prompts: z.array(generatedRow) });

export function admitDrafts(
  rows: z.infer<typeof generatedRow>[],
  slots: Slot[],
  context: GenerationContext,
  input: GenerationInput,
  prior: Draft[],
) {
  const seen = new Set([
    ...context.prompts.map((row) => row.normalized_text_hash),
    ...context.candidates
      .filter((row) => row.disposition === 'pending')
      .map((row) => row.normalized_text_hash),
    ...prior.map((row) => row.hash),
  ]);
  const usedSlots = new Set(prior.map((row) => row.slot.slot_id));
  const observed = new Set(
    context.context.demand_signals.flatMap((row) =>
      typeof row.observed_query === 'string' ? [promptTextHash(row.observed_query)] : [],
    ),
  );
  const brands = brandTerms(context);
  const competitors = context.context.competitors.flatMap((row) => [row.name, ...row.aliases]);
  const admitted: Draft[] = [];
  let dropped = 0;
  for (const row of rows) {
    const slot = slots.find((item) => item.slot_id === row.slot_id);
    const text = row.text.trim().replace(/\s+/gu, ' '),
      hash = promptTextHash(text);
    if (
      !slot ||
      usedSlots.has(slot.slot_id) ||
      !slot.allowed_prompt_intents.includes(row.prompt_intent) ||
      !G.stages.includes(row.buyer_stage)
    )
      continue;
    if (seen.has(hash)) {
      dropped++;
      continue;
    }
    if (
      !text ||
      text.length > policy.prompts.text_max_chars ||
      words(text).length < policy.prompts.text_min_words ||
      /[[{<][^[\]{}<>]*[\]}>]/u.test(text) ||
      observed.has(hash) ||
      bindingFailure(text, context.vocabulary)
    )
      continue;
    if (
      input.cohort === 'core'
        ? containsName(text, [...brands, ...competitors])
        : !containsName(text, [context.context.brand_name])
    )
      continue;
    if (
      input.cohort === 'comparison' &&
      (!containsName(text, competitors) || row.prompt_intent !== 'compare')
    )
      continue;
    seen.add(hash);
    usedSlots.add(slot.slot_id);
    admitted.push({
      slot,
      text,
      hash,
      intent: G.intent_legacy[row.prompt_intent as keyof typeof G.intent_legacy],
      buyer_stage: row.buyer_stage,
      prompt_intent: row.prompt_intent,
    });
  }
  return { admitted, dropped };
}

async function suggestMaps(
  gateway: ModelGateway,
  context: GenerationContext,
): Promise<OfferingMap[]> {
  const wanted = context.offerings.filter(
    (name) =>
      context.selected.some((topic) => topic.name.toLowerCase() === name.toLowerCase()) &&
      !context.maps.some(
        (map) =>
          map.offering.toLowerCase() === name.toLowerCase() &&
          dimensions.some((key) => map[key].length),
      ),
  );
  if (!wanted.length) return [];
  const values = z.array(z.string());
  const schema = z.object({
    offerings: z.array(
      z.object({ offering: z.string(), attributes: values, situations: values, audiences: values }),
    ),
  });
  try {
    const response = await gateway.structured(
      G.map_system,
      JSON.stringify({
        business_context: context.context.business_context,
        knowledge_base: context.context.knowledge_base,
        offerings: wanted,
      }),
      schema,
    );
    const banned = [
      context.context.brand_name,
      ...context.context.brand_aliases,
      ...context.context.competitors.flatMap((row) => [row.name, ...row.aliases]),
    ];
    return response.value.offerings.flatMap((item) => {
      const offering = wanted.find((name) => name.toLowerCase() === item.offering.toLowerCase());
      if (!offering) return [];
      const entries = (dimension: (typeof dimensions)[number]) =>
        [
          ...new Set(
            item[dimension]
              .slice(0, G.map_max_entries)
              .map((value) =>
                value
                  .trim()
                  .replace(/\s+/gu, ' ')
                  .slice(0, policy.brand_identity.map_value_max_chars),
              ),
          ),
        ]
          .filter((value) => value && !containsName(value, banned))
          .map((value) => ({
            value,
            origin: 'model' as const,
            review_state: 'suggested' as const,
            reviewed_by: null,
            reviewed_at: null,
            source: {
              generator_version: G.version,
              model: response.result.returned_model,
              transport_host: response.result.endpoint_host,
            },
          }));
      return [
        {
          offering,
          attributes: entries('attributes'),
          situations: entries('situations'),
          audiences: entries('audiences'),
          exclusions: [],
        },
      ];
    });
  } catch (error) {
    if (!(error instanceof ModelError)) throw error;
    getLogger('app.domain.prompts.map_suggestions').info('business map suggestion skipped', {
      error_type: error.code,
    });
    return [];
  }
}

function proposal(context: GenerationContext) {
  const revision = context.revision!;
  const blocks = [...revision.body.matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gmu)];
  if (blocks.length !== 1) throw generationInvalid('Portfolio requires one JSON prompt proposal');
  const schema = z.object({
    prompts: z
      .array(generatedRow.omit({ slot_id: true }).extend({ topic_id: z.uuid() }))
      .min(1)
      .max(generationSetting('max_count')),
  });
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(blocks[0]![1]!));
  } catch {
    throw generationInvalid('Portfolio contains invalid prompt rows');
  }
  const slots: Slot[] = parsed.prompts.map((row, index) => {
    const topic = context.selected.find((item) => item.id === row.topic_id);
    if (!topic) throw generationInvalid('Portfolio topic is unavailable in this selection');
    return {
      slot_id: `agent-${index + 1}`,
      topic_id: topic.id,
      topic_name: topic.name,
      topic_description: topic.description,
      buyer_need: { offering: topic.name },
      target_buyer_stage: '',
      allowed_prompt_intents: Object.keys(G.intent_legacy),
      evidence_ref: {
        kind: 'agent_output_revision',
        id: revision.id,
        offering: topic.name,
        evidence_type: 'hypothesis',
        review_state: 'suggested',
      },
    };
  });
  return {
    slots,
    rows: parsed.prompts.map((row, index) => ({ ...row, slot_id: slots[index]!.slot_id })),
  };
}

export async function generateDrafts(
  context: GenerationContext,
  input: GenerationInput,
  gateway: ModelGateway | null,
) {
  if (context.revision) {
    const { slots, rows } = proposal(context);
    const admitted = admitDrafts(rows, slots, context, input, []);
    return {
      drafts: admitted.admitted,
      dropped: admitted.dropped,
      maps: [] as OfferingMap[],
      models: [] as unknown[],
    };
  }
  if (!gateway) throw new ModelError('not_configured');
  const maps = await suggestMaps(gateway, context);
  const slots = planSlots(context, input, maps),
    drafts: Draft[] = [],
    models: unknown[] = [];
  const batchSize = generationSetting('model_batch_size');
  let dropped = 0,
    parseError = false;
  const systems = G.systems as Record<string, Record<string, string>>;
  const system = (systems[String(record(context.context.business_context).business_model)] ??
    systems[''])![input.cohort]!;
  for (let call = 0; call < Math.ceil(slots.length / batchSize) + 1; call++) {
    const accepted = new Set(drafts.map((row) => row.slot.slot_id));
    const batch = slots.filter((slot) => !accepted.has(slot.slot_id)).slice(0, batchSize);
    if (!batch.length) break;
    try {
      const response = await gateway.structured(
        system,
        JSON.stringify({
          reference_evidence: context.context,
          slots: batch,
          existing_prompts: [
            ...context.prompts.map((row) => row.text),
            ...drafts.map((row) => row.text),
          ].slice(-generationSetting('existing_prompt_context_limit')),
        }),
        generated,
      );
      const { content: _content, ...identity } = response.result;
      models.push(identity);
      const result = admitDrafts(response.value.prompts, batch, context, input, drafts);
      drafts.push(...result.admitted);
      dropped += result.dropped;
    } catch (error) {
      if (!(error instanceof ModelError) || error.code !== 'parse') throw error;
      parseError = true;
    }
  }
  if (!drafts.length && parseError) throw new ModelError('parse');
  return { drafts, dropped, maps, models };
}
