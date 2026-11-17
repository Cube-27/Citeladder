/**
 * Prompt search + filter model (F7). Pure functions so the toolbar stays
 * presentational and filtering is unit-testable.
 */
import type { CitedDomain, NamedBrand, Prompt } from '@citeladder/contracts';

/** Tri-state for the enabled / branded filters. */
export type EnabledFilter = 'all' | 'enabled' | 'disabled';

export type PromptFilters = {
  /** Selected intents (empty = all intents). */
  intents: string[];
  /** Selected buyer stages (empty = all stages). */
  stages: string[];
  /** Selected personas (empty = all personas). */
  personas: string[];
  /** Selected brands by `brandKey` (empty = all brands). */
  brands: string[];
  /** Selected cited domains (empty = all sources). */
  sources: string[];
  enabled: EnabledFilter;
  branded: EnabledFilter;
};

export const emptyFilters: PromptFilters = {
  intents: [],
  stages: [],
  personas: [],
  brands: [],
  sources: [],
  enabled: 'all',
  branded: 'all',
};

/** What a prompt's latest measured answers named and cited. */
export type PromptMentions = Readonly<{
  named: readonly Pick<NamedBrand, 'kind' | 'name'>[];
  /** Most citations first. */
  sources: readonly CitedDomain[];
}>;

type FilterOption = Readonly<{ value: string; label: string }>;

/** How many cited domains a row shows before its "+N". */
const LEADING_SOURCES = 3;

/** The personas the library uses, for the filter menu; untagged prompts add none. */
export function personaOptions(prompts: readonly Prompt[]): string[] {
  return [...new Set(prompts.map((prompt) => prompt.persona).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * A named brand's filter value. The tracked brand is one value whatever name an
 * older run recorded; a competitor is its name, matched as the API resolves
 * names (whitespace-collapsed, lowercased).
 */
export function brandKey(brand: Pick<NamedBrand, 'kind' | 'name'>): string {
  if (brand.kind === 'brand') return 'brand';
  return `competitor:${brand.name.trim().replace(/\s+/gu, ' ').toLowerCase()}`;
}

/** The project's brand, then its tracked competitors, for the Brands filter. */
export function brandOptions(project: {
  brand_name: string;
  competitors: readonly { name: string }[];
}): FilterOption[] {
  const options = new Map([['brand', project.brand_name]]);
  for (const { name } of project.competitors) {
    const key = brandKey({ kind: 'competitor', name });
    if (!options.has(key)) options.set(key, name);
  }
  return [...options].map(([value, label]) => ({ value, label }));
}

/** Every domain the measured answers cited, most citations first; the project's own marked. */
export function sourceOptions(mentions: Iterable<PromptMentions>): FilterOption[] {
  const totals = new Map<string, { citations: number; owned: boolean }>();
  for (const { sources } of mentions)
    for (const { domain, citations, owned } of sources) {
      const total = totals.get(domain);
      totals.set(domain, {
        citations: (total?.citations ?? 0) + citations,
        owned: Boolean(total?.owned) || owned,
      });
    }
  return [...totals]
    .sort(([left, a], [right, b]) => b.citations - a.citations || left.localeCompare(right))
    .map(([domain, { owned }]) => ({ value: domain, label: owned ? `${domain} (yours)` : domain }));
}

/** A row's leading cited domains and how many more it cited. */
export function leadingSources(sources: readonly CitedDomain[]): {
  shown: readonly CitedDomain[];
  more: number;
} {
  return {
    shown: sources.slice(0, LEADING_SOURCES),
    more: Math.max(0, sources.length - LEADING_SOURCES),
  };
}

function matchesTriState(value: boolean, filter: EnabledFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'enabled' ? value : !value;
}

/** Whether any selected value is among a prompt's; nothing selected keeps every prompt. */
function matchesAny(selected: ReadonlySet<string>, values: readonly string[] | undefined) {
  return selected.size === 0 || Boolean(values?.some((value) => selected.has(value)));
}

/**
 * Apply search + filters to a prompt list, preserving order. The Brands and
 * Sources filters read each prompt's latest measurement: a prompt no run
 * measured has named and cited nothing, so either filter leaves it out.
 */
export function filterPrompts({
  prompts,
  search,
  filters,
  mentions,
}: Readonly<{
  prompts: Prompt[];
  search: string;
  filters: PromptFilters;
  mentions?: ReadonlyMap<string, PromptMentions>;
}>): Prompt[] {
  const needle = search.trim().toLowerCase();
  const intentSet = new Set(filters.intents);
  const stageSet = new Set(filters.stages);
  const personaSet = new Set(filters.personas);
  const brandSet = new Set(filters.brands);
  const sourceSet = new Set(filters.sources);
  return prompts.filter((prompt) => {
    if (needle) {
      const haystack = `${prompt.text} ${prompt.theme ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (intentSet.size > 0 && !intentSet.has(prompt.intent)) return false;
    if (stageSet.size > 0 && !stageSet.has(prompt.buyer_stage)) return false;
    if (personaSet.size > 0 && !personaSet.has(prompt.persona)) return false;
    if (!matchesTriState(prompt.enabled, filters.enabled)) return false;
    if (!matchesTriState(prompt.branded, filters.branded)) return false;
    const measured = mentions?.get(prompt.id);
    if (!matchesAny(brandSet, measured?.named.map(brandKey))) return false;
    return matchesAny(
      sourceSet,
      measured?.sources.map((source) => source.domain),
    );
  });
}
