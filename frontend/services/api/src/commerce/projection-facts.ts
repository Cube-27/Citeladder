import { getDomain } from 'tldts';
import { z } from 'zod';
import { policy } from '../config.ts';
import { jsonObject } from '../db/json.ts';

const texts = z.array(z.string()).default([]);
const link = z.looseObject({
  url: z.string().default(''),
  title: z.string().default(''),
  region: z.string().default(''),
});
const product = z.looseObject({
  name: texts,
  description: texts,
  brand: texts,
  price: z.array(z.union([z.string(), z.number()])).default([]),
  price_currency: texts,
  sku: texts,
  gtin: texts,
  mpn: texts,
  category: texts,
  availability: texts,
  variants: z.array(z.unknown()).default([]),
});
const commerce = z.looseObject({
  breadcrumbs: texts,
  breadcrumb_links: z.array(link).default([]),
  product_cards: z.array(link).default([]),
  visible_price: z.string().default(''),
  visible_price_context: z.string().default(''),
  category_role: z.string().default('unknown'),
});
const factsSchema = z.looseObject({
  title: z.string().default(''),
  meta_description: z.string().default(''),
  canonical_url: z.string().default(''),
  structured_data: z.looseObject({ product: product.prefault({}) }).prefault({}),
  commerce: commerce.prefault({}),
  headings: z.looseObject({ h1_texts: texts }).prefault({}),
  links: z.looseObject({ anchors: z.array(link).default([]) }).prefault({}),
});
export type CatalogFacts = z.output<typeof factsSchema>;
export const readFacts = (value: unknown): CatalogFacts =>
  factsSchema.parse(jsonObject(value, 'site_fetch_artifacts.normalized_facts'));
const schemes = new Set<string>(policy.traffic.url_schemes);
const ports = new Set<number>(policy.traffic.url_ports);
const ignoredQueryKeys = new Set<string>(policy.traffic.ignored_query_keys);
const indexNames = new Set<string>(policy.commerce.breadcrumb_index_names);
const normalizeName = (name: string) => name.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
const named = (name: string) => /[\p{L}\p{N}]/u.test(name);

export function catalogUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    if (!schemes.has(url.protocol.slice(0, -1)) || url.username || url.password) return '';
    if (!ports.has(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (ignoredQueryKeys.has(key.toLowerCase())) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return '';
  }
}

export function pageIdentity(facts: CatalogFacts, base: string): string {
  const declared = facts.canonical_url ? catalogUrl(facts.canonical_url, base) : '';
  const domain = getDomain(base);
  return declared && domain && getDomain(declared) === domain ? declared : catalogUrl(base);
}

export function productAlias(value: string): string {
  const url = new URL(value);
  const match = /^\/collections\/[^/]+(\/products\/[^/]+)\/?$/u.exec(url.pathname);
  if (!match) return '';
  url.pathname = match[1]!;
  url.search = '';
  return url.href;
}

function finitePrice(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 999999999999.99 ? number : null;
}

