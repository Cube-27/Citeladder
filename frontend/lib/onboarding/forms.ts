/**
 * Onboarding form contract.
 *
 * Onboarding replaces `/setup` entirely (plan.md §10, decision 11), so this
 * module owns what `lib/setup/forms.ts` used to: validating the create-a-project
 * input in the browser and mapping it to `ProjectInput`.
 *
 * It is deliberately much smaller than the setup schema was. Setup collected
 * aliases, owned domains, unintended domains, competitors, benchmark mode and
 * repetition defaults by hand across five steps. Onboarding *discovers* most of
 * that, so the only thing the user types is the brand and its site; everything
 * else arrives as an editable suggestion (decision 14).
 */
import { z } from 'zod';

import type { ProjectInput } from '@/lib/api/projects';

/** A competitor as it appears in the review step — always editable. */
export type ReviewCompetitor = {
  name: string;
  domains: string[];
  /** False when the user has deselected it; kept in the list so it can return. */
  selected: boolean;
};

export type ReviewPrompt = {
  text: string;
  /**
   * The topic the agent filed this prompt under. Carried through review so the
   * confirm chain can recreate the agent's topics as real `Topic` rows — the
   * same structure `/generate` produces. Empty means the agent gave it no
   * topic, and the prompt is created untopiced.
   */
  theme: string;
  intent: string;
  selected: boolean;
};

export type ReviewDomain = {
  domain: string;
  selected: boolean;
};

/**
 * Step 1 input. `website_url` is required here where setup treated it as
 * optional: discovery is only as good as the site it starts from, and an
 * onboarding flow with nothing to crawl produces suggestions the user will
 * reject. Asking for it once up front is cheaper than a bad first result.
 */
export const brandStepSchema = z.object({
  brand_name: z.string().trim().min(1, 'Enter your brand name').max(255, 'Brand name is too long'),
  website_url: z
    .string()
    .trim()
    .min(1, 'Enter your website')
    .max(2048, 'URL is too long')
    .refine((value) => /^https?:\/\/.+\./.test(value) || /^[^\s/]+\.[^\s/]+/.test(value), {
      message: 'Enter a valid website, e.g. example.com',
    }),
  country_code: z.string().trim().length(2, 'Pick a country'),
  language_code: z.string().trim().min(2, 'Pick a language'),
});

export type BrandStepValues = z.infer<typeof brandStepSchema>;

export const emptyBrandStep: BrandStepValues = {
  brand_name: '',
  website_url: '',
  country_code: 'US',
  language_code: 'en',
};

/**
 * Normalise whatever the user typed into an absolute URL. They will type
 * `example.com` far more often than `https://example.com`, and rejecting that
 * would be pedantry — the backend wants a URL, so we add the scheme.
 */
export function normalizeWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Registrable host, used for the derived-domain preview under the URL field. */
export function deriveDomain(input: string): string {
  const normalized = normalizeWebsiteUrl(input);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Build the `POST /projects` payload from the brand step plus the reviewed
 * selections. Unintended domains and per-competitor aliases are not collected —
 * nothing in onboarding produces them, and inventing empty arrays for fields the
 * user never saw is how the old form grew to five steps.
 */
export function onboardingToProjectInput(
  brand: BrandStepValues,
  competitors: ReviewCompetitor[],
  domains: ReviewDomain[],
): ProjectInput {
  const brandName = brand.brand_name.trim();
  return {
    name: brandName,
    brand_name: brandName,
    website_url: normalizeWebsiteUrl(brand.website_url),
    country_code: brand.country_code.trim().toUpperCase(),
    language_code: brand.language_code.trim(),
    // Onboarding does not ask for these — the old setup form's benchmark and
    // repetition steps are gone (decision 14). Both take the same defaults the
    // create form used, and both are editable later.
    benchmark_mode: 'consumer_like',
    default_repetitions: 3,
    brand: { aliases: [] },
    owned_domains: domains.filter((d) => d.selected).map((d) => d.domain),
    unintended_domains: [],
    competitors: competitors
      .filter((c) => c.selected)
      .map((c) => ({ name: c.name.trim(), aliases: [], domains: c.domains })),
  };
}

/**
 * Valid prompt intents. `PromptSuggestionItem.intent` is free text on the wire
 * (the backend casefolds and normalises it), but `PromptInput.intent` is the
 * strict enum — so a suggested intent has to be checked before it can be
 * written back, not cast. Anything unrecognised becomes `''` ("unspecified"),
 * which is exactly what the backend's own `normalize_intent` does.
 */
const PROMPT_INTENTS = ['', 'discovery', 'comparison', 'purchase', 'service', 'local'] as const;

export type PromptIntent = (typeof PROMPT_INTENTS)[number];

export function normalizeIntent(value: string): PromptIntent {
  const candidate = value.trim().toLowerCase();
  return (PROMPT_INTENTS as readonly string[]).includes(candidate)
    ? (candidate as PromptIntent)
    : '';
}

/**
 * Best-effort human message from a thrown mutation error. Mirrors the auth and
 * setup helpers: the transport unwraps a JSON `{ detail }` into `error.message`.
 */
export function onboardingErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
