/** Finite rates are persisted catalog terms, including retired historical revisions. */
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { catalog } from './catalog.ts';

const units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const rateSchema = z
  .strictObject({
    feature: z.literal('agent'),
    model: z.string().min(1).max(255),
    input_credits_per_million: units,
    cached_input_credits_per_million: units,
    output_credits_per_million: units,
    reasoning_credits_per_million: units,
    call_credit_cap: units.positive(),
    unknown_usage_charge: units.positive(),
  })
  .refine(
    (rate) =>
      rate.unknown_usage_charge <= rate.call_credit_cap &&
      [
        rate.input_credits_per_million,
        rate.cached_input_credits_per_million,
        rate.output_credits_per_million,
        rate.reasoning_credits_per_million,
      ].some((value) => value > 0),
  );
export const creditPolicy = z
  .strictObject({ version: z.string().min(1).max(64), rates: z.array(rateSchema) })
  .refine(
    (value) =>
      new Set(value.rates.map((rate) => `${rate.feature}:${rate.model}`)).size ===
      value.rates.length,
  );
export type CreditRate = z.infer<typeof rateSchema>;
export async function agentCreditRate(db: Database, model: string, revision?: string) {
  const saved = await catalog(db, revision);
  if (!saved.payload.ai_credit_policy) return { revision: saved.revision, rate: null };
  const parsed = creditPolicy.parse(saved.payload.ai_credit_policy);
  return {
    revision: saved.revision,
    rate: parsed.rates.find((rate) => rate.model === model) ?? null,
  };
}
export function chargeCredits(rate: CreditRate, usage: Record<string, unknown>): number | null {
  const token = (name: string, fallback?: number) => {
    const parsed = units.safeParse(Object.hasOwn(usage, name) ? usage[name] : fallback);
    return parsed.success ? parsed.data : null;
  };
  const input = token('input_tokens'),
    output = token('output_tokens');
  const cached = token('cached_input_tokens', 0),
    reasoning = token('reasoning_tokens', 0);
  if (input === null || output === null || cached === null || reasoning === null || cached > input)
    return null;
  const numerator =
    BigInt(Math.max(0, input - cached)) * BigInt(rate.input_credits_per_million) +
    BigInt(cached) * BigInt(rate.cached_input_credits_per_million) +
    BigInt(output) * BigInt(rate.output_credits_per_million) +
    BigInt(reasoning) * BigInt(rate.reasoning_credits_per_million);
  return Math.min(rate.call_credit_cap, Math.max(1, Number((numerator + 999999n) / 1000000n)));
}