/** Currency-qualified visible amounts; grouping must be unambiguous. */
function localizedPrice(raw: string): number | null {
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  const separator = lastDot > lastComma ? '.' : ',';
  const parts = raw.split(separator);
  const fraction = parts.at(-1)!;
  if (parts.length === 2 && /^[0-9]{1,2}$/u.test(fraction)) {
    const integer = parts[0]!;
    const groups = integer.split(separator === '.' ? ',' : '.');
    if (groups.length > 1 && !validGroups(groups)) return null;
    return finitePrice(`${groups.join('')}.${fraction}`);
  }
  if (parts.length > 1) return validGroups(parts) ? finitePrice(parts.join('')) : null;
  return /^[0-9]+$/u.test(raw) ? finitePrice(raw) : null;
}
function validGroups(groups: string[]): boolean {
  return (
    /^[0-9]{1,3}$/u.test(groups[0]!) && groups.slice(1).every((group) => /^[0-9]{3}$/u.test(group))
  );
}
const markerSource = policy.commerce.price_markers
  .map(([marker]) => marker!.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
  .join('|');
const visiblePattern = new RegExp(markerSource, 'giu');

function adjacentAmount(text: string, start: number, direction: 1 | -1): string {
  let index = start;
  while (index >= 0 && index < text.length && /\s/u.test(text[index]!)) index += direction;
  const boundary = index;
  while (index >= 0 && index < text.length && /[0-9,.]/u.test(text[index]!)) index += direction;
  return direction === 1 ? text.slice(boundary, index) : text.slice(index + 1, boundary + 1);
}

function visiblePrice(facts: CatalogFacts) {
  const { visible_price: text, visible_price_context: context } = facts.commerce;
  const surrounding = `${text} ${context}`.toLowerCase();
  if (policy.commerce.ambiguous_price_tokens.some((token) => surrounding.includes(token)))
    return { price: null, currency: '' };
  const amounts = [...text.matchAll(visiblePattern)].flatMap((match) => {
    const marker = match[0].toUpperCase();
    return [
      adjacentAmount(text, match.index + match[0].length, 1),
      adjacentAmount(text, match.index - 1, -1),
    ]
      .filter(Boolean)
      .map((amount) => ({ marker, amount }));
  });
  if (amounts.length !== 1) return { price: null, currency: '' };
  const { marker, amount } = amounts[0]!;
  return {
    price: localizedPrice(amount),
    currency:
      policy.commerce.price_markers.find(([value]) => value!.toUpperCase() === marker)?.[1] ?? '',
  };
}

export function productFacts(facts: CatalogFacts, url: string) {
  const p = facts.structured_data.product;
  const structuredPrice = finitePrice(p.price[0]);
  const visible = visiblePrice(facts);
  const price = structuredPrice ?? visible.price;
  const currency = p.price_currency[0] || visible.currency;
  const evidencePaths: Record<string, string> = {};
  if (price !== null)
    evidencePaths.price =
      structuredPrice === null ? 'commerce.visible_price' : 'structured_data.product.price';
  if (currency)
    evidencePaths.currency = p.price_currency[0]
      ? 'structured_data.product.price_currency'
      : 'commerce.visible_price';
  const values = {
    canonical_url: url,
    name: p.name[0] || facts.headings.h1_texts[0] || facts.title,
    description: p.description[0] || facts.meta_description,
    brand: p.brand[0] || '',
    price,
    currency,
    sku: p.sku[0] || '',
    gtin: p.gtin[0] || '',
    mpn: p.mpn[0] || '',
    variants: p.variants,
    attributes: p.availability.length ? { availability: p.availability } : {},
  };
  return {
    values,
    evidencePaths,
    identified: Boolean(values.sku || values.gtin || values.mpn || (values.name && price !== null)),
  };
}

export function categoryTitle(facts: CatalogFacts, fallback: string): string {
  const crumb = facts.commerce.breadcrumbs.filter(named).at(-1);
  const heading = facts.headings.h1_texts.find(named);
  const title = (facts.title || fallback).split(/\||–|—|·|»| - /u)[0]!.trim();
  return (crumb || heading || (named(title) ? title : 'Uncategorized')).trim().slice(0, 255);
}

export function productCategories(facts: CatalogFacts, url: string, aliases: string[]): string[] {
  const crumbs = facts.commerce.breadcrumbs
    .map((value) => value.trim().replaceAll(/\s+/gu, ' '))
    .filter(named);
  const ownUrls = new Set([url, ...aliases].map((value) => catalogUrl(value)).filter(Boolean));
  const base = aliases.find(Boolean) || url;
  let cursor = 0;
  const linked = new Set<number>();
  for (const link of facts.commerce.breadcrumb_links) {
    const position = crumbs.findIndex(
      (crumb, index) => index >= cursor && normalizeName(crumb) === normalizeName(link.title),
    );
    if (position < 0) continue;
    cursor = position + 1;
    const target = catalogUrl(link.url, base);
    if (target && !ownUrls.has(target) && !ownUrls.has(productAlias(target))) linked.add(position);
  }
  const ancestors = crumbs.slice(1, linked.has(crumbs.length - 1) ? undefined : -1);
  return [...new Set([...facts.structured_data.product.category, ...ancestors])].filter(
    (name) => named(name) && !indexNames.has(normalizeName(name)),
  );
}

export function shelfLinks(facts: CatalogFacts, base: string): string[] {
  const cards = facts.commerce.product_cards.filter((link) => link.url.trim());
  const links = cards.length ? cards : facts.links.anchors.filter((link) => link.region === 'main');
  return [...new Set(links.map((link) => catalogUrl(link.url, base)).filter(Boolean))];
}
