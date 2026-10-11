/**
 * AI credit pricing: tokens at the serving model's price, marked up, in whole
 * credits (B12, B14). Internal only: customers see credits, never the prices,
 * the markup or the credit's money value (B23).
 */
import { policy } from '../config.ts';
import { gatewaySettings } from '../models/gateway.ts';

const pricing = policy.billing.ai_credits;
export const PRICING_REVISION = pricing.revision;
export type ModelPrice = (typeof pricing.models)[keyof typeof pricing.models];
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
  const models: Record<string, ModelPrice> = pricing.models;
  if (Object.hasOwn(models, model)) return models[model]!;
  return model && model === gatewayModel ? models[pricing.gateway_default_price]! : null;
}

/** Token counts as the gateway reports them; input includes cached input. */
export type TokenUsage = {
  input_tokens?: number | null;
  cached_input_tokens?: number | null;
  output_tokens?: number | null;
};

/** A reported token count, or `null` unless it is a non-negative safe integer. */
export function tokenCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

type Tokens = { input: number; cached: number; output: number };

/** Exact token counts from reported usage; `null` when the usage cannot be read. */
function readUsage(usage: TokenUsage): Tokens | null {
  const input = tokenCount(usage.input_tokens),
    cached = tokenCount(usage.cached_input_tokens ?? 0),
    output = tokenCount(usage.output_tokens);
  if (input === null || cached === null || output === null || cached > input) return null;
  return { input, cached, output };
}

/** The tokens' cost in micro-USD, multiplied by a million to stay exact. */
function microusdTimesMillion(price: ModelPrice, { input, cached, output }: Tokens) {
  return (
    BigInt(input - cached) * BigInt(price.input_microusd_per_million) +
    BigInt(cached) * BigInt(price.cached_input_microusd_per_million) +
    BigInt(output) * BigInt(price.output_microusd_per_million)
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
  return Math.max(1, credits(price, { input: inputBytes, cached: 0, output: maxOutputTokens }));
}

/** What an unreadable settlement charges: a fixed fallback, never above the hold. */
export function unknownUsageCredits(reserved: number) {
  return Math.min(reserved, pricing.unknown_usage_credits);
}
