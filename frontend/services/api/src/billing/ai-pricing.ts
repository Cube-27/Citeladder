/**
 * AI credit pricing: tokens at the serving model's price, marked up, in whole
 * credits (B12, B14). Internal only: customers see credits, never the prices,
 * the markup or the credit's money value (B23). Provider rates come from the
 * internal rate card (`config/costs.json`); the credit configuration holds only
 * the customer side: the credit's value, the markup and what each feature spends.
 */
import { policy } from '../config.ts';
import { ConfigError } from '../config/config-error.ts';
import { gatewaySettings } from '../models/gateway.ts';

const pricing = policy.billing.ai_credits;
const rates = policy.costs.platform;
export const PRICING_REVISION = pricing.revision;
export type ModelPrice = (typeof rates.models)[keyof typeof rates.models];

/**
 * The per-search fee of the provider-hosted web search, read from the answer
 * engine rate card so one published fee has one configured value.
 */
function webSearchFee() {
  const catalog = Object.entries(policy.costs.catalogs).find(
    ([version]) => version === policy.costs.pricing_version,
  )?.[1];
  const fee = catalog?.find(
    (entry) => entry.identity.transport_provider === rates.web_search_provider,
  )?.pricing.search_fee_microusd;
  if (typeof fee !== 'number' || !Number.isSafeInteger(fee) || fee < 0)
    throw new ConfigError(`No web search fee is configured for ${rates.web_search_provider}`);
  return fee;
}
const WEB_SEARCH_MICROUSD = webSearchFee();

/** A provider priced per request, such as a search API; `null` when it is priced otherwise. */
export function requestFeeMicrousd(provider: string): number | null {
  const fees: Record<string, number> = rates.request_fees_microusd;
  return Object.hasOwn(fees, provider) ? fees[provider]! : null;
}
export type ChargeMode = 'credits' | 'included' | 'not_charged';
export type MeteredFeature = keyof typeof pricing.features;

/** Whether `feature` spends credits, is included in a prompt run, or is recorded only. */
export function chargeMode(feature: MeteredFeature): ChargeMode {
  return pricing.features[feature] as ChargeMode;
}

/**
 * The model's configured price. The platform gateway's model is priced at the
 * default price until it has its own; any other unpriced model has none and is
 * refused, never charged at another model's rate.
 */
export function modelPrice(
  model: string,
  gatewayModel = gatewaySettings().model,
): ModelPrice | null {
  const models: Record<string, ModelPrice> = rates.models;
  if (Object.hasOwn(models, model)) return models[model]!;
  return model && model === gatewayModel ? models[pricing.gateway_default_price]! : null;
}

/**
 * Token counts as the gateway reports them. Input includes cached and
 * cache-written input; output includes thinking, which providers bill as
 * output (B53). A report without a cache-write count wrote none. One-hour
 * cache writes are the part of the writes billed at the one-hour rate.
 */
export type TokenUsage = {
  input_tokens?: number | null;
  cached_input_tokens?: number | null;
  cache_write_input_tokens?: number | null;
  cache_write_1h_input_tokens?: number | null;
  output_tokens?: number | null;
  /** Provider-hosted web searches, billed per search beside the tokens; absent is none. */
  web_search_requests?: number | null;
};

/** A reported token count, or `null` unless it is a non-negative safe integer. */
export function tokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * `written` counts every cache write; `writtenHour` the part of it kept for an
 * hour; `searches` the provider-hosted web searches the call ran.
 */
type Tokens = {
  input: number;
  cached: number;
  written: number;
  writtenHour: number;
  output: number;
  searches: number;
};

/** Exact token counts from reported usage; `null` when the usage cannot be read. */
function readUsage(usage: TokenUsage): Tokens | null {
  const input = tokenCount(usage.input_tokens),
    cached = tokenCount(usage.cached_input_tokens ?? 0),
    written = tokenCount(usage.cache_write_input_tokens ?? 0),
    writtenHour = tokenCount(usage.cache_write_1h_input_tokens ?? 0),
    output = tokenCount(usage.output_tokens),
    searches = tokenCount(usage.web_search_requests ?? 0);
  if (
    input === null ||
    cached === null ||
    written === null ||
    writtenHour === null ||
    output === null ||
    searches === null
  )
    return null;
  if (cached + written > input || writtenHour > written) return null;
  return { input, cached, written, writtenHour, output, searches };
}

/**
 * The cost in micro-USD at the provider's published rates, multiplied by a
 * million to stay exact: cache reads at the cached rate, five-minute and
 * one-hour cache writes at their write rates, the rest of the input at the
 * base rate (B53), and each web search at its per-search rate (B59).
 */
