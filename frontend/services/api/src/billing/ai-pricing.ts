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

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Whole credits for exact token counts, rounded up: `ceil(cost × markup ÷ credit)`. */
function credits(price: ModelPrice, input: number, cached: number, output: number) {
  const microusdTimesMillion =
    BigInt(input - cached) * BigInt(price.input_microusd_per_million) +
    BigInt(cached) * BigInt(price.cached_input_microusd_per_million) +
    BigInt(output) * BigInt(price.output_microusd_per_million);
  const scaled = microusdTimesMillion * BigInt(pricing.markup_percent);
  const divisor = 100n * 1_000_000n * BigInt(pricing.credit_microusd);
  return Number((scaled + divisor - 1n) / divisor);
}

/** The cost of a settled call in micro-USD before markup, for the internal record. */
export function costMicrousd(price: ModelPrice, usage: TokenUsage): number | null {
  const input = count(usage.input_tokens),
    cached = count(usage.cached_input_tokens ?? 0),
    output = count(usage.output_tokens);
  if (input === null || cached === null || output === null || cached > input) return null;
  const total =
    BigInt(input - cached) * BigInt(price.input_microusd_per_million) +
    BigInt(cached) * BigInt(price.cached_input_microusd_per_million) +
    BigInt(output) * BigInt(price.output_microusd_per_million);
  return Number((total + 999_999n) / 1_000_000n);
}

/** Credits for a call's reported usage; `null` when the usage cannot be read. */
export function chargeCredits(price: ModelPrice, usage: TokenUsage): number | null {
  const input = count(usage.input_tokens),
    cached = count(usage.cached_input_tokens ?? 0),
    output = count(usage.output_tokens);
  if (input === null || cached === null || output === null || cached > input) return null;
  return credits(price, input, cached, output);
}

/**
 * The most a call can cost: every input byte as an uncached token (a byte-level
 * tokenizer never emits more tokens than bytes) plus the full output cap.
 */
export function reservationCredits(price: ModelPrice, inputBytes: number, maxOutputTokens: number) {
  return Math.max(1, credits(price, inputBytes, 0, maxOutputTokens));
}

/** What an unreadable settlement charges: a fixed fallback, never above the hold. */
export function unknownUsageCredits(reserved: number) {
  return Math.min(reserved, pricing.unknown_usage_credits);
}
