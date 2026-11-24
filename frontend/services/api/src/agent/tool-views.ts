import { z } from 'zod';
import { agentPolicy, type Json } from './contracts.ts';

type JsonObject = { [key: string]: Json };
type View = (data: JsonObject) => JsonObject;

const settings = agentPolicy.tool_view;
const hiddenByTool: Partial<Record<string, readonly string[]>> = settings.hidden_keys_by_tool;
const top = settings.overview_top;

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const objects = (value: Json | undefined): JsonObject[] =>
  Array.isArray(value) ? value.filter(isObject) : [];

function pick(row: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(row).filter(([key]) => keys.includes(key)));
}

function hide(value: Json, keys: ReadonlySet<string>): Json {
  if (Array.isArray(value)) return value.map((item) => hide(item, keys));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !keys.has(key))
      .map(([key, child]) => [key, hide(child, keys)]),
  );
}

function rounded(value: Json): Json {
  if (typeof value === 'number' && !Number.isInteger(value))
    return Number(value.toPrecision(settings.significant_digits));
  if (Array.isArray(value)) return value.map(rounded);
  if (isObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rounded(child)]));
  return value;
}

function mapList(data: JsonObject, key: string, row: (item: JsonObject) => Json): JsonObject {
  return Array.isArray(data[key]) ? { ...data, [key]: objects(data[key]).map(row) } : data;
}

function visibilityResult(row: JsonObject): JsonObject {
  return {
    ...pick(row, [
      'task_id',
      'prompt_id',
      'prompt_text',
      'logical_engine',
      'transport_model',
      'repetition',
      'completed_at',
      'search_used',
    ]),
    queries: objects(row.search_events).map((event) => event.query ?? null),
    mentions: objects(row.mentions).map((mention) => pick(mention, ['kind', 'name'])),
    citations: objects(row.citations).map((citation) =>
      pick(citation, ['url', 'title', 'domain', 'classification', 'matched_competitor']),
    ),
    ...pick(row, ['answer_excerpt', 'record_uri']),
  };
}

const TREND_RANKING = [
  'name',
  'is_brand',
  'mention_rate',
  'citation_rate',
  'share_of_voice',
  'avg_position',
  'win_rate',
];
const trendPoint = (point: JsonObject) =>
  rounded(mapList(point, 'rankings', (ranking) => pick(ranking, TREND_RANKING)));

function citationDays(data: JsonObject): JsonObject {
  if (!Array.isArray(data.citations)) return data;
  const days = new Map<string, number>();
  for (const citation of objects(data.citations)) {
    const date = String(citation.date);
    days.set(date, (days.get(date) ?? 0) + 1);
  }
  return { ...data, citations: [...days].map(([date, citations]) => ({ date, citations })) };
}

const QUOTE = ['text', 'theme', 'attribute', 'polarity', 'entity', 'logical_engine', 'prompt'];
const quote = (row: JsonObject) => pick(row, QUOTE);
const fewQuotes = (row: JsonObject) => ({
  ...row,
  quotes: objects(row.quotes).slice(0, settings.quotes_max).map(quote),
});
const perceptionEntity = (entity: JsonObject) =>
  mapList(entity, 'categories', (category) => mapList(category, 'attributes', fewQuotes));
const netSentiment = (row: JsonObject) => {
  const score = isObject(row.score) ? row.score.net_sentiment : null;
  return typeof score === 'number' ? score : null;
};

function perceptionPrompts(data: JsonObject): JsonObject {
  const all = objects(data.prompts);
  const scored = all.flatMap((row) => {
    const score = netSentiment(row);
    return score === null ? [] : [{ row, score }];
  });
  const prompts = scored.toSorted((a, b) => a.score - b.score).map(({ row }) => row);
  const most = settings.list_max;
  const shown =
    prompts.length <= most * 2 ? prompts : [...prompts.slice(0, most), ...prompts.slice(-most)];
  return { ...data, prompts: shown, prompt_count: all.length };
}

function perception(data: JsonObject): JsonObject {
  if (data.view === 'quotes') return mapList(data, 'items', quote);
  if (data.state !== 'available') return data;
  const summary = mapList(mapList(data, 'entities', perceptionEntity), 'themes', fewQuotes);
  return perceptionPrompts({
    ...mapList(summary, 'negative_quotes', quote),
    brand: isObject(data.brand) ? perceptionEntity(data.brand) : (data.brand ?? null),
  });
}

const PROMPT_ROW = [
  'prompt_id',
  'prompt_text',
  'theme',
  'intent',
  'composite_score',
  'previous_score',
  'immediate_delta',
  'decline_confirmed',
  'visibility_rate',
  'owned_citation_rate',
  'share_of_voice',
  'avg_position',
  'win_rate',
  'sentiment',
  'visibility_delta',
  'comparison_status',
  'action_id',
];
function promptRow(row: JsonObject): Json {
  return rounded({
    ...pick(row, PROMPT_ROW),
    brands: objects(row.brands)
      .slice(0, settings.brands_max)
      .map((brand) => brand.name ?? null),
    ...(isObject(row.comparison) ? { comparison: pick(row.comparison, ['status', 'deltas']) } : {}),
  });
}

const pageOf = (section: JsonObject) => (isObject(section.pagination) ? section.pagination : {});
const sectionViews: Record<string, View> = {
  prompts: (section) => ({
    ...pick(section, ['state', 'topics_truncated']),
    prompt_count: objects(section.items).length,
    more_prompts: pageOf(section).has_more === true || objects(section.items).length > top,
    topic_count: objects(section.topics).length,
    top_prompts: objects(section.items)
      .slice(0, top)
      .map((prompt) => pick(prompt, ['id', 'text', 'topic'])),
  }),
  actions: (section) => ({
    ...pick(section, ['state', 'status_counts']),
    more_actions: pageOf(section).has_more === true || objects(section.items).length > top,
    top_actions: objects(section.items)
      .slice(0, top)
      .map((action) => pick(action, ['id', 'target_label', 'status', 'priority_band', 'summary'])),
  }),
  referrals: (section) => ({
    ...pick(section, ['state', 'reason', 'window', 'referral_share', 'landing_page_count']),
    top_sources: objects(section.sources).slice(0, top),
    top_landing_pages: objects(section.landing_pages).slice(0, top),
  }),
};

function businessContext(data: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(data).map(([key, section]) => {
      const view = sectionViews[key];
      return [
        key,
        view && isObject(section) && section.state === 'available' ? view(section) : section,
      ];
    }),
  );
}

const fetchedText = z.string().transform((text, context) => {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    context.addIssue({ code: 'custom', message: 'not JSON' });
    return z.NEVER;
  }
});
function fetched(data: JsonObject): JsonObject {
  const complete = isObject(data.metadata) && data.metadata.complete === true;
  const record = complete ? fetchedText.safeParse(data.text) : null;
  if (!record?.success) return data;
  const { text: _text, ...document } = data;
  return { ...document, record: record.data };
}

const views: Partial<Record<string, View>> = {
  get_project_business_context: businessContext,
  fetch: fetched,
  read_visibility_results: (data) => mapList(data, 'items', visibilityResult),
  read_visibility_trends: (data) => mapList(data, 'points', trendPoint),
  read_ai_traffic_url: citationDays,
  read_perception: perception,
  read_prompt_metrics: (data) => (data.view === 'list' ? mapList(data, 'items', promptRow) : data),
};

export function modelView(tool: string, data: JsonObject): Json {
  const keys = new Set([...settings.hidden_keys, ...(hiddenByTool[tool] ?? [])]);
  return hide(views[tool]?.(data) ?? data, keys);
}
