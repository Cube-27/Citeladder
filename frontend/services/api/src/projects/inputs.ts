import { benchmarkModeSchema } from '@citeladder/contracts/project';
import { z } from 'zod';

import { policy } from '../config.ts';

const cfg = policy.projects;
const profile = policy.brand_identity;
const text = (max: number) => z.string().trim().max(max);
const list = z.array(text(1024));
export const competitorInput = z.object({
  name: text(255).min(1),
  aliases: list.default([]),
  domains: list.default([]),
});
export const marketInput = text(8)
  .toUpperCase()
  .refine(
    (value) => Object.hasOwn(policy.discovery.constants.market_context_terms, value),
    'primary_market must be GLOBAL or a supported country code',
  );
const scalars = {
  name: text(255).min(1),
  brand_name: text(255).default(''),
  website_url: text(1024).default(''),
  industry: text(255).default('General'),
  subindustry: text(255).default(''),
  primary_market: marketInput.default('GLOBAL'),
  country_code: text(8).default(''),
  language_code: text(16).default(''),
  benchmark_mode: benchmarkModeSchema.default(
    cfg.default_benchmark_mode as z.infer<typeof benchmarkModeSchema>,
  ),
  default_repetitions: z
    .int()
    .min(cfg.min_repetitions)
    .max(cfg.max_repetitions)
    .default(cfg.default_repetitions),
};
const collections = {
  brand: z.object({ aliases: list.default([]) }).default({ aliases: [] }),
  owned_domains: list.default([]),
  unintended_domains: list.default([]),
  competitors: z.array(competitorInput).max(profile.max_project_competitors).default([]),
};
export const projectCreate = z.object({
  ...scalars,
  ...collections,
  description: text(profile.profile_text_max_chars).default(''),
  positioning: text(profile.profile_text_max_chars).default(''),
  target_audience: text(profile.profile_text_max_chars).default(''),
  products_services: z
    .array(text(profile.profile_product_max_chars))
    .max(profile.profile_products_max_count)
    .default([]),
  business_context: z
    .record(z.string(), z.unknown())
    .refine(
      (value) => Object.keys(value).length <= 32 && JSON.stringify(value).length <= 8000,
      'business_context is too large',
    )
    .default({}),
});
export const projectUpdate = z.object({
  name: scalars.name.optional(),
  brand_name: scalars.brand_name.unwrap().optional(),
  website_url: scalars.website_url.unwrap().optional(),
  industry: scalars.industry.unwrap().optional(),
  subindustry: scalars.subindustry.unwrap().optional(),
  primary_market: marketInput.optional(),
  country_code: scalars.country_code.unwrap().optional(),
  language_code: scalars.language_code.unwrap().optional(),
  benchmark_mode: benchmarkModeSchema.optional(),
  default_repetitions: scalars.default_repetitions.unwrap().optional(),
  brand: z.object({ aliases: list }).optional(),
  owned_domains: list.optional(),
  unintended_domains: list.optional(),
  competitors: collections.competitors.unwrap().optional(),
});
export type ProjectCreate = z.output<typeof projectCreate>;
export type ProjectUpdate = z.output<typeof projectUpdate>;

export function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}
