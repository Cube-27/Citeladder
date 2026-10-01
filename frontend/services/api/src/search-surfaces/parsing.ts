import { getDomain } from 'tldts';
import { record } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import { ProviderError, type Citation, type SearchEvent } from '../answer-engines/contracts.ts';
import type { ExecutionResult } from '../audits/result-persistence.ts';
import { providerPolicy } from '../providers/config.ts';
import { classifySourceOrigin } from '../analysis/opportunities/source-patterns.ts';
import { citationIdentity } from '../source-pages/identity.ts';
import { providerCharge, searchPolicy, type SearchEngine } from './dataforseo.ts';

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const objects = (value: unknown) =>
  list(value)
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map(record);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;
const domain = (value: string) => getDomain(value) ?? '';
const pending = (status: unknown) =>
  typeof status === 'number' && searchPolicy.constants.pending_task_status_codes.includes(status);
type SurfaceLink = { url: string; domain: string; title: string; element_index: number };
type SurfaceReference = {
  url: string;
  domain: string;
  title: string;
  source_origin: string;
};
export type OverviewResult = {
  outcome: string;
  provider_status_code: number | null;
  error_code: string;
  aio_present: boolean | null;
  aio_serp_position: number | null;
  answer_text: string;
  aio_markdown: string;
  elements: Record<string, unknown>[];
  links: SurfaceLink[];
  references: SurfaceReference[];
  provider_cost_microusd: number | null;
  observed_at: Date | null;
  raw_payload: Record<string, unknown>;
};
export function surfaceFailure(errorCode: string): OverviewResult {
  if (!searchPolicy.surface.execution_failure_codes.includes(errorCode))
    throw new Error('Invalid surface failure code');
  return emptyOverview(searchPolicy.surface.outcome_execution_failure, {}, null, errorCode);
}
function emptyOverview(
  outcome: string,
  raw: Record<string, unknown>,
  status: number | null = null,
  errorCode = '',
): OverviewResult {
  return {
    outcome,
    raw_payload: raw,
    provider_status_code: status,
    error_code: errorCode,
    aio_present: null,
    aio_serp_position: null,
    answer_text: '',
    aio_markdown: '',
    elements: [],
    links: [],
    references: [],
    provider_cost_microusd: null,
    observed_at: null,
  };
}
function observedAt(page: Record<string, unknown>, task: Record<string, unknown>) {
  for (const source of [page, task]) {
    const raw = text(source.datetime || source.time).replace(' +00:00', 'Z');
    if (!raw) continue;
    const value = new Date(raw);
    if (Number.isFinite(value.getTime())) return value;
  }
  return null;
}
function elements(block: Record<string, unknown>): [number, Record<string, unknown>][] {
  if (block.items != null && !Array.isArray(block.items))
    throw new Error('Invalid overview elements');
  const result: [number, Record<string, unknown>][] = [];
  function descend(value: unknown, index: number, depth: number) {
    const node = record(value);
    if (
      depth > 128 ||
      !['ai_overview_element', 'ai_overview_expanded_element'].includes(scalarText(node.type))
    )
      throw new Error('Unknown overview element');
    result.push([index, node]);
    for (const child of objects(node.items)) descend(child, index, depth + 1);
  }
  list(block.items).forEach((node, index) => descend(node, index, 0));
  return result;
}
function fragments(element: Record<string, unknown>) {
  const table = record(element.table);
  const values = [
    text(element.title),
    text(element.text),
    ...list(table.table_header).map(text),
    ...list(table.table_content).map((row) => list(row).map(text).filter(Boolean).join(' ')),
    ...list(element.items).map(text),
  ].filter(Boolean);
  return values.length ? values : [text(element.markdown)].filter(Boolean);
}
/** Envelope and exact task identity precede every presence decision; cards never enter visible text. */
export function parseOverview(
  payload: unknown,
  expectedId: string,
): OverviewResult | 'still_pending' {
  const envelope = record(payload),
    envelopeStatus = integer(envelope.status_code),
    c = searchPolicy.constants,
    s = searchPolicy.surface;
  if (envelopeStatus !== null && envelopeStatus !== c.status_ok)
    return emptyOverview(s.outcome_provider_error, envelope, envelopeStatus);
  const matched = objects(envelope.tasks).filter((t) => scalarText(t.id) === expectedId);
  if (matched.length !== 1)
    return emptyOverview(s.outcome_parser_error, {
      parse_error: 'task identity is missing or ambiguous',
      payload: envelope,
    });
  const task = matched[0]!,
    status = integer(task.status_code);
  if (pending(status)) return 'still_pending';
  if (status === null) return emptyOverview(s.outcome_parser_error, task);
  if (status !== c.status_ok) return emptyOverview(s.outcome_provider_error, task, status);
  const pages = list(task.result),
    page = record(pages[0]);
  if (
    !pages.length ||
    !Object.keys(page).length ||
    (page.items != null && !Array.isArray(page.items))
  )
    return emptyOverview(s.outcome_parser_error, task);
  const block = objects(page.items).find((item) => item.type === 'ai_overview');
  const base = {
    ...emptyOverview(
      block ? s.outcome_ai_overview_present : s.outcome_no_ai_overview,
      task,
      status,
    ),
    aio_present: Boolean(block),
    observed_at: observedAt(page, task),
    provider_cost_microusd: providerCharge(task.cost),
  };
  if (!block) return base;
  try {
    const walked = elements(block),
      seenText = new Set<string>(),
      parts: string[] = [];
    const links = new Map<string, SurfaceLink>();
    for (const [index, element] of walked) {
      for (const fragment of fragments(element)) {
        // Casefold and whitespace only; punctuation distinguishes visible fragments.
        const key = fragment
          .split(/\s+/u)
          .filter(Boolean)
          .join(' ')
          .replaceAll(
            /./gsu,
            (char) =>
              searchPolicy.casefold_overrides[
                char as keyof typeof searchPolicy.casefold_overrides
              ] ?? char.toLowerCase(),
          );
        if (!key || seenText.has(key)) continue;
        seenText.add(key);
        parts.push(fragment.trim());
      }
      for (const link of objects(element.links)) {
        const url = scalarText(link.url).trim();
        if (url && !links.has(url))
          links.set(url, {
            url,
            domain: domain(scalarText(link.domain) || url),
            title: scalarText(link.title),
            element_index: index,
          });
      }
    }
    const references = new Map<string, SurfaceReference>();
    for (const ref of objects(block.references)) {
      const url = scalarText(ref.url).trim(),
        host = domain(scalarText(ref.domain) || url);
      if (url && !references.has(url))
        references.set(url, {
          url,
          domain: host,
          title: scalarText(ref.title),
          source_origin: classifySourceOrigin(host),
        });
    }
    return {
      ...base,
      answer_text: parts.join('\n\n'),
      aio_markdown: scalarText(block.markdown),
      aio_serp_position: integer(block.rank_absolute),
      elements: walked.map(([, e]) => e),
      links: [...links.values()],
      references: [...references.values()],
    };
  } catch {
    return emptyOverview(
      s.outcome_parser_error,
      { parse_error: 'unsupported overview structure', payload: task },
      status,
    );
  }
}
const emptyUsage = {
  uncached_input_tokens: null,
  cached_input_tokens: null,
  output_tokens: null,
  reasoning_tokens: null,
  total_tokens: null,
  web_search_requests: null,
  provider_cost_microusd: null,
};
export function overviewAnswer(result: OverviewResult): ExecutionResult {
  const route = providerPolicy.routes.google_ai_overview;
  return {
    logical_engine: 'google_ai_overview',
    transport_provider: 'dataforseo',
    transport_model: route.transport_model,
    answer_text: result.answer_text,
    search_used: false,
    search_events: [],
    citations: result.references.map((ref, index) => ({
      ordinal: index,
      url: ref.url,
      title: ref.title,
      domain: ref.domain,
      start_index: null,
      end_index: null,
      cited_text: '',
    })),
    finish_reason: 'unknown',
    raw_finish_reason: '',
    latency_ms: 0,
    normalized_usage: { ...emptyUsage, provider_cost_microusd: result.provider_cost_microusd },
    provider_metadata: {
      raw_response: result.raw_payload,
      search_surface_outcome: result.outcome,
      provider_status_code: result.provider_status_code,
      aio_serp_position: result.aio_serp_position,
      aio_markdown: result.aio_markdown,
      query_text_available: false,
      fanout_availability: 'unavailable',
    },
  };
}
function scraperSources(node: Record<string, unknown>, depth = 0): Record<string, unknown>[] {
  if (depth > 128) throw new ProviderError('parse_error');
  return [
    ...objects(node.sources),
    ...objects(node.items).flatMap((child) => scraperSources(child, depth + 1)),
  ];
}
export function parseScraper(
  payload: unknown,
  expectedId: string,
  engine: Exclude<SearchEngine, 'google_ai_overview'>,
): ExecutionResult | 'still_pending' {
  const envelope = record(payload);
  if (envelope.status_code !== searchPolicy.constants.status_ok)
    throw new ProviderError('parse_error');
  const matched = objects(envelope.tasks).filter((t) => t.id === expectedId);
  if (matched.length !== 1) throw new ProviderError('parse_error');
  const task = matched[0]!;
  if (pending(task.status_code)) return 'still_pending';
  const pages = objects(task.result),
    page = pages[0];
  const answer = page
    ? text(page.markdown) ||
      objects(page.items)
        .map((item) => text(item.markdown) || text(item.text))
        .filter(Boolean)
        .join('\n\n')
    : '';
  if (task.status_code !== searchPolicy.constants.status_ok || pages.length !== 1 || !answer)
    throw new ProviderError('parse_error');
  const rawFanout = page!.fan_out_queries;
  const valid =
    Array.isArray(rawFanout) &&
    rawFanout.every((value) => typeof value === 'string' && value.trim());
  const events: SearchEvent[] = valid
    ? rawFanout.map((query, index) => ({
        sequence: index,
        query,
        call_id: '',
        call_sequence: 0,
        query_sequence: index,
      }))
    : [];
  const availability = valid
    ? events.length
      ? 'queries_available'
      : 'no_exposed_queries'
    : 'unavailable';
  const citations: Citation[] = [],
    seen = new Set<string>();
  for (const source of scraperSources(page!)) {
    const url = citationIdentity(text(source.url)).canonical_url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    citations.push({
      ordinal: citations.length,
      url,
      title: text(source.title),
      domain: domain(url),
      start_index: null,
      end_index: null,
      cited_text: '',
    });
  }
  const route = providerPolicy.routes[engine];
  return {
    logical_engine: engine,
    transport_provider: 'dataforseo',
    transport_model: route.transport_model,
    answer_text: answer,
    search_used: Boolean(
      events.length || list(page!.search_results).length || list(page!.sources).length,
    ),
    search_events: events,
    citations,
    finish_reason: 'stop',
    raw_finish_reason: '',
    latency_ms: 0,
    normalized_usage: { ...emptyUsage, provider_cost_microusd: providerCharge(task.cost) },
    provider_metadata: {
      raw_response: envelope,
      provider_reported_model: page!.model ?? null,
      fanout_availability: availability,
      query_text_available: valid,
      search_results: objects(page!.search_results),
    },
  };
}