function microusdTimesMillion(
  price: ModelPrice,
  { input, cached, written, writtenHour, output, searches }: Tokens,
) {
  return (
    BigInt(input - cached - written) * BigInt(price.input_microusd_per_million) +
    BigInt(cached) * BigInt(price.cached_input_microusd_per_million) +
    BigInt(written - writtenHour) * BigInt(price.cache_write_input_microusd_per_million) +
    BigInt(writtenHour) * BigInt(price.cache_write_1h_input_microusd_per_million) +
    BigInt(output) * BigInt(price.output_microusd_per_million) +
    BigInt(searches) * BigInt(WEB_SEARCH_MICROUSD) * 1_000_000n
  );
}

/** Whole credits for a cost, rounded up: `ceil(cost × markup ÷ credit)`. */
function markedUpCredits(costMicrousdTimesMillion: bigint) {
  const scaled = costMicrousdTimesMillion * BigInt(pricing.markup_percent);
  const divisor = 100n * 1_000_000n * BigInt(pricing.credit_microusd);
  return Number((scaled + divisor - 1n) / divisor);
}

/** Whole credits for exact token counts at the model's price. */
function credits(price: ModelPrice, tokens: Tokens) {
  return markedUpCredits(microusdTimesMillion(price, tokens));
}

/** Credits for a provider charged in money, converted exactly as token cost is (B40). */
export function costCredits(costMicrousd: number) {
  return markedUpCredits(BigInt(costMicrousd) * 1_000_000n);
}

/** The cost of a settled call in micro-USD before markup, for the internal record. */
export function costMicrousd(price: ModelPrice, usage: TokenUsage): number | null {
  const tokens = readUsage(usage);
  return tokens && Number((microusdTimesMillion(price, tokens) + 999_999n) / 1_000_000n);
}

/** Credits for a call's reported usage; `null` when the usage cannot be read. */
export function chargeCredits(price: ModelPrice, usage: TokenUsage): number | null {
  const tokens = readUsage(usage);
  return tokens && credits(price, tokens);
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

/** A model request's input size in UTF-8 bytes, the basis of its credit hold. */
export function requestInputBytes(system: string, user: string, schema?: unknown) {
  return bytes(system) + bytes(user) + (schema ? bytes(JSON.stringify(schema)) : 0);
}

/**
 * The most a call can cost: every input byte as an uncached token (a byte-level
 * tokenizer never emits more tokens than bytes) plus the full output cap.
 */
export function reservationCredits(price: ModelPrice, inputBytes: number, maxOutputTokens: number) {
  return Math.max(
    1,
    credits(price, {
      input: inputBytes,
      cached: 0,
      written: 0,
      writtenHour: 0,
      output: maxOutputTokens,
      searches: 0,
    }),
  );
}

/**
 * The most a cached call can cost: `maxInputTokens` (an upper bound on the
 * input tokens, such as the input's UTF-8 bytes) at the dearest of the base,
 * five-minute and one-hour cache-write rates, plus the output cap and every
 * web search the call may run.
 */
export function cachedReservationCredits(
  price: ModelPrice,
  maxInputTokens: number,
  maxOutputTokens: number,
  maxWebSearches = 0,
) {
  const base = price.input_microusd_per_million,
    minutes = price.cache_write_input_microusd_per_million,
    hour = price.cache_write_1h_input_microusd_per_million;
  const hourDearest = hour > base && hour >= minutes;
  const minutesDearest = !hourDearest && minutes > base;
  return Math.max(
    1,
    credits(price, {
      input: maxInputTokens,
      cached: 0,
      written: hourDearest || minutesDearest ? maxInputTokens : 0,
      writtenHour: hourDearest ? maxInputTokens : 0,
      output: maxOutputTokens,
      searches: maxWebSearches,
    }),
  );
}

/**
 * The largest output cap, at most `maxOutputTokens`, whose cached hold fits in
 * `credits`; 0 when even no output does not fit. Holds grow with the cap, so
 * a binary search finds it.
 */
export function affordableOutputTokens(
  price: ModelPrice,
  {
    credits: available,
    maxInputTokens,
    maxOutputTokens,
    maxWebSearches,
  }: {
    credits: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxWebSearches: number;
  },
) {
  const hold = (output: number) =>
    cachedReservationCredits(price, maxInputTokens, output, maxWebSearches);
  if (hold(0) > available) return 0;
  let low = 0,
    high = maxOutputTokens;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (hold(middle) <= available) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** What an unreadable settlement charges: a fixed fallback, never above the hold. */
export function unknownUsageCredits(reserved: number) {
  return Math.min(reserved, pricing.unknown_usage_credits);
}
