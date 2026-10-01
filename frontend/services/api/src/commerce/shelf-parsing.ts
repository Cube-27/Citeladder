import { z } from 'zod';
import { auditPolicy } from '../audits/config.ts';
import { searchPolicy } from '../search-surfaces/dataforseo.ts';
import { canonicalPage } from '../traffic/normalization.ts';
import { localizedPrice } from './projection-facts.ts';

export const shelfPolicy = auditPolicy.commerce_shelf;
export const boundedText = (text: string, limit: number) => [...text].slice(0, limit).join('');
type RecommendationSpan = { text: string; rank: number | null; orderObservable: boolean };
function recommendationSpans(answer: string): RecommendationSpan[] {
  const spans: RecommendationSpan[] = [];
  for (const line of answer.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/u)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    const ordered = /^(\d{1,2})[.)]\s+(.+)$/u.exec(cleaned);
    const bullet = /^[-*•]\s+(.+)$/u.exec(cleaned);
    if (ordered)
      spans.push({ text: ordered[2]!.trim(), rank: Number(ordered[1]), orderObservable: true });
    else if (bullet) spans.push({ text: bullet[1]!.trim(), rank: null, orderObservable: false });
    else if (spans.length) spans.at(-1)!.text += ` ${cleaned}`;
  }
  if (spans.length) return spans.slice(0, shelfPolicy.span_limit);
  const prose = answer
    .trim()
    .split(/(?<=[.!?])\s+|\s*;\s*/u)
    .filter(Boolean);
  return (prose.length ? prose : ['']).slice(0, shelfPolicy.span_limit).map((text) => ({
    text: boundedText(text.trim(), shelfPolicy.span_chars),
    rank: null,
    orderObservable: false,
  }));
}

/** Shelf matching retains Python casefold and punctuation rules, independently of brand aliases. */
function normalize(value: string) {
  return value
    .replaceAll(
      /./gsu,
      (character) =>
        searchPolicy.casefold_overrides[
          character as keyof typeof searchPolicy.casefold_overrides
        ] ?? character.toLowerCase(),
    )
    .replaceAll(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}
const productSchema = z.object({
  id: z.uuid(),
  canonical_url: z.string(),
  name: z.string(),
  brand: z.string(),
  gtin: z.string().nullish(),
  sku: z.string().nullish(),
  mpn: z.string().nullish(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});
const competitorSchema = z.object({
  id: z.uuid(),
  canonical_url: z.string(),
  product_name: z.string(),
  brand_name: z.string(),
});
export const frozenTargetSchema = z.object({
  kind: z.enum(['product', 'category']),
  id: z.uuid(),
  products: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const parsed = productSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
  approved_competitors: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const parsed = competitorSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});
export type FrozenShelfTarget = z.output<typeof frozenTargetSchema>;
export function matchRecommendation(text: string, target: FrozenShelfTarget) {
  const normalized = normalize(text);
  const contains = (value: string | null | undefined) =>
    Boolean(value && normalize(value) && normalized.includes(normalize(value)));
  for (const product of target.products) {
    if (
      [product.canonical_url, product.gtin, product.sku, product.mpn, product.name].some(contains)
    )
      return { product, competitor: null, confidence: 1 };
    if (
      contains(product.brand) &&
      Object.values(product.attributes).some(
        (value) =>
          (typeof value === 'string' || typeof value === 'number') && contains(String(value)),
      )
    )
      return { product, competitor: null, confidence: 0.9 };
  }
  for (const competitor of target.approved_competitors)
    if ([competitor.canonical_url, competitor.product_name, competitor.brand_name].some(contains))
      return { product: null, competitor, confidence: 1 };
  return { product: null, competitor: null, confidence: 0 };
}

export const resolvedBatchSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(512),
        brand: z.string().max(255).default(''),
        product_url: z.string().max(2048).default(''),
        merchant_url: z.string().max(2048).default(''),
        price: z.number().nonnegative().nullable().default(null),
        currency: z.string().max(3).default(''),
        surface_kind: z.enum(['recommendation', 'shopping_result']).default('recommendation'),
      }),
    )
    .max(shelfPolicy.result_limit),
});
type ResolvedRecommendation = z.output<typeof resolvedBatchSchema>['recommendations'][number];
export type ShelfResolver = { model: string; resolve(span: string): Promise<unknown> };
export type PreparedRecommendation = {
  span: RecommendationSpan;
  resolved: ResolvedRecommendation | null;
  model: string;
};
/** Only unresolved spans use the bounded resolver; unavailable output retains the original span. */
export async function prepareRecommendations(
  answer: string,
  target: FrozenShelfTarget,
  resolver?: ShelfResolver,
): Promise<PreparedRecommendation[]> {
  const prepared: PreparedRecommendation[] = [];
  for (const span of recommendationSpans(answer)) {
    const match = matchRecommendation(span.text, target);
    if (match.product || match.competitor || !resolver) {
      prepared.push({ span, resolved: null, model: '' });
      continue;
    }
    let recommendations: ResolvedRecommendation[] = [];
    try {
      recommendations = resolvedBatchSchema.parse(
        await resolver.resolve(boundedText(span.text, shelfPolicy.span_chars)),
      ).recommendations;
    } catch {
      /* Optional classification cannot erase unresolved evidence. */
    }
    if (!recommendations.length) prepared.push({ span, resolved: null, model: '' });
    for (const resolved of recommendations)
      prepared.push({
        span: recommendations.length > 1 ? { ...span, rank: null, orderObservable: false } : span,
        resolved,
        model: resolver.model,
      });
  }
  return prepared;
}

export function observedPrice(
  span: string,
  locale: string,
): { price: number | null; currency: string } {
  const match = /([$£€₹]|AUD|USD|CAD|NZD|GBP|EUR|INR)\s*(\d[\d,.]*)/iu.exec(span);
  if (!match) return { price: null, currency: '' };
  const marker = match[1]!.toUpperCase();
  const currencies = new Set(
    locale
      .toUpperCase()
      .split(/[-_]/u)
      .flatMap((part) => {
        const value =
          shelfPolicy.dollar_currencies[part as keyof typeof shelfPolicy.dollar_currencies];
        return value ? [value] : [];
      }),
  );
  const currency =
    marker === '$'
      ? currencies.size === 1
        ? [...currencies][0]!
        : ''
      : ({ '£': 'GBP', '€': 'EUR', '₹': 'INR' }[marker] ?? marker);
  return { price: localizedPrice(match[2]!), currency };
}
export function observedMerchant(span: string, resolved?: string) {
  const url = resolved?.trim() || /https?:\/\/[^\s)\]}>,]+/iu.exec(span)?.[0] || '';
  try {
    return { url, domain: new URL(url).hostname.toLowerCase() };
  } catch {
    return { url, domain: '' };
  }
}
/** A citation URL alone is insufficient evidence of an independently resolved competitor PDP. */
export function resolvedCompetitorUrl(url: string, citationUrls: string[]): string | null {
  const canonical = canonicalPage(url);
  if (!canonical || citationUrls.some((value) => canonicalPage(value) === canonical)) return null;
  const parsed = new URL(canonical);
  if (
    shelfPolicy.non_pdp_hosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    )
  )
    return null;
  if (shelfPolicy.excluded_paths.some((token) => parsed.pathname.toLowerCase().includes(token)))
    return null;
  return canonical;
}
