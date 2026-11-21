import { policy } from '../config.ts';
import { ConfigError } from '../config/config-error.ts';
import { gatewaySettings } from '../models/gateway.ts';

const pricing = policy.billing.ai_credits;
const rates = policy.costs.platform;
export const PRICING_REVISION = pricing.revision;
export type ModelPrice = (typeof rates.models)[keyof typeof rates.models];

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

export function requestFeeMicrousd(provider: string): number | null {
  const fees: Record<string, number> = rates.request_fees_microusd;
  return Object.hasOwn(fees, provider) ? fees[provider]! : null;
}
export type ChargeMode = 'credits' | 'included' | 'not_charged';
export type MeteredFeature = keyof typeof pricing.features;

export function chargeMode(feature: MeteredFeature): ChargeMode {
  return pricing.features[feature] as ChargeMode;
}

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
  web_search_requests?: number | null;
};

export function tokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

type Tokens = {
  input: number;
  cached: number;
  written: number;
  writtenHour: number;
  output: number;
  searches: number;
};

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

function markedUpCredits(costMicrousdTimesMillion: bigint) {
  const scaled = costMicrousdTimesMillion * BigInt(pricing.markup_percent);
  const divisor = 100n * 1_000_000n * BigInt(pricing.credit_microusd);
  return Number((scaled + divisor - 1n) / divisor);
}

function credits(price: ModelPrice, tokens: Tokens) {
  return markedUpCredits(microusdTimesMillion(price, tokens));
}

export function costCredits(costMicrousd: number) {
  return markedUpCredits(BigInt(costMicrousd) * 1_000_000n);
}

export function costMicrousd(price: ModelPrice, usage: TokenUsage): number | null {
  const tokens = readUsage(usage);
  return tokens && Number((microusdTimesMillion(price, tokens) + 999_999n) / 1_000_000n);
}

export function chargeCredits(price: ModelPrice, usage: TokenUsage): number | null {
  const tokens = readUsage(usage);
  return tokens && credits(price, tokens);
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

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

export function unknownUsageCredits(reserved: number) {
  return Math.min(reserved, pricing.unknown_usage_credits);
}
